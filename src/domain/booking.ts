/**
 * Canonical booking state machine for Mechanic Dekho.
 *
 * ONE transition policy lives here. UI, stores, and Supabase helpers must
 * consult it; the backend (RLS + RPC/Edge Functions) is the final authority
 * and enforces the same map server-side. Never mutate booking status from an
 * arbitrary screen — go through the domain transition functions.
 */

export type BookingStatus =
  | 'pending'
  | 'offer'
  | 'assigned'
  | 'on_the_way'
  | 'arrived'
  | 'awaiting_start_otp'
  | 'in_service'
  | 'awaiting_amount_approval'
  | 'awaiting_payment'
  | 'completed'
  | 'cancelled'
  | 'rescheduled'
  | 'provider_unavailable'
  | 'refund_pending'
  | 'refunded';

/**
 * Allowed transitions. Policy notes:
 * - Customer cancellation is permitted until provider arrival (pending..on_the_way).
 * - offer -> pending happens on provider timeout/decline so the next
 *   eligible provider can be offered (auto-assignment requeue).
 * - offer -> provider_unavailable when no eligible providers remain; an admin
 *   can requeue it back to pending for manual assignment.
 * - awaiting_start_otp -> arrived lets the customer regenerate an expired OTP.
 * - awaiting_amount_approval -> in_service lets the customer request a revision;
 *   the provider then submits a NEW revision (history preserved, never edited).
 * - rescheduled -> pending carries the booking to its new slot.
 */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['offer', 'assigned', 'cancelled', 'rescheduled', 'provider_unavailable'],
  offer: ['assigned', 'pending', 'cancelled', 'provider_unavailable'],
  assigned: ['on_the_way', 'cancelled', 'rescheduled'],
  on_the_way: ['arrived', 'cancelled'],
  arrived: ['awaiting_start_otp'],
  awaiting_start_otp: ['in_service', 'arrived'],
  in_service: ['awaiting_amount_approval'],
  awaiting_amount_approval: ['awaiting_payment', 'in_service'],
  awaiting_payment: ['completed'],
  completed: ['refund_pending'],
  cancelled: [],
  rescheduled: ['pending'],
  provider_unavailable: ['pending'],
  refund_pending: ['refunded'],
  refunded: [],
};

const TERMINAL: ReadonlySet<BookingStatus> = new Set([
  'cancelled',
  'refunded',
]);

/** Human-readable labels for UI. Never rely on color alone for status. */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Finding professional',
  offer: 'Offer sent to professional',
  assigned: 'Professional assigned',
  on_the_way: 'Professional on the way',
  arrived: 'Professional arrived',
  awaiting_start_otp: 'Waiting for start OTP',
  in_service: 'Service in progress',
  awaiting_amount_approval: 'Waiting for amount approval',
  awaiting_payment: 'Waiting for payment',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
  provider_unavailable: 'No professional available',
  refund_pending: 'Refund in progress',
  refunded: 'Refunded',
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class IllegalBookingTransitionError extends Error {
  readonly from: BookingStatus;
  readonly to: BookingStatus;
  constructor(from: BookingStatus, to: BookingStatus) {
    super(`Illegal booking transition: ${from} -> ${to}`);
    this.name = 'IllegalBookingTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** Assert a transition is legal; throws IllegalBookingTransitionError otherwise. */
export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalBookingTransitionError(from, to);
  }
}

/** Terminal states: no further transitions allowed. */
export function isTerminalStatus(status: BookingStatus): boolean {
  return TERMINAL.has(status);
}

/** Booking is live (customer/provider should see tracking UI). */
export function isActiveBooking(status: BookingStatus): boolean {
  return (
    status === 'offer' ||
    status === 'assigned' ||
    status === 'on_the_way' ||
    status === 'arrived' ||
    status === 'awaiting_start_otp' ||
    status === 'in_service' ||
    status === 'awaiting_amount_approval' ||
    status === 'awaiting_payment'
  );
}

/** All statuses, useful for exhaustive switch checks. */
export const ALL_BOOKING_STATUSES = Object.keys(TRANSITIONS) as BookingStatus[];
