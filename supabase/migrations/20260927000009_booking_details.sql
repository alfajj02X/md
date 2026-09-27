-- Role-scoped booking details.
--
-- The app must never select addresses/profiles/provider_profiles directly:
-- RLS keeps those tables party-private. These two security-definer RPCs are
-- the only way to read across the boundary, and they enforce the product's
-- privacy rules:
--
-- 1. get_offer_feed() — the calling provider's pending offers with AREA-ONLY
--    address info (locality/city). The exact address stays hidden until the
--    provider accepts the offer.
-- 2. get_booking_details(p_booking_id) — full details for a booking party:
--      - address: full row for the customer and the ASSIGNED provider only.
--      - customer: {display_name, phone} for the assigned provider only.
--      - provider: public card {display_name, rating_avg, rating_count,
--        completed_jobs} for the customer after assignment.
--    Anyone else gets 'Not your booking'.

-- ── Offer feed (area-only) ────────────────────────────────────────────────
create or replace function get_offer_feed()
returns table (
  offer_id uuid,
  booking_id uuid,
  service_name text,
  scheduled_at timestamptz,
  locality text,
  city text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select o.id,
         o.booking_id,
         s.name,
         b.scheduled_at,
         a.locality,
         a.city,
         o.expires_at,
         o.created_at
  from offers o
  join bookings b on b.id = o.booking_id
  join services s on s.id = b.service_id
  join addresses a on a.id = b.address_id
  where o.provider_id = auth.uid()
    and o.status = 'pending'
    and o.expires_at > now()
    and b.status = 'offer'
  order by o.expires_at;
end $$;

-- ── Booking details (role-scoped) ─────────────────────────────────────────
create or replace function get_booking_details(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings;
  addr jsonb := null;
  customer jsonb := null;
  provider jsonb := null;
  svc jsonb := null;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if not is_booking_party(b) then raise exception 'Not your booking'; end if;

  select row_to_json(s) into svc from services s where s.id = b.service_id;

  -- Full address for the customer and the assigned provider; area-only
  -- fallback (defensive — the party check above already excludes others).
  if b.customer_id = auth.uid() or b.provider_id = auth.uid() or is_admin() then
    select row_to_json(a) into addr from addresses a where a.id = b.address_id;
  else
    select jsonb_build_object('locality', a.locality, 'city', a.city)
      into addr from addresses a where a.id = b.address_id;
  end if;

  -- Customer contact goes to the assigned provider only.
  if (b.provider_id = auth.uid() or is_admin()) and b.customer_id is not null then
    select jsonb_build_object('display_name', p.display_name, 'phone', p.phone)
      into customer from profiles p where p.id = b.customer_id;
  end if;

  -- The customer sees the provider's public card once assigned.
  if (b.customer_id = auth.uid() or is_admin()) and b.provider_id is not null then
    select jsonb_build_object(
             'display_name', p.display_name,
             'rating_avg', pp.rating_avg,
             'rating_count', pp.rating_count,
             'completed_jobs', pp.completed_jobs
           )
      into provider
      from provider_profiles pp
      join profiles p on p.id = pp.provider_id
     where pp.provider_id = b.provider_id;
  end if;

  return jsonb_build_object(
    'booking', row_to_json(b),
    'service', svc,
    'address', addr,
    'customer', customer,
    'provider', provider
  );
end $$;
