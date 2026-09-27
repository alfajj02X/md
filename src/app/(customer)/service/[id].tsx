import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, ErrorState, Screen, Skeleton } from '@/ui/components';
import { colors, spacing, typography } from '@/ui/theme';
import { paiseToDisplayShort } from '@/domain/money';
import { useService } from '@/lib/customer';
import { useBookingDraft } from '@/stores/bookingDraft';

function BulletList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) return <Text style={styles.muted}>{emptyText}</Text>;
  return (
    <View style={styles.bullets}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: service, isLoading, error, refetch } = useService(id);
  const setService = useBookingDraft((s) => s.setService);

  const onBook = () => {
    if (!service) return;
    setService(service.id);
    router.push('/(customer)/book/address');
  };

  return (
    <Screen scroll={false} padded={false} edges={['top']}>
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.body}>
            <Skeleton height={28} width="70%" />
            <Skeleton height={16} />
            <Skeleton height={16} width="85%" />
            <Skeleton height={120} radius={16} />
          </View>
        ) : error || !service ? (
          <ErrorState message="Could not load this service." onRetry={() => void refetch()} />
        ) : (
          <>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
              <View style={styles.bodyInner}>
                {service.category ? (
                  <Badge label={service.category.name} tone="primary" />
                ) : null}
                <Text style={styles.title}>{service.name}</Text>
                {service.description ? (
                  <Text style={styles.description}>{service.description}</Text>
                ) : null}
                <Card variant="outlined" style={styles.priceCard}>
                  <View style={styles.priceRow}>
                    <View>
                      <Text style={styles.priceLabel}>Starting at</Text>
                      <Text style={styles.price}>
                        {service.base_price_paise != null
                          ? paiseToDisplayShort(service.base_price_paise)
                          : 'Price on inspection'}
                      </Text>
                    </View>
                    {service.duration_minutes ? (
                      <Badge label={`~${service.duration_minutes} min`} tone="neutral" />
                    ) : null}
                  </View>
                  <Text style={styles.priceNote}>
                    Indicative price. The professional confirms the final amount after
                    inspection, and you approve it before paying.
                  </Text>
                </Card>
                <Text style={styles.sectionTitle}>What&apos;s included</Text>
                <BulletList items={service.inclusions} emptyText="Details shared at booking." />
                {service.exclusions.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Not included</Text>
                    <BulletList items={service.exclusions} emptyText="" />
                  </>
                )}
              </View>
            </ScrollView>
            <View style={styles.footer}>
              <Button title="Book now" onPress={onBook} size="lg" />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  body: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  bodyInner: { gap: spacing.md },
  title: { ...typography.h1, color: colors.text },
  description: { ...typography.body, color: colors.textSecondary },
  priceCard: { gap: spacing.sm },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { ...typography.caption, color: colors.textSecondary },
  price: { ...typography.h1, color: colors.primaryDark },
  priceNote: { ...typography.small, color: colors.textTertiary },
  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.sm },
  bullets: { gap: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm },
  bulletDot: { ...typography.body, color: colors.primary },
  bulletText: { ...typography.body, color: colors.text, flex: 1 },
  muted: { ...typography.body, color: colors.textTertiary },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
