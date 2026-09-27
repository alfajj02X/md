-- Mechanic Dekho: core tables
-- RLS is enabled on every table in 0003. No table is client-writable for
-- privileged fields; status/money transitions go through RPCs in 0004.

-- One profile per auth user. Role authority lives here, server-side.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'customer',
  phone text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Provider-specific state. KYC approval is admin-only (see RLS + RPC).
create table provider_profiles (
  provider_id uuid primary key references profiles (id) on delete cascade,
  kyc_status kyc_status not null default 'not_started',
  kyc_reviewer_note text,
  online boolean not null default false,
  rating_avg numeric(3,2) not null default 0.00,
  rating_count integer not null default 0,
  completed_jobs integer not null default 0,
  current_lat double precision,
  current_lng double precision,
  location_updated_at timestamptz,
  cash_liability_paise integer not null default 0 check (cash_liability_paise >= 0),
  service_city text not null default 'Berhampore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backend-driven service catalog. Never hardcoded in the app.
create table service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text,
  icon_name text not null default 'wrench',
  sort_order integer not null default 0,
  active boolean not null default true
);

create table services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references service_categories (id) on delete restrict,
  name text not null,
  description text,
  base_price_paise integer check (base_price_paise is null or base_price_paise >= 0),
  duration_minutes integer,
  inclusions text[] not null default '{}',
  exclusions text[] not null default '{}',
  active boolean not null default true
);

create table provider_services (
  provider_id uuid not null references provider_profiles (provider_id) on delete cascade,
  service_id uuid not null references services (id) on delete cascade,
  active boolean not null default true,
  primary key (provider_id, service_id)
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles (id) on delete cascade,
  label text not null,
  customer_name text not null,
  phone text not null,
  line1 text not null,
  line2 text,
  landmark text,
  locality text not null,
  city text not null,
  state text not null,
  pincode text not null check (pincode ~ '^\d{6}$'),
  lat double precision,
  lng double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- The booking. status/money are changed ONLY by RPCs in 0004.
create table bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles (id) on delete restrict,
  provider_id uuid references profiles (id) on delete restrict,
  service_id uuid not null references services (id) on delete restrict,
  address_id uuid not null references addresses (id) on delete restrict,
  scheduled_at timestamptz not null,
  notes text,
  status booking_status not null default 'pending',
  version integer not null default 0,

  booking_fee_paise integer not null default 4900 check (booking_fee_paise >= 0),
  booking_fee_status payment_status not null default 'unpaid',

  -- Final amount lifecycle: provider submits revisions, customer approves one.
  approved_amount_paise integer check (approved_amount_paise is null or approved_amount_paise >= 0),
  approved_revision_id uuid,
  payment_method payment_method,
  final_payment_status payment_status not null default 'unpaid',

  -- Start-service OTP (hash only, never plaintext).
  start_otp_hash text,
  start_otp_expires_at timestamptz,
  start_otp_attempts integer not null default 0,
  start_otp_locked boolean not null default false,
  started_at timestamptz,

  -- Arrival evidence.
  arrival_lat double precision,
  arrival_lng double precision,
  arrival_accuracy_m double precision,
  arrival_distance_m double precision,
  arrived_at timestamptz,

  cancel_reason text,
  cancelled_by uuid references profiles (id),
  cancelled_at timestamptz,
  reschedule_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Itemized amount revisions. History is immutable; new revisions supersede.
create table booking_amount_revisions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  revision_no integer not null,
  labour_paise integer not null check (labour_paise >= 0),
  parts_paise integer not null check (parts_paise >= 0),
  additional_paise integer not null check (additional_paise >= 0),
  discount_paise integer not null check (discount_paise >= 0),
  total_paise integer not null check (total_paise >= 0),
  status amount_revision_status not null default 'pending',
  submitted_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (booking_id, revision_no)
);

-- Append-only audit trail of every status transition.
create table booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  actor_id uuid references profiles (id),
  actor_role user_role,
  from_status booking_status,
  to_status booking_status not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on booking_events (booking_id, created_at);

-- Auto-assignment offers. Exactly one pending offer per booking.
create table offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  provider_id uuid not null references profiles (id) on delete cascade,
  expires_at timestamptz not null,
  status offer_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (booking_id, provider_id)
);
create unique index offers_one_pending_per_booking
  on offers (booking_id) where status = 'pending';

-- Payments. Rows are created by Edge Functions (service role) only.
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete restrict,
  purpose payment_purpose not null,
  amount_paise integer not null check (amount_paise > 0),
  method payment_method not null,
  status payment_status not null default 'pending',
  idempotency_key text not null unique,
  razorpay_order_id text unique,
  razorpay_payment_id text,
  razorpay_signature text,
  failure_reason text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_booking_idx on payments (booking_id);

-- Immutable provider ledger. Corrections are compensating entries.
create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references profiles (id) on delete restrict,
  booking_id uuid references bookings (id) on delete restrict,
  type ledger_entry_type not null,
  amount_paise integer not null,
  cash_liability_after_paise integer not null,
  note text,
  created_at timestamptz not null default now()
);
create index ledger_provider_idx on ledger_entries (provider_id, created_at);

-- Reviews: one per completed booking, by the booking's customer only.
create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings (id) on delete cascade,
  customer_id uuid not null references profiles (id) on delete cascade,
  provider_id uuid not null references profiles (id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  text text check (text is null or char_length(text) <= 1000),
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- Platform settings: read-only for clients, writable by admins only.
create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table kyc_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references profiles (id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  status kyc_status not null default 'submitted',
  reviewer_note text,
  created_at timestamptz not null default now()
);

-- updated_at maintenance
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger provider_profiles_updated_at before update on provider_profiles
  for each row execute function set_updated_at();
create trigger bookings_updated_at before update on bookings
  for each row execute function set_updated_at();
create trigger payments_updated_at before update on payments
  for each row execute function set_updated_at();
