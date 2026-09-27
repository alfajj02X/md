-- Mechanic Dekho: customer + provider booking RPCs (part 1)

-- ── create_booking ───────────────────────────────────────────────────────
-- Customer creates a booking. The ₹49 fee is read from platform settings
-- (default 4900 paise) so it stays backend-configurable.
create or replace function create_booking(
  p_service_id uuid, p_address_id uuid, p_scheduled_at timestamptz, p_notes text default null
) returns bookings language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  fee integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if not exists (select 1 from services s where s.id = p_service_id and s.active) then
    raise exception 'Service not available';
  end if;
  if not exists (select 1 from addresses a
                  where a.id = p_address_id and a.customer_id = auth.uid()) then
    raise exception 'Address not found';
  end if;
  if p_scheduled_at <= now() + interval '30 minutes' then
    raise exception 'Choose a slot at least 30 minutes ahead';
  end if;

  fee := setting_int('booking_fee_paise', 4900);

  insert into bookings (customer_id, service_id, address_id, scheduled_at, notes, booking_fee_paise)
  values (auth.uid(), p_service_id, p_address_id, p_scheduled_at, p_notes, fee)
  returning * into b;

  insert into booking_events (booking_id, actor_id, actor_role, to_status, metadata)
  values (b.id, auth.uid(), 'customer', 'pending', jsonb_build_object('fee_paise', fee));

  perform notify_user(auth.uid(), 'booking_created', 'Booking confirmed',
    'Your booking is confirmed. We are finding a professional for you.',
    jsonb_build_object('booking_id', b.id));
  return b;
end $$;

-- ── accept_offer ─────────────────────────────────────────────────────────
-- Transactional: exactly one provider can accept; expiry uses server clock.
create or replace function accept_offer(p_offer_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  o offers;
  b bookings;
begin
  select * into o from offers where id = p_offer_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if o.provider_id != auth.uid() then raise exception 'Offer not assigned to you'; end if;
  if o.status != 'pending' then raise exception 'Offer is no longer pending'; end if;
  if o.expires_at <= now() then
    update offers set status = 'expired' where id = o.id;
    raise exception 'Offer expired';
  end if;

  select * into b from bookings where id = o.booking_id for update;
  if b.status != 'offer' then raise exception 'Booking is no longer on offer'; end if;
  if b.provider_id is not null then raise exception 'Booking already assigned'; end if;

  -- KYC + online gate.
  if not exists (select 1 from provider_profiles pp
                  where pp.provider_id = auth.uid()
                    and pp.kyc_status = 'approved' and pp.online) then
    raise exception 'Provider not eligible (KYC/online)';
  end if;

  update offers set status = 'accepted' where id = o.id;
  -- Any other pending offer for this booking is now stale.
  update offers set status = 'expired'
   where booking_id = o.booking_id and status = 'pending' and id != o.id;

  update bookings set provider_id = auth.uid() where id = b.id;
  b := do_transition(o.booking_id, 'assigned', auth.uid(), 'provider',
        jsonb_build_object('offer_id', o.id));

  perform notify_user(b.customer_id, 'provider_assigned', 'Professional assigned',
    'Your professional is on the way to your booking.',
    jsonb_build_object('booking_id', b.id, 'provider_id', auth.uid()));
  return b;
end $$;

-- ── decline_offer ────────────────────────────────────────────────────────
create or replace function decline_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o offers;
begin
  select * into o from offers where id = p_offer_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if o.provider_id != auth.uid() then raise exception 'Offer not assigned to you'; end if;
  if o.status != 'pending' then raise exception 'Offer is no longer pending'; end if;
  update offers set status = 'declined' where id = o.id;
  perform do_transition(o.booking_id, 'pending', auth.uid(), 'provider',
    jsonb_build_object('offer_id', o.id, 'reason', 'declined'));
end $$;

-- ── mark_on_the_way ──────────────────────────────────────────────────────
create or replace function mark_on_the_way(p_booking_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.provider_id != auth.uid() then raise exception 'Not your booking'; end if;
  b := do_transition(p_booking_id, 'on_the_way', auth.uid(), 'provider');
  perform notify_user(b.customer_id, 'provider_on_the_way', 'Professional on the way',
    'Your professional has started towards your location.',
    jsonb_build_object('booking_id', b.id));
  return b;
end $$;

-- ── mark_arrived ─────────────────────────────────────────────────────────
-- Server-side geofence: provider GPS must be within the configured radius
-- of the booking address. Evidence is recorded on the booking.
create or replace function mark_arrived(
  p_booking_id uuid, p_lat double precision, p_lng double precision, p_accuracy_m double precision default null
) returns bookings language plpgsql security definer set search_path = public as $$
declare
  b bookings; a addresses;
  dist_m double precision;
  radius_m integer;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.provider_id != auth.uid() then raise exception 'Not your booking'; end if;
  if b.status != 'on_the_way' then raise exception 'Booking is not on the way'; end if;

  select * into a from addresses where id = b.address_id;
  if a.lat is null or a.lng is null then
    raise exception 'Booking address has no coordinates';
  end if;

  -- Haversine in SQL (metres).
  dist_m := 6371000 * 2 * asin(sqrt(
      sin(radians(p_lat - a.lat) / 2) ^ 2 +
      cos(radians(a.lat)) * cos(radians(p_lat)) * sin(radians(p_lng - a.lng) / 2) ^ 2));

  radius_m := setting_int('geofence_radius_m', 100);
  if dist_m > radius_m then
    raise exception 'You are %m away — get within %m of the customer to mark arrival',
      round(dist_m)::integer, radius_m;
  end if;

  update bookings
     set arrival_lat = p_lat, arrival_lng = p_lng,
         arrival_accuracy_m = p_accuracy_m,
         arrival_distance_m = dist_m, arrived_at = now()
   where id = p_booking_id;

  b := do_transition(p_booking_id, 'arrived', auth.uid(), 'provider',
        jsonb_build_object('distance_m', round(dist_m), 'threshold_m', radius_m,
                           'accuracy_m', p_accuracy_m));
  perform notify_user(b.customer_id, 'provider_arrived', 'Professional arrived',
    'Your professional has arrived. Share the start OTP to begin the service.',
    jsonb_build_object('booking_id', b.id));
  return b;
end $$;

-- ── issue_start_otp ──────────────────────────────────────────────────────
-- Customer requests the start OTP. Returns the plaintext code ONCE so the
-- app can display it; only the hash is stored.
create or replace function issue_start_otp(p_booking_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  code text;
  expiry interval;
  max_attempts integer;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.customer_id != auth.uid() then raise exception 'Not your booking'; end if;
  if b.status not in ('arrived', 'awaiting_start_otp') then
    raise exception 'OTP can only be issued after arrival';
  end if;

  code := lpad((floor(random() * 900000) + 100000)::text, 6, '0');
  expiry := make_interval(secs => setting_int('start_otp_expiry_s', 600));
  max_attempts := setting_int('start_otp_max_attempts', 5);

  update bookings
     set start_otp_hash = crypt(code, gen_salt('bf', 8)),
         start_otp_expires_at = now() + expiry,
         start_otp_attempts = 0,
         start_otp_locked = false
   where id = p_booking_id;

  if b.status = 'arrived' then
    perform do_transition(p_booking_id, 'awaiting_start_otp', auth.uid(), 'customer');
  end if;
  perform notify_user(b.provider_id, 'start_otp_issued', 'Start OTP ready',
    'The customer has the start OTP. Ask them for it to begin the service.',
    jsonb_build_object('booking_id', b.id));
  return code;
end $$;

-- ── verify_start_otp ─────────────────────────────────────────────────────
-- Atomic: OTP check + transition to in_service. Attempt-limited with lock.
create or replace function verify_start_otp(p_booking_id uuid, p_code text)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  max_attempts integer;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.provider_id != auth.uid() then raise exception 'Not your booking'; end if;
  if b.status != 'awaiting_start_otp' then raise exception 'No OTP awaiting verification'; end if;
  if b.start_otp_locked then raise exception 'OTP locked — ask the customer for a new code'; end if;
  if b.start_otp_expires_at is null or b.start_otp_expires_at <= now() then
    raise exception 'OTP expired — ask the customer for a new code';
  end if;
  if b.start_otp_hash is null or b.start_otp_hash != crypt(p_code, b.start_otp_hash) then
    max_attempts := setting_int('start_otp_max_attempts', 5);
    update bookings
       set start_otp_attempts = start_otp_attempts + 1,
           start_otp_locked = (start_otp_attempts + 1) >= max_attempts
     where id = p_booking_id;
    raise exception 'Incorrect OTP';
  end if;

  update bookings
     set started_at = now(), start_otp_hash = null
   where id = p_booking_id;
  b := do_transition(p_booking_id, 'in_service', auth.uid(), 'provider');
  perform notify_user(b.customer_id, 'service_started', 'Service started',
    'Your service is now in progress.',
    jsonb_build_object('booking_id', b.id));
  return b;
end $$;
