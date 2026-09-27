import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorState, Screen, Skeleton, TextField } from '@/ui/components';
import { colors, spacing, typography } from '@/ui/theme';
import { BOOKING_FEE_PAISE } from '@/domain/config';
import { paiseToDisplay } from '@/domain/money';
import { formatSlot, useAddresses, useCreateBooking, useService } from '@/lib/customer';
import { payBookingFee } from '@/lib/payments';
import { useAuth } from '@/stores/auth';
import { useBookingDraft } from '@/stores/bookingDraft';

/**
 * Booking summary + ₹49 booking-fee payment.
 *
 * The booking is created first (server-side RPC), then the fee is collected.
 * If the payment is cancelled or fails, we still land on the booking detail —
 * the fee stays "unpaid" there with a retry button, and auto-assignment only
 * starts once the fee is paid.
 */
export default function BookSummary() {
  const draft = useBookingDraft();
  const phone = useAuth((s) => s.session?.user.phone);
  const displayName = useAuth((s) => s.profile?.display_name);
  const { data: service } = useService(draft.serviceId ?? undefined);
  const { data: addresses } = useAddresses();
  const createBooking = useCreateBooking();

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const ready = Boolean(draft.serviceId && draft.addressId && draft.scheduledAt);
  useEffect(() => {
    if (!ready) router.replace('/(customer)');
  }, [ready]);

  const address = addresses?.find((a) => a.id === draft.addressId);

  const onConfirm = async () => {
    if (paying) return;
    setError(undefined);
    setPaying(true);
    try {
      const booking = await createBooking.mutateAsync();
      try {
        await payBookingFee(booking.id, {
          contact: phone ?? undefined,
          name: displayName ?? undefined,
        });
      } catch (payErr) {
        // Payment cancelled/failed: the booking exists with the fee unpaid.
        // The detail screen offers a retry; nothing is lost.
        if (__DEV__) console.log('[payments] fee payment did not complete:', payErr);
      }
      router.replace({ pathname: '/(customer)/booking/[id]', params: { id: booking.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your booking. Try again.');
    } finally {
      setPaying(false);
    }
  };

  if (!ready) return null;

  return (
    <Screen scroll>
      <Text style={styles.title}>Review your booking</Text>

      <Card variant="outlined" style={styles.card}>
        <Text style={styles.rowLabel}>Service</Text>
        {service ? (
          <Text style={styles.rowValue}>{service.name}</Text>
        ) : (
          <Skeleton height={16} width="60%" />
        )}
      </Card>

      <Card variant="outlined" style={styles.card}>
        <Text style={styles.rowLabel}>Address</Text>
        {address ? (
          <Text style={styles.rowValue}>
            {address.label} · {address.line1}, {address.locality}, {address.city}{' '}
            {address.pincode}
          </Text>
        ) : (
          <Skeleton height={16} width="70%" />
        )}
      </Card>

      <Card variant="outlined" style={styles.card}>
        <Text style={styles.rowLabel}>Time slot</Text>
        <Text style={styles.rowValue}>
          {draft.scheduledAt ? formatSlot(draft.scheduledAt) : '—'}
        </Text>
      </Card>

      <TextField
        label="Notes for the professional (optional)"
        value={draft.notes}
        onChangeText={draft.setNotes}
        placeholder="e.g. Call on arrival, gate code…"
        maxLength={300}
      />

      <Card variant="outlined" style={styles.card}>
        <View style={styles.feeRow}>
          <Text style={styles.rowValue}>Booking fee</Text>
          <Text style={styles.rowValue}>{paiseToDisplay(BOOKING_FEE_PAISE)}</Text>
        </View>
        <Text style={styles.feeNote}>
          A one-time fee that confirms your slot and covers dispatch of the
          professional. Service charges are quoted after inspection, and you
          approve the final amount before paying anything more.
        </Text>
        <View style={styles.divider} />
        <View style={styles.feeRow}>
          <Text style={styles.totalLabel}>Due now</Text>
          <Text style={styles.total}>{paiseToDisplay(BOOKING_FEE_PAISE)}</Text>
        </View>
      </Card>

      {error ? (
        <ErrorState title="Booking failed" message={error} onRetry={onConfirm} />
      ) : (
        <Button
          title={`Pay ${paiseToDisplay(BOOKING_FEE_PAISE)} & confirm`}
          onPress={onConfirm}
          loading={paying}
          size="lg"
        />
      )}
      <Text style={styles.secure}>
        Secure UPI payment via Razorpay. The professional is assigned only after the
        fee is paid.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h1, color: colors.text },
  card: { gap: spacing.xs },
  rowLabel: { ...typography.caption, color: colors.textSecondary },
  rowValue: { ...typography.bodyStrong, color: colors.text },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feeNote: { ...typography.small, color: colors.textTertiary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalLabel: { ...typography.bodyStrong, color: colors.text },
  total: { ...typography.h2, color: colors.primaryDark },
  secure: { ...typography.small, color: colors.textTertiary, textAlign: 'center' },
});
