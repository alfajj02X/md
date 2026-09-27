import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
} from '@/ui/components';
import { colors, spacing, typography } from '@/ui/theme';
import { BOOKING_STATUS_TONE, bookingStatusLabel, KYC_STATUS_LABELS } from '@/lib/bookingUi';
import {
  acceptOffer,
  declineOffer,
  formatCountdown,
  formatSlot,
  updateLocation,
  useJobSubscription,
  useNow,
  useOffers,
  useProviderJobs,
  useProviderProfile,
  useSetOnline,
  type OfferFeedItem,
} from '@/lib/provider';
import { useQueryClient } from '@tanstack/react-query';
import { providerKeys } from '@/lib/provider';

/**
 * Provider home: online toggle, KYC gate, pending offers, active jobs.
 * While online, a 30s heartbeat pushes the GPS fix to the server.
 */
export default function ProviderJobs() {
  const { data: profile, isLoading, isError, refetch } = useProviderProfile();
  const offers = useOffers();
  const jobs = useProviderJobs();
  const setOnline = useSetOnline();
  const queryClient = useQueryClient();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [actioningOfferId, setActioningOfferId] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useJobSubscription();

  const online = profile?.online ?? false;
  const kycApproved = profile?.kyc_status === 'approved';

  useEffect(() => {
    if (!online) return;
    updateLocation().catch(() => {});
    const timer = setInterval(() => {
      updateLocation().catch(() => {});
    }, 30_000);
    return () => clearInterval(timer);
  }, [online]);

  const onToggleOnline = async (next: boolean) => {
    setToggleError(null);
    try {
      await setOnline.mutateAsync(next);
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : 'Could not change your status.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), offers.refetch(), jobs.refetch()]);
    setRefreshing(false);
  };

  const onAccept = async (offer: OfferFeedItem) => {
    setOfferError(null);
    setActioningOfferId(offer.offer_id);
    try {
      const booking = await acceptOffer(offer.offer_id);
      await queryClient.invalidateQueries({ queryKey: providerKeys.jobs });
      await queryClient.invalidateQueries({ queryKey: providerKeys.offers });
      router.push(`/(provider)/job/${booking.id}`);
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : 'Could not accept the offer.');
    } finally {
      setActioningOfferId(null);
    }
  };

  const onDecline = async (offer: OfferFeedItem) => {
    setOfferError(null);
    setActioningOfferId(offer.offer_id);
    try {
      await declineOffer(offer.offer_id);
      await queryClient.invalidateQueries({ queryKey: providerKeys.offers });
    } catch (e) {
      setOfferError(e instanceof Error ? e.message : 'Could not decline the offer.');
    } finally {
      setActioningOfferId(null);
    }
  };

  if (isLoading) {
    return (
      <Screen>
        <Skeleton height={120} />
        <Skeleton height={180} />
        <Skeleton height={180} />
      </Screen>
    );
  }

  if (isError || !profile) {
    return (
      <Screen>
        <ErrorState
          title="Could not load your dashboard"
          onRetry={() => void refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* KYC gate */}
      {!kycApproved && (
        <Card variant="outlined" style={styles.kycCard}>
          <Badge label={KYC_STATUS_LABELS[profile.kyc_status]} tone="warning" />
          <Text style={styles.kycTitle}>Complete KYC to receive jobs</Text>
          <Text style={styles.kycText}>
            Upload your documents so our team can verify you. Approval usually takes under
            24 hours.
          </Text>
          <Button
            title="Go to KYC"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/(provider)/account')}
          />
        </Card>
      )}

      {/* Online toggle */}
      <Card>
        <View style={styles.onlineRow}>
          <View style={styles.onlineText}>
            <Text style={styles.onlineTitle}>{online ? 'You are online' : 'You are offline'}</Text>
            <Text style={styles.onlineSub}>
              {online
                ? 'New job offers near you will appear below.'
                : 'Go online to start receiving job offers.'}
            </Text>
          </View>
          <Switch
            value={online}
            onValueChange={onToggleOnline}
            disabled={setOnline.isPending}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
            accessibilityLabel={online ? 'Go offline' : 'Go online'}
          />
        </View>
        {toggleError ? <Text style={styles.errorText}>{toggleError}</Text> : null}
        {!online && kycApproved && (
          <View style={styles.goOnlineCta}>
            <Button
              title={setOnline.isPending ? 'Going online…' : 'Go online'}
              onPress={() => onToggleOnline(true)}
              loading={setOnline.isPending}
            />
          </View>
        )}
      </Card>

      {/* Pending offers */}
      <Text style={styles.sectionTitle}>Job offers</Text>
      {offerError ? <Text style={styles.errorText}>{offerError}</Text> : null}
      {offers.isLoading ? (
        <Skeleton height={200} />
      ) : offers.isError ? (
        <ErrorState title="Could not load offers" onRetry={() => void offers.refetch()} />
      ) : !offers.data?.length ? (
        <EmptyState
          title={online ? 'No offers right now' : 'No offers'}
          message={
            online
              ? 'Stay online — new offers will pop up here.'
              : 'Go online to receive job offers near you.'
          }
        />
      ) : (
        offers.data.map((offer) => (
          <OfferCard
            key={offer.offer_id}
            offer={offer}
            busy={actioningOfferId === offer.offer_id}
            onAccept={() => onAccept(offer)}
            onDecline={() => onDecline(offer)}
          />
        ))
      )}

      {/* Active jobs */}
      <Text style={styles.sectionTitle}>Active jobs</Text>
      {jobs.isLoading ? (
        <Skeleton height={120} />
      ) : jobs.isError ? (
        <ErrorState title="Could not load jobs" onRetry={() => void jobs.refetch()} />
      ) : !jobs.data?.length ? (
        <EmptyState title="No active jobs" message="Accepted jobs appear here." />
      ) : (
        jobs.data.map((job) => (
          <TouchableOpacity
            key={job.id}
            onPress={() => router.push(`/(provider)/job/${job.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${job.service?.name ?? 'Job'} — ${bookingStatusLabel(job.status)}`}
          >
            <Card style={styles.jobCard}>
              <View style={styles.jobRow}>
                <View style={styles.jobText}>
                  <Text style={styles.jobTitle}>{job.service?.name ?? 'Service'}</Text>
                  <Text style={styles.jobSub}>{formatSlot(job.scheduled_at)}</Text>
                  {job.address ? (
                    <Text style={styles.jobSub}>
                      {job.address.locality}, {job.address.city}
                    </Text>
                  ) : null}
                </View>
                <Badge label={bookingStatusLabel(job.status)} tone={BOOKING_STATUS_TONE[job.status]} />
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}
    </Screen>
  );
}

function OfferCard({
  offer,
  busy,
  onAccept,
  onDecline,
}: {
  offer: OfferFeedItem;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const now = useNow(1000);
  const expired = new Date(offer.expires_at).getTime() <= now;
  return (
    <Card style={styles.offerCard}>
      <View style={styles.offerHeader}>
        <Text style={styles.offerTitle}>{offer.service_name}</Text>
        <Badge label={expired ? 'Expired' : `Expires in ${formatCountdown(offer.expires_at, now)}`} tone={expired ? 'neutral' : 'warning'} />
      </View>
      <Text style={styles.offerMeta}>
        {[offer.locality, offer.city].filter(Boolean).join(', ') || 'Nearby'}
      </Text>
      <Text style={styles.offerMeta}>{formatSlot(offer.scheduled_at)}</Text>
      <Text style={styles.privacyNote}>
        Exact address is shared only after you accept.
      </Text>
      <View style={styles.offerActions}>
        <View style={styles.offerAction}>
          <Button title="Decline" variant="outline" size="sm" onPress={onDecline} disabled={busy || expired} />
        </View>
        <View style={styles.offerAction}>
          <Button title="Accept" size="sm" onPress={onAccept} loading={busy} disabled={expired} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  scroll: { display: 'none' },
  kycCard: { gap: spacing.sm, borderColor: colors.warning, borderWidth: 1 },
  kycTitle: { ...typography.h3, color: colors.text },
  kycText: { ...typography.body, color: colors.textSecondary },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  onlineText: { flex: 1, gap: 2 },
  onlineTitle: { ...typography.h3, color: colors.text },
  onlineSub: { ...typography.caption, color: colors.textSecondary },
  goOnlineCta: { marginTop: spacing.md },
  errorText: { ...typography.small, color: colors.error },
  sectionTitle: { ...typography.h2, color: colors.text, marginTop: spacing.sm },
  offerCard: { gap: spacing.sm },
  offerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  offerTitle: { ...typography.h3, color: colors.text, flex: 1 },
  offerMeta: { ...typography.body, color: colors.textSecondary },
  privacyNote: { ...typography.small, color: colors.textTertiary, fontStyle: 'italic' },
  offerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  offerAction: { flex: 1 },
  jobCard: { marginBottom: spacing.sm },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  jobText: { flex: 1, gap: 2 },
  jobTitle: { ...typography.bodyStrong, color: colors.text },
  jobSub: { ...typography.caption, color: colors.textSecondary },
});
