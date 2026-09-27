/**
 * Hand-maintained Supabase Database types mirroring supabase/migrations.
 * Keep in sync with the SQL schema; regenerate from the dashboard when the
 * backend is live (npx supabase gen types).
 */

export type UserRole = 'customer' | 'provider' | 'admin';

export type BookingStatus =
  | 'pending'
  | 'offer'
  | 'assigned'
  | 'on_the_way'
  | 'arrived'
  | 'awaiting_start_otp'
  | 'in_service'
  | 'awaiting_amount_approval'
  | 'awaiting_payment'
  | 'completed'
  | 'cancelled'
  | 'rescheduled'
  | 'provider_unavailable'
  | 'refund_pending'
  | 'refunded';

export type KycStatus =
  | 'not_started'
  | 'submitted'
  | 'under_review'
  | 'changes_required'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'upi' | 'cash';
export type PaymentPurpose = 'booking_fee' | 'final_amount' | 'refund';
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export type LedgerEntryType =
  | 'service_earning'
  | 'commission'
  | 'cash_collected'
  | 'platform_collection'
  | 'settlement'
  | 'refund_adjustment'
  | 'admin_adjustment'
  | 'bonus'
  | 'penalty';

export type Profile = {
  id: string;
  role: UserRole;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ProviderProfile = {
  provider_id: string;
  kyc_status: KycStatus;
  kyc_reviewer_note: string | null;
  online: boolean;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
  cash_liability_paise: number;
  service_city: string;
  created_at: string;
  updated_at: string;
};

export type ServiceCategory = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  icon_name: string;
  sort_order: number;
  active: boolean;
};

export type Service = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price_paise: number | null;
  duration_minutes: number | null;
  inclusions: string[];
  exclusions: string[];
  active: boolean;
};

export type Address = {
  id: string;
  customer_id: string;
  label: string;
  customer_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: string;
};

export type Booking = {
  id: string;
  customer_id: string;
  provider_id: string | null;
  service_id: string;
  address_id: string;
  scheduled_at: string;
  notes: string | null;
  status: BookingStatus;
  version: number;
  booking_fee_paise: number;
  booking_fee_status: PaymentStatus;
  approved_amount_paise: number | null;
  approved_revision_id: string | null;
  payment_method: PaymentMethod | null;
  final_payment_status: PaymentStatus;
  started_at: string | null;
  arrival_lat: number | null;
  arrival_lng: number | null;
  arrival_accuracy_m: number | null;
  arrival_distance_m: number | null;
  arrived_at: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  reschedule_count: number;
  created_at: string;
  updated_at: string;
};

export type BookingAmountRevision = {
  id: string;
  booking_id: string;
  revision_no: number;
  labour_paise: number;
  parts_paise: number;
  additional_paise: number;
  discount_paise: number;
  total_paise: number;
  status: 'pending' | 'approved' | 'superseded' | 'rejected';
  submitted_by: string;
  created_at: string;
};

export type BookingEvent = {
  id: string;
  booking_id: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  from_status: BookingStatus | null;
  to_status: BookingStatus;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Offer = {
  id: string;
  booking_id: string;
  provider_id: string;
  expires_at: string;
  status: OfferStatus;
  created_at: string;
};

export type Payment = {
  id: string;
  booking_id: string;
  purpose: PaymentPurpose;
  amount_paise: number;
  method: PaymentMethod;
  status: PaymentStatus;
  idempotency_key: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LedgerEntry = {
  id: string;
  provider_id: string;
  booking_id: string | null;
  type: LedgerEntryType;
  amount_paise: number;
  cash_liability_after_paise: number;
  note: string | null;
  created_at: string;
};

export type ProviderService = {
  provider_id: string;
  service_id: string;
  active: boolean;
};

export type KycDocument = {
  id: string;
  provider_id: string;
  doc_type: string;
  storage_path: string;
  status: KycStatus;
  reviewer_note: string | null;
  created_at: string;
};

export type Review = {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  stars: number;
  text: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type PushToken = {
  id: string;
  user_id: string;
  expo_push_token: string;
  platform: string;
  created_at: string;
  updated_at: string;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13';
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: { id: string; role: UserRole; phone?: string | null; display_name?: string | null; avatar_url?: string | null };
        Update: Partial<Profile>;
        Relationships: [];
      };
      provider_profiles: {
        Row: ProviderProfile;
        Insert: Partial<ProviderProfile> & { provider_id: string };
        Update: Partial<ProviderProfile>;
        Relationships: [];
      };
      service_categories: {
        Row: ServiceCategory; Insert: Partial<ServiceCategory>; Update: Partial<ServiceCategory>;
        Relationships: [];
      };
      services: {
        Row: Service; Insert: Partial<Service>; Update: Partial<Service>;
        Relationships: [];
      };
      addresses: {
        Row: Address;
        Insert: Omit<Address, 'id' | 'created_at'>;
        Update: Partial<Address>;
        Relationships: [];
      };
      bookings: {
        Row: Booking; Insert: Partial<Booking>; Update: Partial<Booking>;
        Relationships: [];
      };
      booking_amount_revisions: {
        Row: BookingAmountRevision; Insert: Partial<BookingAmountRevision>; Update: Partial<BookingAmountRevision>;
        Relationships: [];
      };
      booking_events: {
        Row: BookingEvent; Insert: Partial<BookingEvent>; Update: Partial<BookingEvent>;
        Relationships: [];
      };
      offers: {
        Row: Offer; Insert: Partial<Offer>; Update: Partial<Offer>;
        Relationships: [];
      };
      payments: {
        Row: Payment; Insert: Partial<Payment>; Update: Partial<Payment>;
        Relationships: [];
      };
      ledger_entries: {
        Row: LedgerEntry; Insert: Partial<LedgerEntry>; Update: Partial<LedgerEntry>;
        Relationships: [];
      };
      kyc_documents: {
        Row: KycDocument;
        Insert: { provider_id: string; doc_type: string; storage_path: string; status?: KycStatus };
        Update: Partial<KycDocument>;
        Relationships: [];
      };
      provider_services: {
        Row: ProviderService;
        Insert: { provider_id: string; service_id: string; active?: boolean };
        Update: Partial<ProviderService>;
        Relationships: [];
      };
      reviews: {
        Row: Review;
        Insert: Omit<Review, 'id' | 'created_at'>;
        Update: Partial<Review>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow; Insert: Partial<NotificationRow>; Update: Partial<NotificationRow>;
        Relationships: [];
      };
      push_tokens: {
        Row: PushToken;
        Insert: { user_id: string; expo_push_token: string; platform?: string };
        Update: Partial<PushToken>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
    Functions: {
      create_booking: {
        Args: {
          p_service_id: string;
          p_address_id: string;
          p_scheduled_at: string;
          p_notes?: string | null;
        };
        Returns: Booking;
      };
      accept_offer: { Args: { p_offer_id: string }; Returns: Booking };
      decline_offer: { Args: { p_offer_id: string }; Returns: void };
      mark_on_the_way: { Args: { p_booking_id: string }; Returns: Booking };
      mark_arrived: {
        Args: {
          p_booking_id: string;
          p_lat: number;
          p_lng: number;
          p_accuracy_m?: number | null;
        };
        Returns: Booking;
      };
      issue_start_otp: { Args: { p_booking_id: string }; Returns: string };
      get_offer_feed: {
        Args: Record<string, never>;
        Returns: {
          offer_id: string;
          booking_id: string;
          service_name: string;
          scheduled_at: string;
          locality: string;
          city: string;
          expires_at: string;
          created_at: string;
        }[];
      };
      get_booking_details: {
        Args: { p_booking_id: string };
        Returns: {
          booking: Booking;
          service: Service | null;
          address: Address | { locality: string; city: string } | null;
          customer: { display_name: string | null; phone: string | null } | null;
          provider: {
            display_name: string | null;
            rating_avg: number;
            rating_count: number;
            completed_jobs: number;
          } | null;
        };
      };
      verify_start_otp: {
        Args: { p_booking_id: string; p_code: string };
        Returns: Booking;
      };
      submit_final_amount: {
        Args: {
          p_booking_id: string;
          p_labour_paise: number;
          p_parts_paise: number;
          p_additional_paise: number;
          p_discount_paise: number;
        };
        Returns: BookingAmountRevision;
      };
      approve_final_amount: {
        Args: {
          p_booking_id: string;
          p_revision_id: string;
          p_method: PaymentMethod;
        };
        Returns: Booking;
      };
      request_amount_revision: {
        Args: { p_booking_id: string };
        Returns: Booking;
      };
      record_cash_payment: {
        Args: { p_booking_id: string };
        Returns: Booking;
      };
      cancel_booking: {
        Args: { p_booking_id: string; p_reason: string };
        Returns: Booking;
      };
      reschedule_booking: {
        Args: { p_booking_id: string; p_new_slot: string };
        Returns: Booking;
      };
      submit_review: {
        Args: { p_booking_id: string; p_stars: number; p_text?: string | null };
        Returns: Review;
      };
    };
  };
};
