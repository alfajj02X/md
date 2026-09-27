-- Mechanic Dekho: server-authoritative booking RPCs
-- Every critical mutation validates actor, current state, and the canonical
-- transition map. Clients have NO direct write path to bookings/offers/
-- payments/ledger (see 0003): these security-definer functions are the only
-- way privileged state changes.

create extension if not exists pgcrypto;

-- Canonical transition map, mirroring src/domain/booking.ts.
create table booking_transitions (
  from_status booking_status not null,
  to_status booking_status not null,
  primary key (from_status, to_status)
);
insert into booking_transitions (from_status, to_status) values
  ('pending','offer'), ('pending','assigned'), ('pending','cancelled'), ('pending','rescheduled'),
  ('pending','provider_unavailable'),
  ('offer','assigned'), ('offer','pending'), ('offer','cancelled'), ('offer','provider_unavailable'),
  ('assigned','on_the_way'), ('assigned','cancelled'), ('assigned','rescheduled'),
  ('on_the_way','arrived'), ('on_the_way','cancelled'),
  ('arrived','awaiting_start_otp'),
  ('awaiting_start_otp','in_service'), ('awaiting_start_otp','arrived'),
  ('in_service','awaiting_amount_approval'),
  ('awaiting_amount_approval','awaiting_payment'), ('awaiting_amount_approval','in_service'),
  ('awaiting_payment','completed'),
  ('completed','refund_pending'),
  ('rescheduled','pending'),
  ('provider_unavailable','pending'),
  ('refund_pending','refunded');

create or replace function assert_legal_transition(f booking_status, t booking_status)
returns void language plpgsql as $$
begin
  if not exists (select 1 from booking_transitions where from_status = f and to_status = t) then
    raise exception 'Illegal booking transition: % -> %', f, t;
  end if;
end $$;

-- Internal: guarded transition + audit event. Locks the booking row.
create or replace function do_transition(
  p_booking_id uuid,
  p_to booking_status,
  p_actor_id uuid,
  p_actor_role user_role,
  p_metadata jsonb default '{}'
) returns bookings language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  old_status booking_status;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  old_status := b.status;
  perform assert_legal_transition(old_status, p_to);

  update bookings
     set status = p_to, version = version + 1, updated_at = now()
   where id = p_booking_id
  returning * into b;

  insert into booking_events (booking_id, actor_id, actor_role, from_status, to_status, metadata)
  values (p_booking_id, p_actor_id, p_actor_role, old_status, p_to, p_metadata);

  return b;
end $$;

create or replace function notify_user(
  p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, p_data);
end $$;

-- Platform settings are stored as {"value": ...}. Typed accessors:
create or replace function setting_int(p_key text, p_default integer)
returns integer language sql security definer set search_path = public as $$
  select coalesce((select (value->>'value')::integer from platform_settings where key = p_key), p_default);
$$;

-- The transition map is static config. Lock it down to read-only for
-- everyone (no RLS gap); writes happen only in migrations.
alter table booking_transitions enable row level security;
create policy booking_transitions_read on booking_transitions
  for select using (true);
