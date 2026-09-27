-- Mechanic Dekho: Row Level Security
-- Principle: clients get row-level READ access to their own data and almost
-- no direct WRITE access to privileged state. All booking/payment/ledger
-- mutations go through security-definer RPCs (0004) which re-validate
-- actor, current state, and authorization server-side.

-- Helper: is the caller an admin? Security definer so it can read profiles.
create or replace function is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Helper: parties to a booking (customer or assigned provider).
create or replace function is_booking_party(b bookings)
returns boolean language sql security definer set search_path = public as $$
  select b.customer_id = auth.uid()
      or b.provider_id = auth.uid()
      or is_admin();
$$;

alter table profiles enable row level security;
alter table provider_profiles enable row level security;
alter table service_categories enable row level security;
alter table services enable row level security;
alter table provider_services enable row level security;
alter table addresses enable row level security;
alter table bookings enable row level security;
alter table booking_amount_revisions enable row level security;
alter table booking_events enable row level security;
alter table offers enable row level security;
alter table payments enable row level security;
alter table ledger_entries enable row level security;
alter table reviews enable row level security;
alter table notifications enable row level security;
alter table platform_settings enable row level security;
alter table kyc_documents enable row level security;

-- ── profiles ─────────────────────────────────────────────────────────────
-- A user reads their own profile; admins read all. Nobody grants themselves
-- a role: role changes are blocked for non-admins by trigger (see below).
create policy profiles_select_own on profiles
  for select using (id = auth.uid() or is_admin());
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());
create policy profiles_update_own on profiles
  for update using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

create or replace function prevent_role_escalation()
returns trigger language plpgsql as $$
begin
  -- INSERT: nobody may create themselves as admin. UPDATE: only admins may
  -- change roles. This runs on every insert/update so the signup path
  -- (auth.setRole) can only ever pick customer/provider.
  if tg_op = 'INSERT' then
    if new.role = 'admin' then
      raise exception 'Only admins can create admin profiles';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role and not is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end $$;
create trigger profiles_no_role_escalation before insert or update of role on profiles
  for each row execute function prevent_role_escalation();

-- ── provider_profiles ────────────────────────────────────────────────────
-- Provider A cannot read provider B's KYC: select is own-or-admin only.
create policy provider_profiles_select on provider_profiles
  for select using (provider_id = auth.uid() or is_admin());
create policy provider_profiles_insert_own on provider_profiles
  for insert with check (provider_id = auth.uid());
-- Providers may toggle online/location; protected columns are trigger-guarded.
create policy provider_profiles_update_own on provider_profiles
  for update using (provider_id = auth.uid() or is_admin())
  with check (provider_id = auth.uid() or is_admin());

create or replace function guard_provider_profile_update()
returns trigger language plpgsql as $$
begin
  if is_admin() then return new; end if;
  if new.kyc_status is distinct from old.kyc_status
     or new.kyc_reviewer_note is distinct from old.kyc_reviewer_note
     or new.rating_avg is distinct from old.rating_avg
     or new.rating_count is distinct from old.rating_count
     or new.completed_jobs is distinct from old.completed_jobs
     or new.cash_liability_paise is distinct from old.cash_liability_paise then
    raise exception 'Only admins/backend may change protected provider fields';
  end if;
  return new;
end $$;
create trigger provider_profiles_guarded before update on provider_profiles
  for each row execute function guard_provider_profile_update();

-- ── catalog (backend-driven, public read) ─────────────────────────────────
create policy categories_public_read on service_categories
  for select using (active = true or is_admin());
create policy services_public_read on services
  for select using (active = true or is_admin());
create policy provider_services_read on provider_services
  for select using (true);
create policy provider_services_manage_own on provider_services
  for all using (provider_id = auth.uid() or is_admin())
  with check (provider_id = auth.uid() or is_admin());

-- ── addresses ────────────────────────────────────────────────────────────
create policy addresses_owner on addresses
  for all using (customer_id = auth.uid() or is_admin())
  with check (customer_id = auth.uid() or is_admin());

-- ── bookings ─────────────────────────────────────────────────────────────
-- PROOF customer A cannot read customer B's booking: select requires party.
create policy bookings_select_party on bookings
  for select using (is_booking_party(bookings));
-- No insert/update/delete policies for authenticated: all writes via RPC.
-- PROOF client cannot bypass the state machine and unassigned providers
-- cannot modify bookings: there is simply no direct write path.

-- ── amount revisions / events ────────────────────────────────────────────
create policy revisions_select_party on booking_amount_revisions
  for select using (
    exists (select 1 from bookings b
            where b.id = booking_amount_revisions.booking_id
              and is_booking_party(b))
  );
create policy events_select_party on booking_events
  for select using (
    exists (select 1 from bookings b
            where b.id = booking_events.booking_id
              and is_booking_party(b))
  );

-- ── offers ───────────────────────────────────────────────────────────────
create policy offers_select on offers
  for select using (
    provider_id = auth.uid()
    or exists (select 1 from bookings b
               where b.id = offers.booking_id and b.customer_id = auth.uid())
    or is_admin()
  );

-- ── payments ─────────────────────────────────────────────────────────────
create policy payments_select_party on payments
  for select using (
    exists (select 1 from bookings b
            where b.id = payments.booking_id and is_booking_party(b))
  );

-- ── ledger ───────────────────────────────────────────────────────────────
create policy ledger_select on ledger_entries
  for select using (provider_id = auth.uid() or is_admin());

-- ── reviews ──────────────────────────────────────────────────────────────
create policy reviews_select on reviews
  for select using (
    customer_id = auth.uid() or provider_id = auth.uid() or is_admin()
  );

-- ── notifications ────────────────────────────────────────────────────────
create policy notifications_owner on notifications
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- ── platform_settings ────────────────────────────────────────────────────
-- PROOF customers/providers cannot modify commission/settings: read-only.
create policy platform_settings_read on platform_settings
  for select using (true);

-- ── kyc_documents ────────────────────────────────────────────────────────
-- PROOF provider A cannot access provider B's KYC docs.
create policy kyc_docs_select on kyc_documents
  for select using (provider_id = auth.uid() or is_admin());
create policy kyc_docs_insert_own on kyc_documents
  for insert with check (provider_id = auth.uid());
