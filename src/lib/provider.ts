/**
 * Provider data layer: react-query hooks + Supabase RPC wrappers.
 *
 * Rules honored here:
 * - Clients never write bookings/offers/payments/ledger directly. All job
 *   transitions go through the security-definer RPCs.
 * - Allowed direct writes: provider_profiles (own row), provider_services
 *   (own rows), kyc_documents (own rows), kyc-docs storage (own folder).
 * - Money is integer paise everywhere.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { getSupabase } from '../supabase/client';
import { useAuth } from '../stores/auth';
import type {
  Address,
  Booking,
  BookingAmountRevision,
  BookingStatus,
  KycDocument,
  LedgerEntry,
  LedgerEntryType,
  ProviderProfile,
  Service,
  ServiceCategory,
} from '../supabase/types';

export const providerKeys = {
  profile: ['provider', 'profile'] as const,
  offers: ['provider', 'offers'] as const,
  jobs: ['provider', 'jobs'] as const,
  job: (id: string) => ['provider', 'job', id] as const,
  ledger: ['provider', 'ledger'] as const,
  kycDocs: ['provider', 'kycDocs'] as const,
  myServices: ['provider', 'myServices'] as const,
  catalog: ['provider', 'catalog'] as const,
};

function uidOrThrow(): string {
  const uid = useAuth.getState().session?.user?.id;
  if (!uid) throw new Error('You need to sign in first.');
  return uid;
}

function rpcErrorMessage(error: { message: string }, fallback: string): string {
  // RPC RAISE EXCEPTION messages arrive in error.message — surface them
  // honestly; they are already user-safe (e.g. "Offer expired").
  return error.message || fallback;
}

/* ── Provider profile ─────────────────────────────────────────────── */

export function useProviderProfile() {
  const uid = useAuth((s) => s.session?.user?.id);
  return useQuery({
    queryKey: [...providerKeys.profile, uid],
    enabled: !!uid,
    queryFn: async (): Promise<ProviderProfile> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('provider_profiles')
        .select('*')
        .eq('provider_id', uid!)
        .maybeSingle();
      if (error) throw new Error('Could not load your provider profile.');
      if (data) return data;
      const { data: created, error: insertError } = await supabase
        .from('provider_profiles')
        .insert({ provider_id: uid!, service_city: 'Berhampore' })
        .select('*')
        .single();
      if (insertError) throw new Error('Could not set up your provider profile.');
      return created;
    },
  });
}

/* ── Location ─────────────────────────────────────────────────────── */

export async function ensureLocationPermission(): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error(
      'Location permission is required to go online and to verify arrival at the customer.',
    );
  }
}

export async function getHighAccuracyPosition(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number | null;
}> {
  await ensureLocationPermission();
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

/** Push the current GPS fix into provider_profiles (heartbeat while online). */
export async function updateLocation(): Promise<void> {
  const uid = uidOrThrow();
  const pos = await getHighAccuracyPosition();
  const { error } = await getSupabase()
    .from('provider_profiles')
    .update({
      current_lat: pos.latitude,
      current_lng: pos.longitude,
      location_updated_at: new Date().toISOString(),
    })
    .eq('provider_id', uid);
  if (error) throw new Error('Could not update your location.');
}

export function useSetOnline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (online: boolean): Promise<ProviderProfile> => {
      const uid = uidOrThrow();
      const patch: Partial<ProviderProfile> = { online };
      if (online) {
        const pos = await getHighAccuracyPosition();
        patch.current_lat = pos.latitude;
        patch.current_lng = pos.longitude;
        patch.location_updated_at = new Date().toISOString();
      }
      const { data, error } = await getSupabase()
        .from('provider_profiles')
        .update(patch)
        .eq('provider_id', uid)
        .select('*')
        .single();
      if (error) {
        throw new Error(
          rpcErrorMessage(error, online ? 'Could not go online. Try again.' : 'Could not go offline. Try again.'),
        );
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: providerKeys.profile });
    },
  });
}

/* ── Offers & jobs ────────────────────────────────────────────────── */

/**
 * Pending offer with area-only location. The exact customer address is
 * hidden until the provider accepts — enforced server-side by
 * get_offer_feed(); the client never sees more than locality/city here.
 */
export interface OfferFeedItem {
  offer_id: string;
  booking_id: string;
  service_name: string;
  scheduled_at: string;
  locality: string;
  city: string;
  expires_at: string;
  created_at: string;
}

export function useOffers() {
  const uid = useAuth((s) => s.session?.user?.id);
  return useQuery({
    queryKey: [...providerKeys.offers, uid],
    enabled: !!uid,
    refetchInterval: 10_000,
    queryFn: async (): Promise<OfferFeedItem[]> => {
      const { data, error } = await getSupabase().rpc('get_offer_feed');
      if (error) throw new Error('Could not load job offers.');
      return (data ?? []) as OfferFeedItem[];
    },
  });
}

export interface BookingDetails {
  booking: Booking;
  service: Service | null;
  /** Full address for the assigned provider; area-only otherwise. */
  address: Address | { locality: string; city: string } | null;
  customer: { display_name: string | null; phone: string | null } | null;
  provider: {
    display_name: string | null;
    rating_avg: number;
    rating_count: number;
    completed_jobs: number;
  } | null;
}

/**
 * Role-scoped booking details via RPC. The provider gets the full customer
 * address + contact only for bookings assigned to them — never via direct
 * table selects (RLS blocks those).
 */
export async function fetchBookingDetails(bookingId: string): Promise<BookingDetails> {
  const { data, error } = await getSupabase().rpc('get_booking_details', {
    p_booking_id: bookingId,
  });
  if (error) throw new Error(rpcErrorMessage(error, 'Could not load booking details.'));
  return data as unknown as BookingDetails;
}

export type ProviderJobView = Booking & {
  service: Service | null;
  address: Address | null;
  customer: { display_name: string | null; phone: string | null } | null;
};

const ACTIVE_JOB_STATUSES: BookingStatus[] = [
  'assigned',
  'on_the_way',
  'arrived',
  'awaiting_start_otp',
  'in_service',
  'awaiting_amount_approval',
  'awaiting_payment',
];

export function useProviderJobs() {
  const uid = useAuth((s) => s.session?.user?.id);
  return useQuery({
    queryKey: [...providerKeys.jobs, uid],
    enabled: !!uid,
    queryFn: async (): Promise<ProviderJobView[]> => {
      const supabase = getSupabase();
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('provider_id', uid!)
        .in('status', ACTIVE_JOB_STATUSES)
        .order('scheduled_at', { ascending: true });
      if (error) throw new Error('Could not load your jobs.');
      const details = await Promise.all(
        (bookings ?? []).map((b) => fetchBookingDetails(b.id).catch(() => null)),
      );
      return (bookings ?? []).map((b, i) => ({
        ...b,
        service: details[i]?.service ?? null,
        address: (details[i]?.address as Address | null) ?? null,
        customer: details[i]?.customer ?? null,
      }));
    },
  });
}

export type JobDetail = ProviderJobView & {
  pendingRevision: BookingAmountRevision | null;
};

export function useJob(bookingId: string | undefined) {
  return useQuery({
    queryKey: providerKeys.job(bookingId ?? ''),
    enabled: !!bookingId,
    queryFn: async (): Promise<JobDetail> => {
      const supabase = getSupabase();
      const details = await fetchBookingDetails(bookingId!);
      const { data: revisions } = await supabase
        .from('booking_amount_revisions')
        .select('*')
        .eq('booking_id', bookingId!)
        .eq('status', 'pending')
        .order('revision_no', { ascending: false })
        .limit(1);
      return {
        ...details.booking,
        service: details.service,
        address: (details.address as Address | null) ?? null,
        customer: details.customer,
        pendingRevision: revisions?.[0] ?? null,
      };
    },
  });
}

/* ── Job lifecycle RPCs ───────────────────────────────────────────── */

export async function acceptOffer(offerId: string): Promise<Booking> {
  const { data, error } = await getSupabase().rpc('accept_offer', { p_offer_id: offerId });
  if (error) throw new Error(rpcErrorMessage(error, 'Could not accept the offer.'));
  return data;
}

export async function declineOffer(offerId: string): Promise<void> {
  const { error } = await getSupabase().rpc('decline_offer', { p_offer_id: offerId });
  if (error) throw new Error(rpcErrorMessage(error, 'Could not decline the offer.'));
}

export async function markOnTheWay(bookingId: string): Promise<Booking> {
  const { data, error } = await getSupabase().rpc('mark_on_the_way', { p_booking_id: bookingId });
  if (error) throw new Error(rpcErrorMessage(error, 'Could not update the job.'));
  return data;
}

export async function markArrived(
  bookingId: string,
  lat: number,
  lng: number,
  accuracyM: number | null,
): Promise<Booking> {
  const { data, error } = await getSupabase().rpc('mark_arrived', {
    p_booking_id: bookingId,
    p_lat: lat,
    p_lng: lng,
    p_accuracy_m: accuracyM,
  });
  if (error) throw new Error(rpcErrorMessage(error, 'Could not verify arrival.'));
  return data;
}

export async function verifyStartOtp(bookingId: string, code: string): Promise<Booking> {
  const { data, error } = await getSupabase().rpc('verify_start_otp', {
    p_booking_id: bookingId,
    p_code: code,
  });
  if (error) throw new Error(rpcErrorMessage(error, 'That code did not work.'));
  return data;
}

export interface ItemizedPaise {
  labourPaise: number;
  partsPaise: number;
  additionalPaise: number;
  discountPaise: number;
}

export async function submitFinalAmount(
  bookingId: string,
  item: ItemizedPaise,
): Promise<BookingAmountRevision> {
  const { data, error } = await getSupabase().rpc('submit_final_amount', {
    p_booking_id: bookingId,
    p_labour_paise: item.labourPaise,
    p_parts_paise: item.partsPaise,
    p_additional_paise: item.additionalPaise,
    p_discount_paise: item.discountPaise,
  });
  if (error) throw new Error(rpcErrorMessage(error, 'Could not submit the amount.'));
  return data;
}

export async function recordCashPayment(bookingId: string): Promise<Booking> {
  const { data, error } = await getSupabase().rpc('record_cash_payment', {
    p_booking_id: bookingId,
  });
  if (error) throw new Error(rpcErrorMessage(error, 'Could not record the cash payment.'));
  return data;
}

/* ── Ledger & earnings ────────────────────────────────────────────── */

export interface LedgerTotals {
  earningsPaise: number;
  commissionPaise: number;
}

export function useLedger() {
  const uid = useAuth((s) => s.session?.user?.id);
  return useQuery({
    queryKey: [...providerKeys.ledger, uid],
    enabled: !!uid,
    queryFn: async (): Promise<{ entries: LedgerEntry[]; totals: LedgerTotals }> => {
      const { data, error } = await getSupabase()
        .from('ledger_entries')
        .select('*')
        .eq('provider_id', uid!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error('Could not load your ledger.');
      const entries = data ?? [];
      const totals = entries.reduce<LedgerTotals>(
        (acc, e) => {
          if (e.type === 'service_earning') acc.earningsPaise += e.amount_paise;
          if (e.type === 'commission') acc.commissionPaise += e.amount_paise;
          return acc;
        },
        { earningsPaise: 0, commissionPaise: 0 },
      );
      return { entries, totals };
    },
  });
}

export const LEDGER_LABELS: Record<LedgerEntryType, string> = {
  service_earning: 'Service earning',
  commission: 'Platform commission',
  cash_collected: 'Cash collected',
  platform_collection: 'Platform collection (UPI)',
  settlement: 'Settlement',
  refund_adjustment: 'Refund adjustment',
  admin_adjustment: 'Admin adjustment',
  bonus: 'Bonus',
  penalty: 'Penalty',
};

/** Positive display amounts (credits), negative (debits). */
export function ledgerSignedPaise(entry: LedgerEntry): number {
  switch (entry.type) {
    case 'service_earning':
    case 'bonus':
      return entry.amount_paise;
    case 'commission':
    case 'cash_collected':
    case 'penalty':
    case 'refund_adjustment':
      return -entry.amount_paise;
    default:
      return 0;
  }
}

export function useBookingLedger(bookingId: string | undefined) {
  const uid = useAuth((s) => s.session?.user?.id);
  return useQuery({
    queryKey: [...providerKeys.ledger, uid, bookingId],
    enabled: !!uid && !!bookingId,
    queryFn: async (): Promise<LedgerEntry[]> => {
      const { data, error } = await getSupabase()
        .from('ledger_entries')
        .select('*')
        .eq('provider_id', uid!)
        .eq('booking_id', bookingId!)
        .order('created_at', { ascending: true });
      if (error) throw new Error('Could not load the payment breakdown.');
      return data ?? [];
    },
  });
}

/* ── KYC ──────────────────────────────────────────────────────────── */

export type KycDocKind = 'aadhaar' | 'pan' | 'photo' | 'trade_certificate';

export const KYC_DOC_LABELS: Record<KycDocKind, string> = {
  aadhaar: 'Aadhaar card',
  pan: 'PAN card',
  photo: 'Profile photo',
  trade_certificate: 'Trade certificate',
};

export function useKycDocuments() {
  const uid = useAuth((s) => s.session?.user?.id);
  return useQuery({
    queryKey: [...providerKeys.kycDocs, uid],
    enabled: !!uid,
    queryFn: async (): Promise<KycDocument[]> => {
      const { data, error } = await getSupabase()
        .from('kyc_documents')
        .select('*')
        .eq('provider_id', uid!)
        .order('created_at', { ascending: false });
      if (error) throw new Error('Could not load your documents.');
      return data ?? [];
    },
  });
}

export function useUploadKycDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, uri }: { kind: KycDocKind; uri: string }): Promise<string> => {
      const uid = uidOrThrow();
      const path = `${uid}/${kind}-${Date.now()}.jpg`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const { error: uploadError } = await getSupabase()
        .storage.from('kyc-docs')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw new Error('Upload failed. Check your connection and try again.');
      const { error: dbError } = await getSupabase().from('kyc_documents').insert({
        provider_id: uid,
        doc_type: kind,
        storage_path: path,
        status: 'submitted',
      });
      if (dbError) throw new Error('Could not record the document. Please try again.');
      return path;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: providerKeys.kycDocs });
    },
  });
}

/* ── Services offered ─────────────────────────────────────────────── */

export function useCatalog() {
  return useQuery({
    queryKey: providerKeys.catalog,
    queryFn: async (): Promise<{ categories: ServiceCategory[]; services: Service[] }> => {
      const supabase = getSupabase();
      const [{ data: categories, error: cErr }, { data: services, error: sErr }] = await Promise.all([
        supabase.from('service_categories').select('*').eq('active', true).order('sort_order'),
        supabase.from('services').select('*').eq('active', true).order('name'),
      ]);
      if (cErr || sErr) throw new Error('Could not load the service catalog.');
      return { categories: categories ?? [], services: services ?? [] };
    },
  });
}

export function useMyServices() {
  const uid = useAuth((s) => s.session?.user?.id);
  return useQuery({
    queryKey: [...providerKeys.myServices, uid],
    enabled: !!uid,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await getSupabase()
        .from('provider_services')
        .select('service_id')
        .eq('provider_id', uid!)
        .eq('active', true);
      if (error) throw new Error('Could not load your services.');
      return (data ?? []).map((r) => r.service_id);
    },
  });
}

export function useSetMyServices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (serviceIds: string[]): Promise<void> => {
      const uid = uidOrThrow();
      const supabase = getSupabase();
      if (serviceIds.length === 0) {
        const { error } = await supabase.from('provider_services').delete().eq('provider_id', uid);
        if (error) throw new Error('Could not save your services.');
      } else {
        const inList = `(${serviceIds.join(',')})`;
        const { error: deleteError } = await supabase
          .from('provider_services')
          .delete()
          .eq('provider_id', uid)
          .not('service_id', 'in', inList);
        if (deleteError) throw new Error('Could not save your services.');
        const { error: upsertError } = await supabase.from('provider_services').upsert(
          serviceIds.map((service_id) => ({ provider_id: uid, service_id, active: true })),
          { onConflict: 'provider_id,service_id' },
        );
        if (upsertError) throw new Error('Could not save your services.');
      }
      await queryClient.invalidateQueries({ queryKey: providerKeys.myServices });
    },
  });
}

/* ── Realtime ─────────────────────────────────────────────────────── */

export function useJobSubscription() {
  const uid = useAuth((s) => s.session?.user?.id);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!uid) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`provider-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'offers', filter: `provider_id=eq.${uid}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: providerKeys.offers });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${uid}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: providerKeys.jobs });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, queryClient]);
}

/* ── Formatting helpers ───────────────────────────────────────────── */

export function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatCountdown(expiresAtIso: string, nowMs: number): string {
  const remaining = Math.max(0, new Date(expiresAtIso).getTime() - nowMs);
  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Ticking clock for countdowns. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
