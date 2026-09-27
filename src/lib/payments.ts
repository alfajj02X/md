/**
 * Razorpay payment orchestration for the customer app.
 *
 * Security model:
 * - Amounts ALWAYS come from the `create-payment-order` edge function, which
 *   reads the authoritative paise amount from the database. The client never
 *   dictates an amount.
 * - The Razorpay webhook (server-side, signature-verified) is the ONLY source
 *   of truth that marks a payment paid. A successful checkout on the device
 *   alone never flips payment state.
 */
import { getSupabase } from '../supabase/client';

export type PaymentPurpose = 'booking_fee' | 'final_amount';

export interface PaymentOrder {
  order_id: string;
  amount_paise: number;
  key_id: string;
}

export interface CheckoutResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature?: string;
}

/** Ask the edge function for a Razorpay order at the DB-authoritative amount. */
export async function createPaymentOrder(
  bookingId: string,
  purpose: PaymentPurpose,
): Promise<PaymentOrder> {
  const { data, error } = await getSupabase().functions.invoke('create-payment-order', {
    body: { booking_id: bookingId, purpose },
  });
  if (error) throw new Error('Could not start the payment. Please try again.');
  const order = data as Partial<PaymentOrder>;
  if (!order?.order_id || !order?.key_id || typeof order?.amount_paise !== 'number') {
    throw new Error('Could not start the payment. Please try again.');
  }
  return order as PaymentOrder;
}

interface RazorpayModule {
  open: (options: Record<string, unknown>) => Promise<{
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature?: string;
  }>;
}

/**
 * Dynamically load react-native-razorpay. The module name is passed through a
 * variable (not a string literal) so Metro does not fail the bundle when the
 * native module is not installed yet.
 */
function loadRazorpay(): RazorpayModule | null {
  try {
    const moduleName = 'react-native-razorpay';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(moduleName) as { default?: RazorpayModule } | RazorpayModule;
    const resolved = (mod as { default?: RazorpayModule }).default ?? (mod as RazorpayModule);
    return typeof resolved?.open === 'function' ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * Open the Razorpay checkout for an order. Resolves with the payment result;
 * rejects when the user cancels or the payment fails.
 */
export async function openRazorpayCheckout(
  order: PaymentOrder,
  prefill: { contact?: string; name?: string },
): Promise<CheckoutResult> {
  const RazorpayCheckout = loadRazorpay();
  if (!RazorpayCheckout) {
    if (__DEV__) {
      // TODO(PROD-PAYMENTS): `npx expo install react-native-razorpay` and
      // make a dev build — Expo Go cannot carry the native module. This dev
      // stub simulates a successful checkout ONLY so the booking flow can be
      // exercised end-to-end locally. It does NOT mark anything paid: the
      // server-side Razorpay webhook remains the single source of truth, so
      // in dev the booking fee stays "unpaid" until the webhook fires (test it
      // from the Razorpay dashboard) or the row is updated manually.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return {
        razorpay_payment_id: `pay_dev_${Date.now()}`,
        razorpay_order_id: order.order_id,
      };
    }
    throw new Error('Online payment is not available in this build yet. Please pay cash.');
  }
  const result = await RazorpayCheckout.open({
    description: 'Mechanic Dekho service payment',
    currency: 'INR',
    key: order.key_id,
    amount: String(order.amount_paise),
    name: 'Mechanic Dekho',
    order_id: order.order_id,
    prefill: {
      contact: prefill.contact ?? '',
      name: prefill.name ?? '',
    },
    theme: { color: '#0E7C66' },
  });
  return {
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_order_id: result.razorpay_order_id,
    razorpay_signature: result.razorpay_signature,
  };
}

/** Full flow: create the order, then open checkout. */
async function pay(
  bookingId: string,
  purpose: PaymentPurpose,
  prefill: { contact?: string; name?: string },
): Promise<CheckoutResult> {
  const order = await createPaymentOrder(bookingId, purpose);
  return openRazorpayCheckout(order, prefill);
}

/** Collect the ₹49 booking fee. */
export function payBookingFee(
  bookingId: string,
  prefill: { contact?: string; name?: string },
): Promise<CheckoutResult> {
  return pay(bookingId, 'booking_fee', prefill);
}

/** Collect the approved final amount after service completion. */
export function payFinalAmount(
  bookingId: string,
  prefill: { contact?: string; name?: string },
): Promise<CheckoutResult> {
  return pay(bookingId, 'final_amount', prefill);
}
