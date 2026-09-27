// POST /razorpay-webhook
// Verifies the Razorpay webhook signature and applies the payment result.
// This is the ONLY source of truth for UPI payments — the mobile SDK result
// alone never marks a payment paid.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';
import { verifyWebhookSignature } from '../_shared/razorpay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';
  try {
    if (!(await verifyWebhookSignature(rawBody, signature))) {
      return errorResponse('Invalid signature', 401);
    }
  } catch (e) {
    console.error('webhook signature check failed', e);
    return errorResponse('Signature check failed', 500);
  }

  const event = JSON.parse(rawBody);
  const type: string = event.event ?? '';
  if (type !== 'payment.captured' && type !== 'payment.failed') {
    return corsResponse({ ignored: type });
  }

  const entity = event.payload?.payment?.entity ?? {};
  const orderId: string | undefined = entity.order_id;
  const paymentId: string | undefined = entity.id;
  if (!orderId) return errorResponse('Missing order_id', 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: payment } = await admin
    .from('payments')
    .select('id, booking_id, purpose, amount_paise, status')
    .eq('razorpay_order_id', orderId)
    .maybeSingle();
  if (!payment) return errorResponse('Unknown order', 404);
  if (payment.status === 'paid') return corsResponse({ already: true });

  if (type === 'payment.failed') {
    await admin.from('payments').update({
      status: 'failed',
      razorpay_payment_id: paymentId ?? null,
      failure_reason: entity.error_description ?? 'payment failed',
      raw: event,
    }).eq('id', payment.id);
    return corsResponse({ ok: true });
  }

  // payment.captured — verify the captured amount matches what we asked for.
  if (entity.amount !== payment.amount_paise || entity.currency !== 'INR') {
    console.error('amount mismatch', { expected: payment.amount_paise, got: entity.amount });
    return errorResponse('Amount mismatch', 400);
  }

  await admin.from('payments').update({
    status: 'paid',
    razorpay_payment_id: paymentId ?? null,
    razorpay_signature: signature,
    raw: event,
  }).eq('id', payment.id);

  if (payment.purpose === 'booking_fee') {
    await admin.from('bookings')
      .update({ booking_fee_status: 'paid' })
      .eq('id', payment.booking_id);
  } else {
    // Final UPI payment: mark paid, write immutable ledger entries, complete.
    const { data: booking } = await admin
      .from('bookings')
      .select('id, customer_id, provider_id, approved_amount_paise, status')
      .eq('id', payment.booking_id)
      .single();
    if (booking?.provider_id && booking.approved_amount_paise) {
      const { data: settings } = await admin
        .from('platform_settings')
        .select('key, value')
        .in('key', ['platform_commission_bps']);
      const bps = Number(settings?.[0]?.value?.value ?? 1000);
      const commission = Math.round((booking.approved_amount_paise * bps) / 10000);
      const net = booking.approved_amount_paise - commission;
      const { data: pp } = await admin
        .from('provider_profiles')
        .select('cash_liability_paise')
        .eq('provider_id', booking.provider_id)
        .single();
      const liability = pp?.cash_liability_paise ?? 0; // platform collected; liability unchanged
      await admin.from('ledger_entries').insert([
        { provider_id: booking.provider_id, booking_id: booking.id, type: 'service_earning', amount_paise: net, cash_liability_after_paise: liability, note: 'Service earning (UPI, net of commission)' },
        { provider_id: booking.provider_id, booking_id: booking.id, type: 'commission', amount_paise: commission, cash_liability_after_paise: liability, note: 'Platform commission' },
        { provider_id: booking.provider_id, booking_id: booking.id, type: 'platform_collection', amount_paise: booking.approved_amount_paise, cash_liability_after_paise: liability, note: 'UPI collected to platform account' },
      ]);
      await admin.from('bookings').update({ final_payment_status: 'paid' }).eq('id', booking.id);
      // Complete via the guarded transition path.
      await admin.rpc('admin_complete_booking_upi', { p_booking_id: booking.id });
    }
  }
  return corsResponse({ ok: true });
});
