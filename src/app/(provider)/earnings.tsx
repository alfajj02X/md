import { useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
} from '@/ui/components';
import { colors, radii, spacing, typography } from '@/ui/theme';
import { paiseToDisplay } from '@/domain/money';
import { PROVIDER_CASH_CAPACITY_PAISE } from '@/domain/config';
import {
  LEDGER_LABELS,
  formatSlot,
  ledgerSignedPaise,
  useLedger,
  useProviderProfile,
} from '@/lib/provider';
import type { LedgerEntry } from '@/supabase/types';

/**
 * Earnings: totals, cash liability vs the platform cap, and the ledger.
 */
export default function ProviderEarnings() {
  const { data: ledger, isLoading, isError, refetch } = useLedger();
  const { data: profile } = useProviderProfile();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const liability = profile?.cash_liability_paise ?? 0;
  const nearCap = liability >= PROVIDER_CASH_CAPACITY_PAISE * 0.8;

  if (isLoading) {
    return (
      <Screen>
        <Skeleton height={110} />
        <Skeleton height={110} />
        <Skeleton height={200} />
      </Screen>
    );
  }

  if (isError || !ledger) {
    return (
      <Screen>
        <ErrorState title="Could not load earnings" onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.totals}>
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total earnings</Text>
          <Text style={styles.totalValue}>{paiseToDisplay(ledger.totals.earningsPaise)}</Text>
        </Card>
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Commission paid</Text>
          <Text style={styles.totalValue}>{paiseToDisplay(ledger.totals.commissionPaise)}</Text>
        </Card>
      </View>

      <Card style={[styles.liabilityCard, nearCap && styles.liabilityWarning]}>
        <View style={styles.liabilityRow}>
          <View style={styles.liabilityText}>
            <Text style={styles.totalLabel}>Cash liability</Text>
            <Text style={styles.totalValue}>{paiseToDisplay(liability)}</Text>
            <Text style={styles.liabilitySub}>
              Commission owed on cash jobs · cap {paiseToDisplay(PROVIDER_CASH_CAPACITY_PAISE)}
            </Text>
          </View>
          {nearCap ? <Badge label="Settle soon" tone="warning" /> : null}
        </View>
        {nearCap ? (
          <Text style={styles.warningText}>
            You&apos;re approaching the cash collection cap. Settle with the platform to keep
            receiving jobs.
          </Text>
        ) : null}
      </Card>

      <Text style={styles.sectionTitle}>Ledger</Text>
      {!ledger.entries.length ? (
        <EmptyState
          title="No transactions yet"
          message="Your earnings, commission and cash collections will appear here."
        />
      ) : (
        ledger.entries.map((entry) => <LedgerRow key={entry.id} entry={entry} />)
      )}
    </Screen>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const signed = ledgerSignedPaise(entry);
  const positive = signed > 0;
  return (
    <Card variant="outlined" style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{LEDGER_LABELS[entry.type]}</Text>
        {entry.note ? <Text style={styles.rowNote}>{entry.note}</Text> : null}
        <Text style={styles.rowDate}>{formatSlot(entry.created_at)}</Text>
      </View>
      <Text style={[styles.rowAmount, positive ? styles.positive : styles.negative]}>
        {positive ? '+' : '−'}{paiseToDisplay(Math.abs(signed))}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  totals: { flexDirection: 'row', gap: spacing.md },
  totalCard: { flex: 1, gap: spacing.xs },
  totalLabel: { ...typography.caption, color: colors.textSecondary },
  totalValue: { ...typography.h1, color: colors.text },
  liabilityCard: { gap: spacing.sm, borderRadius: radii.lg },
  liabilityWarning: { borderColor: colors.warning, borderWidth: 1 },
  liabilityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  liabilityText: { flex: 1, gap: spacing.xs },
  liabilitySub: { ...typography.small, color: colors.textTertiary },
  warningText: { ...typography.small, color: colors.warning },
  sectionTitle: { ...typography.h2, color: colors.text, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.bodyStrong, color: colors.text },
  rowNote: { ...typography.caption, color: colors.textSecondary },
  rowDate: { ...typography.small, color: colors.textTertiary },
  rowAmount: { ...typography.bodyStrong },
  positive: { color: colors.success },
  negative: { color: colors.error },
});
