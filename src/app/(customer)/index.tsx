import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, EmptyState, ErrorState, Screen, Skeleton, TextField } from '@/ui/components';
import { colors, radii, spacing, typography } from '@/ui/theme';
import { paiseToDisplayShort } from '@/domain/money';
import { useCategories, useServices } from '@/lib/customer';
import { useAuth } from '@/stores/auth';
import { useBookingDraft } from '@/stores/bookingDraft';
import type { Service } from '@/supabase/types';

function ServiceRow({ service, onPress }: { service: Service; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Book ${service.name}`}
      style={({ pressed }) => [styles.serviceRow, pressed && styles.pressed]}
    >
      <View style={styles.serviceIcon}>
        <Text style={styles.serviceIconText}>{service.name.charAt(0)}</Text>
      </View>
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceName} numberOfLines={2}>
          {service.name}
        </Text>
        <Text style={styles.serviceMeta}>
          {service.duration_minutes ? `~${service.duration_minutes} min` : 'Duration varies'}
          {service.base_price_paise != null
            ? ` · ${paiseToDisplayShort(service.base_price_paise)} onwards`
            : ''}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function CustomerHome() {
  const profile = useAuth((s) => s.profile);
  const setService = useBookingDraft((s) => s.setService);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const categoriesQ = useCategories();
  const servicesQ = useServices();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (servicesQ.data ?? []).filter(
      (s) =>
        (!categoryId || s.category_id === categoryId) &&
        (!q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)),
    );
  }, [servicesQ.data, query, categoryId]);

  const sections = useMemo(() => {
    if (query.trim() || categoryId) return [{ id: 'results', name: 'Results', items: filtered }];
    return (categoriesQ.data ?? [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        items: filtered.filter((s) => s.category_id === c.id),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [categoriesQ.data, filtered, query, categoryId]);

  const openService = (service: Service) => {
    setService(service.id);
    router.push({ pathname: '/(customer)/service/[id]', params: { id: service.id } });
  };

  const loading = categoriesQ.isLoading || servicesQ.isLoading;
  const loadError = categoriesQ.error ?? servicesQ.error;

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>
            Hello{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''} 👋
          </Text>
          <Text style={styles.location}>Berhampore, Murshidabad</Text>
          <Text style={styles.tagline}>What does your home need today?</Text>
        </View>

        <TextField
          label=""
          value={query}
          onChangeText={setQuery}
          placeholder="Search plumber, electrician, AC repair…"
          style={styles.search}
        />

        {loading ? (
          <View style={styles.skeletonWrap}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={72} radius={radii.lg} />
            ))}
          </View>
        ) : loadError ? (
          <ErrorState
            message="Could not load services. Check your connection."
            onRetry={() => {
              void categoriesQ.refetch();
              void servicesQ.refetch();
            }}
          />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              <Pressable
                onPress={() => setCategoryId(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: categoryId === null }}
                style={[styles.chip, categoryId === null && styles.chipActive]}
              >
                <Text style={[styles.chipText, categoryId === null && styles.chipTextActive]}>
                  All
                </Text>
              </Pressable>
              {(categoriesQ.data ?? []).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: categoryId === c.id }}
                  style={[styles.chip, categoryId === c.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {sections.length === 0 ? (
              <EmptyState
                title="No services found"
                message="Try a different search or category."
              />
            ) : (
              sections.map((sec) => (
                <View key={sec.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{sec.name}</Text>
                    <Badge label={`${sec.items.length}`} tone="neutral" />
                  </View>
                  <Card variant="outlined" style={styles.sectionCard}>
                    {sec.items.map((s, i) => (
                      <View key={s.id}>
                        <ServiceRow service={s} onPress={() => openService(s)} />
                        {i < sec.items.length - 1 && <View style={styles.divider} />}
                      </View>
                    ))}
                  </Card>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  header: { gap: 2, marginTop: spacing.sm },
  greeting: { ...typography.h1, color: colors.text },
  location: { ...typography.captionStrong, color: colors.primaryDark },
  tagline: { ...typography.body, color: colors.textSecondary },
  search: { marginTop: spacing.xs },
  chips: { marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  chip: {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.captionStrong, color: colors.textSecondary },
  chipTextActive: { color: colors.textOnPrimary },
  skeletonWrap: { gap: spacing.sm },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...typography.h2, color: colors.text },
  sectionCard: { padding: 0, overflow: 'hidden' },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceIconText: { ...typography.h2, color: colors.primaryDark },
  serviceInfo: { flex: 1, gap: 2 },
  serviceName: { ...typography.bodyStrong, color: colors.text },
  serviceMeta: { ...typography.caption, color: colors.textSecondary },
  chevron: { fontSize: 24, color: colors.textTertiary },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 44 + spacing.md },
});
