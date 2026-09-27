import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Screen } from '@/ui/components';
import { colors, radii, spacing, typography } from '@/ui/theme';
import { formatSlot } from '@/lib/customer';
import { useBookingDraft } from '@/stores/bookingDraft';

const WINDOWS = [
  { label: '9 – 11 AM', hour: 9 },
  { label: '11 AM – 1 PM', hour: 11 },
  { label: '1 – 3 PM', hour: 13 },
  { label: '3 – 5 PM', hour: 15 },
  { label: '5 – 7 PM', hour: 17 },
];

/** Minimum lead time before a slot starts (1 hour). */
const LEAD_TIME_MS = 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export default function BookSlot() {
  const addressId = useBookingDraft((s) => s.addressId);
  const setSlot = useBookingDraft((s) => s.setSlot);
  const [dayOffset, setDayOffset] = useState(0);
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    if (!addressId) router.replace('/(customer)/book/address');
  }, [addressId]);

  // Days + per-day slot availability, computed once on mount (useState
  // initializer so date construction stays out of render).
  const [schedule] = useState(() => {
    const now = new Date();
    return [0, 1].map((offset) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      const dayStart = startOfDay(d);
      const windows = WINDOWS.map((w) => {
        const start = new Date(dayStart);
        start.setHours(w.hour, 0, 0, 0);
        return { ...w, start, available: start.getTime() - now.getTime() >= LEAD_TIME_MS };
      });
      return {
        offset,
        label: offset === 0 ? 'Today' : 'Tomorrow',
        sub: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
        date: dayStart,
        windows,
      };
    });
  });

  const availability = useMemo(() => {
    return schedule.find((d) => d.offset === dayOffset)?.windows ?? [];
  }, [schedule, dayOffset]);

  const selectedIso = useMemo(() => {
    if (hour == null) return null;
    const slot = availability.find((a) => a.hour === hour);
    return slot ? slot.start.toISOString() : null;
  }, [hour, availability]);

  const onContinue = () => {
    if (!selectedIso) return;
    setSlot(selectedIso);
    router.push('/(customer)/book/summary');
  };

  return (
    <Screen scroll>
      <Text style={styles.title}>Pick a time slot</Text>
      <Text style={styles.subtitle}>
        The professional arrives within the chosen 2-hour window.
      </Text>

      <View style={styles.dayRow}>
        {schedule.map((d) => (
          <Pressable
            key={d.offset}
            onPress={() => {
              setDayOffset(d.offset);
              setHour(null);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: dayOffset === d.offset }}
            style={[styles.dayCard, dayOffset === d.offset && styles.dayCardActive]}
          >
            <Text style={[styles.dayLabel, dayOffset === d.offset && styles.dayLabelActive]}>
              {d.label}
            </Text>
            <Text style={[styles.daySub, dayOffset === d.offset && styles.dayLabelActive]}>
              {d.sub}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card variant="outlined" style={styles.slotCard}>
        {availability.map((w, i) => (
          <View key={w.hour}>
            <Pressable
              onPress={() => w.available && setHour(w.hour)}
              disabled={!w.available}
              accessibilityRole="radio"
              accessibilityState={{ selected: hour === w.hour, disabled: !w.available }}
              accessibilityLabel={`${w.label}${w.available ? '' : ', unavailable'}`}
              style={({ pressed }) => [
                styles.slotRow,
                pressed && w.available && styles.pressed,
                !w.available && styles.slotDisabled,
              ]}
            >
              <View style={[styles.radio, hour === w.hour && styles.radioSelected]}>
                {hour === w.hour && <View style={styles.radioDot} />}
              </View>
              <Text style={[styles.slotLabel, !w.available && styles.slotLabelDisabled]}>
                {w.label}
              </Text>
              {!w.available && <Text style={styles.full}>Full</Text>}
            </Pressable>
            {i < availability.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </Card>

      {selectedIso && (
        <Text style={styles.confirm}>Selected: {formatSlot(selectedIso)}</Text>
      )}

      <View style={styles.footer}>
        <Button title="Continue" onPress={onContinue} disabled={!selectedIso} size="lg" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  dayRow: { flexDirection: 'row', gap: spacing.md },
  dayCard: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 2,
  },
  dayCardActive: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  dayLabel: { ...typography.bodyStrong, color: colors.text },
  dayLabelActive: { color: colors.primaryDark },
  daySub: { ...typography.caption, color: colors.textSecondary },
  slotCard: { padding: 0, overflow: 'hidden' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  pressed: { backgroundColor: colors.surfaceMuted },
  slotDisabled: { opacity: 0.5 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  slotLabel: { ...typography.body, color: colors.text, flex: 1 },
  slotLabelDisabled: { color: colors.textTertiary },
  full: { ...typography.caption, color: colors.textTertiary },
  divider: { height: 1, backgroundColor: colors.border },
  confirm: { ...typography.bodyStrong, color: colors.primaryDark, textAlign: 'center' },
  footer: { marginTop: spacing.sm },
});
