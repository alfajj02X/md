/**
 * Customer data layer: react-query hooks + Supabase RPC wrappers.
 *
 * Rules honored here:
 * - All money stays in integer paise; formatting happens in components.
 * - No direct writes to bookings/offers/payments/ledger — RPCs only.
 * - Address payloads are validated with domain/validators before insert.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../supabase/client';
import type {
  Address,
  Booking,
  BookingAmountRevision,
  BookingEvent,
  NotificationRow,
  Review,
  Service,
  ServiceCategory,
} from '../supabase/types';
import { validateAddress, type AddressInput } from '../domain/validators';
import { useAuth } from '../stores/auth';
import { useBookingDraft } from '../stores/bookingDraft';

function currentUserId(): string {
  const id = useAuth.getState().session?.user.id;
  if (!id) throw new Error('You need to sign in first.');
  return id;
}

function rpcError(e: unknown, fallback: string): Error {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return new Error((e as { message: string }).message);
  }
  return new Error(fallback);
}

/** Format an ISO timestamp for Indian display, e.g. "Sun, 28 Sep · 11:00 AM". */
export function formatSlot(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Catalog ───────────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<ServiceCategory[]> => {
      const { data, error } = await getSupabase()
        .from('service_categories')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      if (error) throw rpcError(error, 'Could not load services.');
      return data;
    },
  });
}

export function useServices(categoryId?: string | null) {
  return useQuery({
    queryKey: ['services', categoryId ?? 'all'],
    queryFn: async (): Promise<Service[]> => {
      let q = getSupabase().from('services').select('*').eq('active', true).order('name');
      if (categoryId) q = q.eq('category_id', categoryId);
      const { data, error } = await q;
      if (error) throw rpcError(error, 'Could not load services.');
      return data;
    },
  });
}

export interface ServiceDetail extends Service {
  category: ServiceCategory | null;
}

export function useService(id: string | undefined) {
  return useQuery({
    queryKey: ['service', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ServiceDetail> => {
      const { data, error } = await getSupabase()
        .from('services')
        .select('*, category:service_categories(*)')
        .eq('id', id as string)
        .maybeSingle();
      if (error) throw rpcError(error, 'Could not load this service.');
      if (!data) throw new Error('Service not found.');
      return data as unknown as ServiceDetail;
    },
  });
}

// ── Addresses ─────────────────────────────────────────────────────────────

export function useAddresses() {
  return useQuery({
    queryKey: ['addresses'],
    queryFn: async (): Promise<Address[]> => {
      const userId = currentUserId();
      const { data, error } = await getSupabase()
        .from('addresses')
        .select('*')
        .eq('customer_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw rpcError(error, 'Could not load your addresses.');
      return data;
    },
  });
}

export function useSaveAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddressInput): Promise<Address> => {
      const userId = currentUserId();
      const { phone } = validateAddress(input);
      const { data: existing } = await getSupabase()
        .from('addresses')
        .select('id')
        .eq('customer_id', userId)
        .limit(1);
      const { data, error } = await getSupabase()
        .from('addresses')
        .insert({
          customer_id: userId,
          label: input.label.trim(),
          customer_name: input.customerName.trim(),
          phone,
          line1: input.addressLine1.trim(),
          line2: input.addressLine2?.trim() || null,
          landmark: input.landmark?.trim() || null,
          locality: input.locality.trim(),
          city: input.city.trim(),
          state: input.state.trim(),
          pincode: input.pincode.trim(),
          lat: input.latitude ?? null,
          lng: input.longitude ?? null,
          is_default: !existing || existing.length === 0,
        })
        .select()
        .single();
      if (error) throw rpcError(error, 'Could not save this address.');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const userId = currentUserId();
      const { error } = await getSupabase()
        .from('addresses')
        .delete()
        .eq('id', id)
        .eq('customer_id', userId);
      if (error) throw rpcError(error, 'Could not delete this address.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

// ── Bookings ──────────────────────────────────────────────────────────────

export interface BookingCardData extends Booking {
  service: Pick<Service, 'id' | 'name' | 'base_price_paise' | 'duration_minutes'> | null;
  address: Pick<Address, 'id' | 'label' | 'line1' | 'locality' | 'city'> | null;
}

export function useBookings() {
  return useQuery({
    queryKey: ['bookings'],
    queryFn: async (): Promise<BookingCardData[]> => {
      const userId = currentUserId();
      const { data, error } = await getSupabase()
        .from('bookings')
        .select(
          '*, service:services(id,name,base_price_paise,duration_minutes), address:addresses(id,label,line1,locality,city)',
        )
        .eq('customer_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw rpcError(error, 'Could not load your bookings.');
      return (data ?? []) as unknown as BookingCardData[];
    },
  });
}

export interface BookingDetailData extends Booking {
  service: Service | null;
  address: Address | null;
  events: BookingEvent[];
  latestRevision: BookingAmountRevision | null;
  review: Review | null;
}

export interface ProviderPublicCard {
  display_name: string | null;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
}

/**
 * Role-scoped provider card for the customer: name, rating and completed
 * jobs of the assigned provider. Served by the get_booking_details RPC —
 * the client never reads provider_profiles directly.
 */
export function useProviderCard(bookingId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['booking-provider-card', bookingId],
    enabled: Boolean(bookingId) && enabled,
    queryFn: async (): Promise<ProviderPublicCard | null> => {
      const { data, error } = await getSupabase().rpc('get_booking_details', {
        p_booking_id: bookingId as string,
      });
      if (error) throw rpcError(error, 'Could not load professional details.');
      const details = data as unknown as {
        provider: ProviderPublicCard | null;
      };
      return details.provider;
    },
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: ['booking', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<BookingDetailData> => {
      const bookingId = id as string;
      const supabase = getSupabase();
      const [bookingRes, eventsRes, revisionRes, reviewRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('*, service:services(*), address:addresses(*)')
          .eq('id', bookingId)
          .maybeSingle(),
        supabase
          .from('booking_events')
          .select('*')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: true }),
        supabase
          .from('booking_amount_revisions')
          .select('*')
          .eq('booking_id', bookingId)
          .order('revision_no', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('reviews')
          .select('*')
          .eq('booking_id', bookingId)
          .maybeSingle(),
      ]);
      if (bookingRes.error) throw rpcError(bookingRes.error, 'Could not load this booking.');
      if (!bookingRes.data) throw new Error('Booking not found.');
      if (eventsRes.error) throw rpcError(eventsRes.error, 'Could not load booking updates.');
      return {
        ...(bookingRes.data as unknown as Booking),
        service: (bookingRes.data as unknown as { service: Service | null }).service,
        address: (bookingRes.data as unknown as { address: Address | null }).address,
        events: eventsRes.data ?? [],
        latestRevision: revisionRes.data,
        review: reviewRes.data,
      };
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Booking> => {
      const draft = useBookingDraft.getState();
      if (!draft.serviceId || !draft.addressId || !draft.scheduledAt) {
        throw new Error('Please pick a service, address and time slot first.');
      }
      const { data, error } = await getSupabase().rpc('create_booking', {
        p_service_id: draft.serviceId,
        p_address_id: draft.addressId,
        p_scheduled_at: draft.scheduledAt,
        p_notes: draft.notes.trim() || null,
      });
      if (error) throw rpcError(error, 'Could not create your booking.');
      draft.reset();
      return data as Booking;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: string; reason: string }): Promise<Booking> => {
      const { data, error } = await getSupabase().rpc('cancel_booking', {
        p_booking_id: bookingId,
        p_reason: reason,
      });
      if (error) throw rpcError(error, 'Could not cancel this booking.');
      return data as Booking;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['booking', vars.bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

/**
 * Generate the 6-digit start code. Per the backend contract, the CUSTOMER
 * issues the code (RPC requires customer_id = auth.uid()) and reads it aloud
 * to the professional, who enters it via verify_start_otp. The provider gets
 * an in-app notification that the code is ready.
 */
export function useIssueStartOtp() {
  return useMutation({
    mutationFn: async (bookingId: string): Promise<string> => {
      const { data, error } = await getSupabase().rpc('issue_start_otp', {
        p_booking_id: bookingId,
      });
      if (error) throw rpcError(error, 'Could not generate the start code.');
      return data as string;
    },
  });
}

export function useApproveFinalAmount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      revisionId,
      method,
    }: {
      bookingId: string;
      revisionId: string;
      method: 'upi' | 'cash';
    }): Promise<Booking> => {
      const { data, error } = await getSupabase().rpc('approve_final_amount', {
        p_booking_id: bookingId,
        p_revision_id: revisionId,
        p_method: method,
      });
      if (error) throw rpcError(error, 'Could not approve the amount.');
      return data as Booking;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['booking', vars.bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

export function useRequestAmountRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string): Promise<Booking> => {
      const { data, error } = await getSupabase().rpc('request_amount_revision', {
        p_booking_id: bookingId,
      });
      if (error) throw rpcError(error, 'Could not request a revision.');
      return data as Booking;
    },
    onSuccess: (_data, bookingId) => {
      void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      stars,
      text,
    }: {
      bookingId: string;
      stars: number;
      text?: string;
    }): Promise<Review> => {
      if (stars < 1 || stars > 5) throw new Error('Please choose 1 to 5 stars.');
      const { data, error } = await getSupabase().rpc('submit_review', {
        p_booking_id: bookingId,
        p_stars: stars,
        p_text: text?.trim() || null,
      });
      if (error) throw rpcError(error, 'Could not submit your review.');
      return data as Review;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['booking', vars.bookingId] });
    },
  });
}

// ── Notifications (start OTP arrives here too) ────────────────────────────

export function useBookingNotifications(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await getSupabase()
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId())
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw rpcError(error, 'Could not load notifications.');
      return (data ?? []).filter((n) => {
        const d = n.data as { booking_id?: string } | null;
        return d?.booking_id === bookingId;
      });
    },
  });
}

// ── Realtime ──────────────────────────────────────────────────────────────

/** Live booking tracking: invalidates booking queries on any change. */
export function useBookingSubscription(bookingId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!bookingId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`customer-booking-${bookingId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `id=eq.${bookingId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
          void queryClient.invalidateQueries({ queryKey: ['bookings'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'booking_events', filter: `booking_id=eq.${bookingId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookingId, queryClient]);
}

/** Keep the bookings list fresh when anything changes on the user's bookings. */
export function useBookingsSubscription() {
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);
  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`customer-bookings-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `customer_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['bookings'] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
