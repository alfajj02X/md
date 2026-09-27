import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Screen,
  Skeleton,
} from '@/ui/components';
import { colors, spacing, typography } from '@/ui/theme';
import { KYC_STATUS_LABELS } from '@/lib/bookingUi';
import { maskPhone } from '@/domain/validators';
import { useAuth } from '@/stores/auth';
import {
  KYC_DOC_LABELS,
  formatSlot,
  useCatalog,
  useKycDocuments,
  useMyServices,
  useProviderProfile,
  useSetMyServices,
  useSetOnline,
  useUploadKycDocument,
  type KycDocKind,
} from '@/lib/provider';

const KYC_KINDS: KycDocKind[] = ['aadhaar', 'pan', 'photo', 'trade_certificate'];

const KYC_TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  approved: 'success',
  submitted: 'info',
  under_review: 'info',
  changes_required: 'warning',
  rejected: 'error',
  suspended: 'error',
  not_started: 'neutral',
};

/**
 * Provider account: KYC documents, services offered, availability, sign out.
 */
export default function ProviderAccount() {
  const authProfile = useAuth((s) => s.profile);
  const signOut = useAuth((s) => s.signOut);
  const { data: profile, isLoading, isError, refetch } = useProviderProfile();

  const onSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void signOut().then(() => router.replace('/'));
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <Screen>
        <Skeleton height={140} />
        <Skeleton height={200} />
      </Screen>
    );
  }

  if (isError || !profile) {
    return (
      <Screen>
        <ErrorState title="Could not load your account" onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <Card>
        <Text style={styles.name}>{authProfile?.display_name ?? 'Provider'}</Text>
        {authProfile?.phone ? (
          <Text style={styles.meta}>{maskPhone(authProfile.phone)}</Text>
        ) : null}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.rating_avg.toFixed(1)} ★</Text>
            <Text style={styles.statLabel}>{profile.rating_count} ratings</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.completed_jobs}</Text>
            <Text style={styles.statLabel}>Jobs done</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.service_city}</Text>
            <Text style={styles.statLabel}>Service area</Text>
          </View>
        </View>
      </Card>

      <KycSection />
      <ServicesSection />
      <OnlineSection online={profile.online} />

      <Button title="Sign out" variant="danger" onPress={onSignOut} />
    </Screen>
  );
}

function KycSection() {
  const { data: profile } = useProviderProfile();
  const { data: docs, refetch } = useKycDocuments();
  const upload = useUploadKycDocument();
  const [uploadingKind, setUploadingKind] = useState<KycDocKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latestByKind = useMemo(() => {
    const map = new Map<KycDocKind, { path: string; at: string }>();
    for (const d of docs ?? []) {
      const kind = d.doc_type as KycDocKind;
      if (KYC_KINDS.includes(kind) && !map.has(kind)) {
        map.set(kind, { path: d.storage_path, at: d.created_at });
      }
    }
    return map;
  }, [docs]);

  const onPick = async (kind: KycDocKind) => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri) return;
    setUploadingKind(kind);
    try {
      await upload.mutateAsync({ kind, uri: asset.uri });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Try again.');
    } finally {
      setUploadingKind(null);
    }
  };

  if (!profile) return null;
  const tone = KYC_TONE[profile.kyc_status] ?? 'neutral';

  return (
    <Card style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>KYC verification</Text>
        <Badge label={KYC_STATUS_LABELS[profile.kyc_status]} tone={tone} />
      </View>
      {profile.kyc_reviewer_note ? (
        <Text style={styles.reviewerNote}>Reviewer note: {profile.kyc_reviewer_note}</Text>
      ) : null}
      <Text style={styles.meta}>
        Our team reviews documents within 24 hours. You can receive jobs once approved.
      </Text>
      {KYC_KINDS.map((kind) => {
        const uploaded = latestByKind.get(kind);
        const uploading = uploadingKind === kind;
        return (
          <View key={kind} style={styles.docRow}>
            <View style={styles.docText}>
              <Text style={styles.docTitle}>{KYC_DOC_LABELS[kind]}</Text>
              <Text style={styles.docSub}>
                {uploaded ? `Uploaded ${formatSlot(uploaded.at)}` : 'Not uploaded'}
              </Text>
            </View>
            <Button
              title={uploading ? 'Uploading…' : uploaded ? 'Replace' : 'Upload'}
              size="sm"
              variant={uploaded ? 'outline' : 'secondary'}
              onPress={() => onPick(kind)}
              loading={uploading}
              disabled={uploadingKind !== null}
            />
          </View>
        );
      })}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Card>
  );
}

function ServicesSection() {
  const { data: catalog } = useCatalog();
  const { data: mine } = useMyServices();
  const setMine = useSetMyServices();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = selected ?? mine ?? [];
  const toggle = (id: string) =>
    setSelected(current.includes(id) ? current.filter((s) => s !== id) : [...current, id]);

  const onSave = async () => {
    setError(null);
    try {
      await setMine.mutateAsync(selected ?? []);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your services.');
    }
  };

  const dirty = selected !== null;

  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Services you offer</Text>
      <Text style={styles.meta}>Customers can only book you for selected services.</Text>
      <View style={styles.chips}>
        {(catalog?.services ?? []).map((s) => {
          const active = current.includes(s.id);
          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => toggle(s.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={s.name}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {dirty ? (
        <Button
          title="Save services"
          size="sm"
          onPress={onSave}
          loading={setMine.isPending}
        />
      ) : null}
    </Card>
  );
}

function OnlineSection({ online }: { online: boolean }) {
  const setOnline = useSetOnline();
  const [error, setError] = useState<string | null>(null);
  const onToggle = async (next: boolean) => {
    setError(null);
    try {
      await setOnline.mutateAsync(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your status.');
    }
  };
  return (
    <Card style={styles.section}>
      <View style={styles.onlineRow}>
        <View style={styles.onlineText}>
          <Text style={styles.sectionTitle}>Availability</Text>
          <Text style={styles.meta}>{online ? 'Online — receiving offers' : 'Offline'}</Text>
        </View>
        <Switch
          value={online}
          onValueChange={onToggle}
          disabled={setOnline.isPending}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.surface}
          accessibilityLabel={online ? 'Go offline' : 'Go online'}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  name: { ...typography.h2, color: colors.text },
  meta: { ...typography.body, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.md },
  stat: { flex: 1, gap: 2 },
  statValue: { ...typography.h3, color: colors.text },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...typography.h3, color: colors.text },
  reviewerNote: { ...typography.caption, color: colors.warning },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  docText: { flex: 1, gap: 2 },
  docTitle: { ...typography.bodyStrong, color: colors.text },
  docSub: { ...typography.caption, color: colors.textSecondary },
  errorText: { ...typography.small, color: colors.error },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.captionStrong, color: colors.textSecondary },
  chipTextActive: { color: colors.textOnPrimary },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  onlineText: { flex: 1, gap: 2 },
});
