import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
  Stars,
  TextField,
} from '@/ui/components';
import { colors, radii, spacing, typography } from '@/ui/theme';
import { BOOKING_FEE_PAISE } from '@/domain/config';
import { paiseToDisplay } from '@/domain/money';
import {
  formatSlot,
  useApproveFinalAmount,
  useBooking,
  useBookingSubscription,
  useCancelBooking,
  useIssueStartOtp,
  useProviderCard,
  useRequestAmountRevision,
  useSubmitReview,
  type BookingDetailData,
} from '@/lib/customer';
import { payBookingFee, payFinalAmount } from '@/lib/payments';
import { BOOKING_STATUS_TONE, CUSTOMER_CANCELLABLE, bookingStatusLabel } from '@/lib/bookingUi';
import { useAuth } from '@/stores/auth';

// ── Small pieces ──────────────────────────────────────────────────────────

function Timeline({ booking }: { booking: BookingDetailData }) {
  if (booking.events.length === 0) return null;
  return (
    <Card variant="outlined" style={styles.card}>
      <Text style={styles.cardTitle}>Updates</Text>
      {booking.events.map((e, i) => (
        <View key={e.id} style={styles.eventRow}>
          <View style={styles.eventRail}>
            <View style={styles.eventDot} />
            {i < booking.events.length - 1 && <View style={styles.eventLine} />}
          </View>
          <View style={styles.eventBody}>
            <Text style={styles.eventLabel}>{bookingStatusLabel(e.to_status)}</Text>
            <Text style={styles.eventTime}>
              {new Date(e.created_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

function ProviderCard({ booking }: { booking: BookingDetailData }) {
  const assigned = Boolean(booking.provider_id);
  const card = useProviderCard(booking.id, assigned);
  const provider = card.data;
  return (
    <Card variant="outlined" style={styles.card}>
      <Text style={styles.cardTitle}>Professional</Text>
      {assigned ? (
        <>
          <Text style={styles.bodyStrong}>
            {provider?.display_name ?? 'Verified professional assigned'}
          </Text>
          {card.isLoading ? (
            <Skeleton height={14} width="60%" />
          ) : provider && provider.rating_count > 0 ? (
            <View style={styles.ratingRow}>
              <Stars value={Number(provider.rating_avg)} />
              <Text style={styles.muted}>
                {Number(provider.rating_avg).toFixed(1)} · {provider.completed_jobs} jobs done
              </Text>
            </View>
          ) : (
            <Text style={styles.muted}>Verified professional</Text>
          )}
          <Text style={styles.muted}>
            Your professional has accepted this job and can see your address and contact
            details.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.bodyStrong}>Finding a professional…</Text>
          <Text style={styles.muted}>
            We&apos;re matching your booking with verified professionals nearby. This usually
            takes a few minutes.
          </Text>
        </>
      )}
    </Card>
  );
}

function FeeCard({ booking }: { booking: BookingDetailData }) {
  const queryClient = useQueryClient();
  const phone = useAuth((s) => s.session?.user.phone);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (booking.booking_fee_status === 'paid') return null;

  const onPay = async () => {
    setPaying(true);
    setError(undefined);
    try {
      await payBookingFee(booking.id, { contact: phone ?? undefined });
      await queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment did not complete. Try again.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <Card variant="outlined" style={[styles.card, styles.warnCard]}>
      <Text style={styles.cardTitle}>Booking fee pending</Text>
      <Text style={styles.muted}>
        Pay the {paiseToDisplay(BOOKING_FEE_PAISE)} booking fee to confirm your slot. A
        professional is assigned only after the fee is paid.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={`Pay ${paiseToDisplay(BOOKING_FEE_PAISE)}`} onPress={onPay} loading={paying} />
    </Card>
  );
}

/**
 * Start-code card. Per the backend contract the CUSTOMER generates the
 * 6-digit code (issue_start_otp requires customer_id = auth.uid()) and reads
 * it aloud to the professional, who enters it to start the service. The
 * professional is notified in-app that a code is ready.
 */
function OtpCard({ booking }: { booking: BookingDetailData }) {
  const queryClient = useQueryClient();
  const issueOtp = useIssueStartOtp();
  const [code, setCode] = useState<string | null>(null);

  if (booking.status !== 'arrived' && booking.status !== 'awaiting_start_otp') return null;

  const onIssue = async () => {
    setCode(null);
    try {
      const c = await issueOtp.mutateAsync(booking.id);
      setCode(c);
      await queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
    } catch {
      // error surfaces via issueOtp.error below
    }
  };

  return (
    <Card variant="outlined" style={[styles.card, styles.infoCard]}>
      <Text style={styles.cardTitle}>Start code</Text>
      {code ? (
        <>
          <Text style={styles.otpCode} accessibilityLabel={`Start code ${code.split('').join(' ')}`}>
            {code}
          </Text>
          <Text style={styles.muted}>
            Read this 6-digit code to the professional. It expires in 10 minutes — only
            share it when they are at your door.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.muted}>
            {booking.status === 'arrived'
              ? 'The professional has arrived. Generate a one-time code and read it to them to start the service.'
              : 'A code was already issued. Generate a new one if the previous expired.'}
          </Text>
          {issueOtp.error ? (
            <Text style={styles.error}>{(issueOtp.error as Error).message}</Text>
          ) : null}
          <Button
            title={booking.status === 'arrived' ? 'Generate start code' : 'Generate new code'}
            onPress={onIssue}
            loading={issueOtp.isPending}
          />
        </>
      )}
    </Card>
  );
}

function AmountApprovalCard({ booking }: { booking: BookingDetailData }) {
  const approve = useApproveFinalAmount();
  const requestRevision = useRequestAmountRevision();
  const [method, setMethod] = useState<'upi' | 'cash' | null>(null);

  const rev = booking.latestRevision;
  if (booking.status !== 'awaiting_amount_approval' || !rev || rev.status !== 'pending') {
    return null;
  }

  const onApprove = () => {
    if (!method) return;
    approve.mutate({ bookingId: booking.id, revisionId: rev.id, method });
  };

  const rows: [string, number, boolean?][] = (
    [
      ['Labour', rev.labour_paise],
      ['Parts', rev.parts_paise],
      ['Additional', rev.additional_paise],
      ['Discount', -rev.discount_paise, true],
    ] as [string, number, boolean?][]
  ).filter(([, paise]) => paise !== 0);

  return (
    <Card variant="outlined" style={[styles.card, styles.warnCard]}>
      <Text style={styles.cardTitle}>Approve final amount</Text>
      <Text style={styles.muted}>
        The professional has quoted the final amount after inspection. Review it before
        approving.
      </Text>
      <View style={styles.amountRows}>
        {rows.map(([label, paise, isDiscount]) => (
          <View key={label} style={styles.amountRow}>
            <Text style={styles.muted}>{label}</Text>
            <Text style={[styles.bodyStrong, isDiscount && styles.discount]}>
              {isDiscount ? '−' : ''}
              {paiseToDisplay(Math.abs(paise))}
            </Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.amountRow}>
          <Text style={styles.bodyStrong}>Total</Text>
          <Text style={styles.total}>{paiseToDisplay(rev.total_paise)}</Text>
        </View>
      </View>
      {(approve.error || requestRevision.error) && (
        <Text style={styles.error}>
          {((approve.error ?? requestRevision.error) as Error).message}
        </Text>
      )}
      <Text style={styles.methodLabel}>How would you like to pay?</Text>
      <View style={styles.methodRow}>
        {(['upi', 'cash'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMethod(m)}
            accessibilityRole="radio"
            accessibilityState={{ selected: method === m }}
            style={[styles.methodChip, method === m && styles.methodChipActive]}
          >
            <Text style={[styles.methodText, method === m && styles.methodTextActive]}>
              {m === 'upi' ? 'UPI' : 'Cash'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Button
        title={`Approve ${paiseToDisplay(rev.total_paise)}`}
        onPress={onApprove}
        loading={approve.isPending}
        disabled={!method}
      />
      <Button
        title="Request a change"
        variant="ghost"
        onPress={() => requestRevision.mutate(booking.id)}
        loading={requestRevision.isPending}
      />
    </Card>
  );
}

function PaymentCard({ booking }: { booking: BookingDetailData }) {
  const queryClient = useQueryClient();
  const phone = useAuth((s) => s.session?.user.phone);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (booking.status !== 'awaiting_payment') return null;
  if (booking.final_payment_status === 'paid') return null;

  if (booking.payment_method === 'cash') {
    return (
      <Card variant="outlined" style={styles.card}>
        <Text style={styles.cardTitle}>Pay in cash</Text>
        <Text style={styles.muted}>
          Please pay {booking.approved_amount_paise != null ? paiseToDisplay(booking.approved_amount_paise) : 'the approved amount'} in
          cash to the professional. They will mark it collected on their app.
        </Text>
      </Card>
    );
  }

  const onPay = async () => {
    setPaying(true);
    setError(undefined);
    try {
      await payFinalAmount(booking.id, { contact: phone ?? undefined });
      await queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment did not complete. Try again.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <Card variant="outlined" style={[styles.card, styles.infoCard]}>
      <Text style={styles.cardTitle}>Complete payment</Text>
      <Text style={styles.total}>
        {booking.approved_amount_paise != null ? paiseToDisplay(booking.approved_amount_paise) : ''}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Pay now with UPI" onPress={onPay} loading={paying} />
      <Text style={styles.muted}>Payment is confirmed by Razorpay — never mark it paid manually.</Text>
    </Card>
  );
}

const CANCEL_REASONS = [
  'Changed my mind',
  'Professional is delayed',
  'Booked by mistake',
  'Price concern',
  'Other',
];

function CancelCard({ booking }: { booking: BookingDetailData }) {
  const cancel = useCancelBooking();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  if (!CUSTOMER_CANCELLABLE.includes(booking.status)) return null;

  if (!expanded) {
    return (
      <Button title="Cancel booking" variant="ghost" onPress={() => setExpanded(true)} />
    );
  }

  return (
    <Card variant="outlined" style={styles.card}>
      <Text style={styles.cardTitle}>Cancel this booking?</Text>
      <Text style={styles.muted}>Please tell us why — it helps us improve.</Text>
      <View style={styles.reasonWrap}>
        {CANCEL_REASONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            accessibilityRole="radio"
            accessibilityState={{ selected: reason === r }}
            style={[styles.reasonChip, reason === r && styles.methodChipActive]}
          >
            <Text style={[styles.methodText, reason === r && styles.methodTextActive]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      {cancel.error ? <Text style={styles.error}>{(cancel.error as Error).message}</Text> : null}
      <View style={styles.cancelActions}>
        <Button title="Keep booking" variant="ghost" onPress={() => setExpanded(false)} />
        <Button
          title="Confirm cancel"
          variant="danger"
          onPress={() => reason && cancel.mutate({ bookingId: booking.id, reason })}
          loading={cancel.isPending}
          disabled={!reason}
        />
      </View>
    </Card>
  );
}

function ReviewCard({ booking }: { booking: BookingDetailData }) {
  const submit = useSubmitReview();
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');

  if (booking.status !== 'completed') return null;
  if (booking.review) {
    return (
      <Card variant="outlined" style={styles.card}>
        <Text style={styles.cardTitle}>Your review</Text>
        <Stars value={booking.review.stars} size={28} />
        {booking.review.text ? <Text style={styles.muted}>{booking.review.text}</Text> : null}
      </Card>
    );
  }

  return (
    <Card variant="outlined" style={[styles.card, styles.infoCard]}>
      <Text style={styles.cardTitle}>How was the service?</Text>
      <Stars value={stars} onRate={setStars} />
      <TextField
        label="Tell others (optional)"
        value={text}
        onChangeText={setText}
        placeholder="What went well?"
        maxLength={500}
      />
      {submit.error ? <Text style={styles.error}>{(submit.error as Error).message}</Text> : null}
      <Button
        title="Submit review"
        onPress={() => submit.mutate({ bookingId: booking.id, stars, text })}
        loading={submit.isPending}
        disabled={stars === 0}
      />
    </Card>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: booking, isLoading, error, refetch } = useBooking(id);
  useBookingSubscription(id);

  if (isLoading) {
    return (
      <Screen>
        <Skeleton height={28} width="60%" />
        <Skeleton height={120} radius={16} />
        <Skeleton height={200} radius={16} />
      </Screen>
    );
  }

  if (error || !booking) {
    return (
      <Screen>
        <ErrorState
          message="Could not load this booking."
          onRetry={() => void refetch()}
        />
        <Button title="Back to bookings" variant="ghost" onPress={() => router.replace('/(customer)/bookings')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Badge label={bookingStatusLabel(booking.status)} tone={BOOKING_STATUS_TONE[booking.status]} />
        <Text style={styles.title}>{booking.service?.name ?? 'Service booking'}</Text>
        <Text style={styles.subtitle}>{formatSlot(booking.scheduled_at)}</Text>
        {booking.address && (
          <Text style={styles.subtitle}>
            {booking.address.label} · {booking.address.line1}, {booking.address.locality}
          </Text>
        )}
      </View>

      <FeeCard booking={booking} />
      <ProviderCard booking={booking} />
      <OtpCard booking={booking} />
      <AmountApprovalCard booking={booking} />
      <PaymentCard booking={booking} />
      <Timeline booking={booking} />
      <ReviewCard booking={booking} />
      <CancelCard booking={booking} />

      {(booking.status === 'cancelled' || booking.status === 'refunded') && (
        <EmptyState
          title={bookingStatusLabel(booking.status)}
          message={
            booking.cancel_reason
              ? `Reason: ${booking.cancel_reason}`
              : 'This booking is closed.'
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  card: { gap: spacing.sm },
  cardTitle: { ...typography.h3, color: colors.text },
  bodyStrong: { ...typography.bodyStrong, color: colors.text },
  muted: { ...typography.body, color: colors.textSecondary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  error: { ...typography.small, color: colors.error },
  warnCard: { borderColor: colors.warning, borderWidth: 1 },
  infoCard: { borderColor: colors.primary, borderWidth: 1 },
  eventRow: { flexDirection: 'row', gap: spacing.md },
  eventRail: { alignItems: 'center', width: 14 },
  eventDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 4 },
  eventLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  eventBody: { paddingBottom: spacing.md, gap: 2, flex: 1 },
  eventLabel: { ...typography.bodyStrong, color: colors.text },
  eventTime: { ...typography.small, color: colors.textTertiary },
  otpCode: {
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: 12,
    color: colors.primaryDark,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  amountRows: { gap: spacing.xs },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between' },
  discount: { color: colors.success },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  total: { ...typography.h2, color: colors.primaryDark },
  methodLabel: { ...typography.captionStrong, color: colors.textSecondary },
  methodRow: { flexDirection: 'row', gap: spacing.sm },
  methodChip: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  methodChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft, borderWidth: 2 },
  methodText: { ...typography.bodyStrong, color: colors.textSecondary },
  methodTextActive: { color: colors.primaryDark },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonChip: {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  cancelActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
