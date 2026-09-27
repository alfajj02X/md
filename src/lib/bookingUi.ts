import type { BookingStatus, KycStatus } from '../supabase/types';

/** Human labels for booking states. Status is never color-only: label always shown. */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Finding a professional',
  offer: 'Offer sent to professional',
  assigned: 'Professional assigned',
  on_the_way: 'On the way',
  arrived: 'Arrived at your location',
  awaiting_start_otp: 'Waiting for start code',
  in_service: 'Service in progress',
  awaiting_amount_approval: 'Approve the final amount',
  awaiting_payment: 'Payment pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
  provider_unavailable: 'No professional available',
  refund_pending: 'Refund in progress',
  refunded: 'Refunded',
};

export const BOOKING_STATUS_TONE: Record<
  BookingStatus,
  'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'error'
> = {
  pending: 'info',
  offer: 'info',
  assigned: 'primary',
  on_the_way: 'primary',
  arrived: 'primary',
  awaiting_start_otp: 'warning',
  in_service: 'primary',
  awaiting_amount_approval: 'warning',
  awaiting_payment: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  rescheduled: 'neutral',
  provider_unavailable: 'error',
  refund_pending: 'warning',
  refunded: 'neutral',
};

/** States where the customer may still cancel (per domain/booking.ts). */
export const CUSTOMER_CANCELLABLE: BookingStatus[] = [
  'pending',
  'offer',
  'assigned',
  'on_the_way',
  'arrived',
  'awaiting_start_otp',
];

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  not_started: 'Not started',
  submitted: 'Submitted for review',
  under_review: 'Under review',
  changes_required: 'Changes required',
  approved: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export function bookingStatusLabel(s: BookingStatus): string {
  return BOOKING_STATUS_LABELS[s] ?? s;
}
