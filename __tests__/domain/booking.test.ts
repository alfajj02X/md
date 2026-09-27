import {
  ALL_BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  IllegalBookingTransitionError,
  assertTransition,
  canTransition,
  isActiveBooking,
  isTerminalStatus,
  type BookingStatus,
} from '../../src/domain/booking';

describe('booking state machine', () => {
  test('happy path: full customer journey transitions are legal', () => {
    const journey: BookingStatus[] = [
      'pending',
      'offer',
      'assigned',
      'on_the_way',
      'arrived',
      'awaiting_start_otp',
      'in_service',
      'awaiting_amount_approval',
      'awaiting_payment',
      'completed',
    ];
    for (let i = 0; i < journey.length - 1; i++) {
      expect(canTransition(journey[i], journey[i + 1])).toBe(true);
    }
  });

  test('illegal transitions are rejected', () => {
    expect(canTransition('pending', 'completed')).toBe(false);
    expect(canTransition('completed', 'pending')).toBe(false);
    expect(canTransition('in_service', 'completed')).toBe(false);
    expect(canTransition('arrived', 'completed')).toBe(false);
    // customer cannot cancel after arrival per policy
    expect(canTransition('arrived', 'cancelled')).toBe(false);
    expect(canTransition('in_service', 'cancelled')).toBe(false);
    expect(() => assertTransition('pending', 'completed')).toThrow(
      IllegalBookingTransitionError,
    );
  });

  test('offer timeout requeues to pending; exhaustion marks unavailable', () => {
    expect(canTransition('offer', 'pending')).toBe(true);
    expect(canTransition('offer', 'provider_unavailable')).toBe(true);
    expect(canTransition('provider_unavailable', 'pending')).toBe(true);
  });

  test('stale pending bookings expire to provider_unavailable', () => {
    // The auto-assign scheduler (pg_cron) moves bookings that waited > 45
    // minutes without a provider to provider_unavailable.
    expect(canTransition('pending', 'provider_unavailable')).toBe(true);
  });

  test('OTP expiry allows regeneration via arrived', () => {
    expect(canTransition('awaiting_start_otp', 'arrived')).toBe(true);
    expect(canTransition('awaiting_start_otp', 'in_service')).toBe(true);
  });

  test('amount revision returns to in_service, never edits history', () => {
    expect(canTransition('awaiting_amount_approval', 'in_service')).toBe(true);
    expect(canTransition('awaiting_amount_approval', 'awaiting_payment')).toBe(true);
  });

  test('reschedule carries booking back to pending', () => {
    expect(canTransition('pending', 'rescheduled')).toBe(true);
    expect(canTransition('assigned', 'rescheduled')).toBe(true);
    expect(canTransition('rescheduled', 'pending')).toBe(true);
  });

  test('refund flows through refund_pending', () => {
    expect(canTransition('completed', 'refund_pending')).toBe(true);
    expect(canTransition('refund_pending', 'refunded')).toBe(true);
    expect(canTransition('completed', 'refunded')).toBe(false);
  });

  test('terminal states have no outgoing transitions', () => {
    const terminals: BookingStatus[] = ['cancelled', 'refunded'];
    for (const t of terminals) {
      expect(isTerminalStatus(t)).toBe(true);
      for (const s of ALL_BOOKING_STATUSES) {
        expect(canTransition(t, s)).toBe(false);
      }
    }
    // completed is service-complete but may still flow into a refund
    expect(isTerminalStatus('completed')).toBe(false);
    expect(canTransition('completed', 'refund_pending')).toBe(true);
    expect(isTerminalStatus('in_service')).toBe(false);
  });

  test('active bookings drive the tracking UI', () => {
    expect(isActiveBooking('on_the_way')).toBe(true);
    expect(isActiveBooking('awaiting_payment')).toBe(true);
    expect(isActiveBooking('pending')).toBe(false);
    expect(isActiveBooking('completed')).toBe(false);
  });

  test('every status has a label (never color-only)', () => {
    for (const s of ALL_BOOKING_STATUSES) {
      expect(BOOKING_STATUS_LABELS[s]).toBeTruthy();
    }
  });
});
