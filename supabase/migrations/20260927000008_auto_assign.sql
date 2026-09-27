-- Auto-assignment scheduler.
--
-- Runs every 2 minutes (pg_cron):
--   1. For paid bookings stuck in 'pending' with no live offer, dispatch
--      offer_next_provider (which picks the best eligible provider).
--   2. Expire bookings that have been pending > 45 minutes with no provider:
--      pending -> provider_unavailable + customer notification.
--   3. Expire stale pending offers older than their expires_at (offer ->
--      pending) so the next run re-queues the booking.
--
-- Requires pg_cron (available on Supabase). The job runs as postgres; all
-- work goes through security-definer functions that enforce the rules.

create extension if not exists pg_cron with schema extensions;

create or replace function auto_assign_tick()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  dispatched integer := 0;
begin
  -- 1. Dispatch offers for paid bookings waiting > 2 minutes with no live offer.
  for b in
    select bk.id
    from bookings bk
    where bk.status = 'pending'
      and bk.booking_fee_status = 'paid'
      and bk.created_at < now() - interval '2 minutes'
      and not exists (
        select 1 from offers o
        where o.booking_id = bk.id
          and o.status = 'pending'
          and o.expires_at > now()
      )
    order by bk.created_at
    limit 25
    for update skip locked
  loop
    begin
      perform offer_next_provider(b.id);
      dispatched := dispatched + 1;
    exception when others then
      -- No eligible provider right now; leave for the next tick.
      null;
    end;
  end loop;

  -- 2. Expire stale pending offers back to the queue.
  update offers o
  set status = 'expired'
  where o.status = 'pending'
    and o.expires_at <= now();

  for b in
    select bk.id
    from bookings bk
    where bk.status = 'offer'
      and not exists (
        select 1 from offers o
        where o.booking_id = bk.id
          and o.status = 'pending'
          and o.expires_at > now()
      )
    limit 25
    for update skip locked
  loop
    perform do_transition(b.id, 'pending', null, 'system',
      jsonb_build_object('reason', 'offer_expired'));
  end loop;

  -- 3. Give up on bookings pending > 45 minutes: no professional available.
  for b in
    select bk.id, bk.customer_id
    from bookings bk
    where bk.status = 'pending'
      and bk.created_at < now() - interval '45 minutes'
    limit 25
    for update skip locked
  loop
    perform do_transition(b.id, 'provider_unavailable', null, 'system',
      jsonb_build_object('reason', 'no_provider_found'));
    perform notify_user(b.customer_id, 'no_provider',
      'No professional available',
      'We could not find a professional for your slot. Your booking fee will be refunded.',
      jsonb_build_object('booking_id', b.id));
  end loop;

  return dispatched;
end $$;

-- Replace the schedule if it already exists (idempotent re-runs).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-assign-tick') then
    perform cron.unschedule('auto-assign-tick');
  end if;
  perform cron.schedule('auto-assign-tick', '*/2 * * * *', $$select auto_assign_tick()$$);
end $$;
