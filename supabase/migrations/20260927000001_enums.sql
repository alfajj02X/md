-- Mechanic Dekho: enums
-- All money is integer paise; all timestamps timestamptz.

create type user_role as enum ('customer', 'provider', 'admin');

create type booking_status as enum (
  'pending',
  'offer',
  'assigned',
  'on_the_way',
  'arrived',
  'awaiting_start_otp',
  'in_service',
  'awaiting_amount_approval',
  'awaiting_payment',
  'completed',
  'cancelled',
  'rescheduled',
  'provider_unavailable',
  'refund_pending',
  'refunded'
);

create type kyc_status as enum (
  'not_started',
  'submitted',
  'under_review',
  'changes_required',
  'approved',
  'rejected',
  'suspended'
);

create type payment_status as enum (
  'unpaid',
  'pending',
  'paid',
  'failed',
  'refunded'
);

create type payment_method as enum ('upi', 'cash');

create type payment_purpose as enum ('booking_fee', 'final_amount', 'refund');

create type offer_status as enum ('pending', 'accepted', 'declined', 'expired');

create type ledger_entry_type as enum (
  'service_earning',
  'commission',
  'cash_collected',
  'platform_collection',
  'settlement',
  'refund_adjustment',
  'admin_adjustment',
  'bonus',
  'penalty'
);

create type amount_revision_status as enum (
  'pending',
  'approved',
  'superseded',
  'rejected'
);
