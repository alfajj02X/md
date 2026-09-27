// POST /create-payment-order
// Body: { booking_id: string, purpose: "booking_fee" | "final_amount" }
// Creates a Razorpay order for the authoritative amount read from the DB
// (the client never dictates the amount). Idempotent via idempotency key.
//
// Auth: the caller's JWT. Service-role client performs the writes.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';
import { createRazorpayOrder } from '../_shared/razorpay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return errorResponse('Unauthorized', 401);

    const { booking_id, purpose } = await req.json();
    if (!booking_id || !['booking_fee', 'final_amount'].includes(purpose)) {
      return errorResponse('booking_id and valid purpose are required');
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: booking, error: bErr } = await admin
      .from('bookings')
      .select('id, customer_id, status, booking_fee_paise, booking_fee_status, approved_amount_paise, payment_method, final_payment_status')
      .eq('id', booking_id)
      .single();
    if (bErr || !booking) return errorResponse('Booking not found', 404);
    if (booking.customer_id !== user.id) return errorResponse('Not your booking', 403);

    let amountPaise: number;
    let method: 'upi' = 'upi';
    if (purpose === 'booking_fee') {
      if (booking.booking_fee_status === 'paid') return errorResponse('Booking fee already paid', 409);
      amountPaise = booking.booking_fee_paise;
    } else {
      if (booking.payment_method !== 'upi') return errorResponse('Booking is not set to UPI', 409);
      if (booking.final_payment_status === 'paid') return errorResponse('Already paid', 409);
      if (!booking.approved_amount_paise) return errorResponse('No approved amount yet', 409);
      amountPaise = booking.approved_amount_paise;
    }

    // Idempotency: one pending order per (booking, purpose); reuse it.
    const idempotencyKey = `order:${booking_id}:${purpose}`;
    const { data: existing } = await admin
      .from('payments')
      .select('id, razorpay_order_id, status, amount_paise')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing?.razorpay_order_id && existing.status === 'pending') {
      return corsResponse({
        order_id: existing.razorpay_order_id,
        amount_paise: existing.amount_paise,
        key_id: Deno.env.get('RAZORPAY_KEY_ID'),
      });
    }

    const receipt = `md_${booking_id.slice(0, 8)}_${purpose}_${Date.now()}`;
    const order = await createRazorpayOrder({
      amountPaise,
      receipt,
      notes: { booking_id, purpose },
    });

    await admin.from('payments').upsert(
      {
        booking_id,
        purpose,
        amount_paise: amountPaise,
        method,
        status: 'pending',
        idempotency_key: idempotencyKey,
        razorpay_order_id: order.id,
        raw: { receipt },
      },
      { onConflict: 'idempotency_key' },
    );

    return corsResponse({
      order_id: order.id,
      amount_paise: amountPaise,
      key_id: Deno.env.get('RAZORPAY_KEY_ID'),
    });
  } catch (e) {
    console.error('create-payment-order failed', e);
    return errorResponse('Could not create payment order', 500);
  }
});
