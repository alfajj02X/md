import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, EmptyState, ErrorState, Screen, Skeleton } from '@/ui/components';
import { colors, radii, spacing, typography } from '@/ui/theme';
import { paiseToDisplayShort } from '@/domain/money';
import { formatSlot, useBookings, useBookingsSubscription, type BookingCardData } from '@/lib/customer';
import { BOOKING_STATUS_TONE, bookingStatusLabel } from '@/lib/bookingUi';

function BookingRow({ booking }: { booking: BookingCardData }) {
  const amount = booking.approved_amount_paise ?? booking.service?.base_price_paise ?? null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(customer)/booking/[id]', params: { id: booking.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${booking.service?.name ?? 'Booking'}, ${bookingStatusLabel(booking.status)}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.serviceName} numberOfLines={1}>
          {booking.service?.name ?? 'Service booking'}
        </Text>
        <Badge label={bookingStatusLabel(booking.status)} tone={BOOKING_STATUS_TONE[booking.status]} />
      </View>
      <Text style={styles.slot}>{formatSlot(booking.scheduled_at)}</Text>
      <View style={styles.rowBottom}>
        <Text style={styles.address} numberOfLines={1}>
          {booking.address ? `${booking.address.label} · ${booking.address.locality}` : ''}
        </Text>
        {amount != null && (
          <Text style={styles.amount}>
            {booking.approved_amount_paise != null ? paiseToDisplayShort(amount) : `from ${paiseToDisplayShort(amount)}`}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function CustomerBookings() {
  const { data, isLoading, error, refetch, isRefetching } = useBookings();
  useBookingsSubscription();

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>My bookings</Text>
      </View>
      {isLoading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={96} radius={radii.lg} />
          ))}
        </View>
      ) : error ? (
        <ErrorState message="Could not load your bookings." onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          message="Book a service and it will show up here with live tracking."
          actionTitle="Find a service"
          onAction={() => router.push('/(customer)')}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          {data.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { ...typography.h1, color: colors.text },
  scroll: { flex: 1 },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxxl },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  serviceName: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  slot: { ...typography.caption, color: colors.textSecondary },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  address: { ...typography.caption, color: colors.textTertiary, flex: 1 },
  amount: { ...typography.bodyStrong, color: colors.primaryDark },
});
