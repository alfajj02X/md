-- Mechanic Dekho: amount, payment, completion, cancellation, reviews, admin RPCs (part 2)

-- ── submit_final_amount ──────────────────────────────────────────────────
-- Provider submits an itemized revision. Previous revisions are preserved;
-- any earlier pending revision is superseded, never edited.
create or replace function submit_final_amount(
  p_booking_id uuid, p_labour_paise integer, p_parts_paise integer,
  p_additional_paise integer, p_discount_paise integer
) returns booking_amount_revisions
language plpgsql security definer set search_path = public as $$
declare
  b bookings; r booking_amount_revisions;
  subtotal integer; total integer; next_no integer;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.provider_id != auth.uid() then raise exception 'Not your booking'; end if;
  if b.status not in ('in_service', 'awaiting_amount_approval') then
    raise exception 'Amount can only be submitted during/after service';
  end if;
  if p_labour_paise < 0 or p_parts_paise < 0 or p_additional_paise < 0 or p_discount_paise < 0 then
    raise exception 'Amounts must not be negative';
  end if;
  subtotal := p_labour_paise + p_parts_paise + p_additional_paise;
  if p_discount_paise > subtotal then raise exception 'Discount exceeds subtotal'; end if;
  total := subtotal - p_discount_paise;

  select coalesce(max(revision_no), 0) + 1 into next_no
    from booking_amount_revisions where booking_id = p_booking_id;

  update booking_amount_revisions set status = 'superseded'
   where booking_id = p_booking_id and status = 'pending';

  insert into booking_amount_revisions
    (booking_id, revision_no, labour_paise, parts_paise, additional_paise,
     discount_paise, total_paise, submitted_by)
  values (p_booking_id, next_no, p_labour_paise, p_parts_paise, p_additional_paise,
          p_discount_paise, total, auth.uid())
  returning * into r;

  if b.status = 'in_service' then
    perform do_transition(p_booking_id, 'awaiting_amount_approval', auth.uid(), 'provider',
      jsonb_build_object('revision_id', r.id, 'total_paise', total));
  else
    insert into booking_events (booking_id, actor_id, actor_role, from_status, to_status, metadata)
    values (p_booking_id, auth.uid(), 'provider', b.status, b.status,
            jsonb_build_object('revision_id', r.id, 'total_paise', total, 'note', 'revision_resubmitted'));
  end if;

  perform notify_user(b.customer_id, 'amount_submitted', 'Amount needs approval',
    'Your professional submitted the final amount. Please review and approve.',
    jsonb_build_object('booking_id', b.id, 'revision_id', r.id, 'total_paise', total));
  return r;
end $$;

-- ── approve_final_amount ─────────────────────────────────────────────────
create or replace function approve_final_amount(p_booking_id uuid, p_revision_id uuid, p_method payment_method)
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings; r booking_amount_revisions;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.customer_id != auth.uid() then raise exception 'Not your booking'; end if;
  if b.status != 'awaiting_amount_approval' then raise exception 'No amount awaiting approval'; end if;

  select * into r from booking_amount_revisions where id = p_revision_id for update;
  if not found or r.booking_id != p_booking_id then raise exception 'Revision not found'; end if;
  if r.status != 'pending' then raise exception 'Revision is no longer pending'; end if;

  update booking_amount_revisions set status = 'approved' where id = r.id;
  update bookings
     set approved_amount_paise = r.total_paise,
         approved_revision_id = r.id,
         payment_method = p_method
   where id = p_booking_id;

  b := do_transition(p_booking_id, 'awaiting_payment', auth.uid(), 'customer',
        jsonb_build_object('revision_id', r.id, 'total_paise', r.total_paise, 'method', p_method));
  perform notify_user(b.provider_id, 'amount_approved', 'Amount approved',
    'The customer approved the final amount.',
    jsonb_build_object('booking_id', b.id, 'total_paise', r.total_paise, 'method', p_method));
  return b;
end $$;

-- ── request_amount_revision ──────────────────────────────────────────────
-- Customer asks the provider to revise: back to in_service, history kept.
create or replace function request_amount_revision(p_booking_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.customer_id != auth.uid() then raise exception 'Not your booking'; end if;
  update booking_amount_revisions set status = 'rejected'
   where booking_id = p_booking_id and status = 'pending';
  b := do_transition(p_booking_id, 'in_service', auth.uid(), 'customer',
        jsonb_build_object('note', 'revision_requested'));
  perform notify_user(b.provider_id, 'revision_requested', 'Revision requested',
    'The customer asked for a revised amount.',
    jsonb_build_object('booking_id', b.id));
  return b;
end $$;

-- ── record_cash_payment ──────────────────────────────────────────────────
-- Provider confirms cash collected. Writes immutable ledger entries and
-- completes the booking atomically.
create or replace function record_cash_payment(p_booking_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  b bookings; pp provider_profiles;
  commission_bps integer; commission integer; net integer; liability integer;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.provider_id != auth.uid() then raise exception 'Not your booking'; end if;
  if b.status != 'awaiting_payment' then raise exception 'Booking is not awaiting payment'; end if;
  if b.payment_method != 'cash' then raise exception 'Payment method is not cash'; end if;
  if b.approved_amount_paise is null then raise exception 'No approved amount'; end if;

  commission_bps := setting_int('platform_commission_bps', 1000);
  commission := round(b.approved_amount_paise * commission_bps / 10000.0)::integer;
  net := b.approved_amount_paise - commission;

  select * into pp from provider_profiles where provider_id = auth.uid() for update;
  liability := pp.cash_liability_paise + b.approved_amount_paise;

  insert into ledger_entries (provider_id, booking_id, type, amount_paise, cash_liability_after_paise, note)
  values
    (auth.uid(), p_booking_id, 'service_earning', net, liability, 'Service earning (net of commission)'),
    (auth.uid(), p_booking_id, 'commission', commission, liability, 'Platform commission'),
    (auth.uid(), p_booking_id, 'cash_collected', b.approved_amount_paise, liability, 'Cash collected from customer');

  update provider_profiles set cash_liability_paise = liability where provider_id = auth.uid();
  update bookings set final_payment_status = 'paid' where id = p_booking_id;

  b := do_transition(p_booking_id, 'completed', auth.uid(), 'provider',
        jsonb_build_object('method', 'cash', 'total_paise', b.approved_amount_paise));
  perform notify_user(b.customer_id, 'payment_received', 'Payment recorded',
    'Cash payment recorded. Thank you for using Mechanic Dekho!',
    jsonb_build_object('booking_id', b.id));
  return b;
end $$;

-- ── cancel_booking ───────────────────────────────────────────────────────
create or replace function cancel_booking(p_booking_id uuid, p_reason text)
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.customer_id != auth.uid() and not is_admin() then
    raise exception 'Only the customer or an admin can cancel';
  end if;
  update bookings
     set cancel_reason = p_reason, cancelled_by = auth.uid(), cancelled_at = now()
   where id = p_booking_id;
  b := do_transition(p_booking_id, 'cancelled', auth.uid(),
        case when is_admin() then 'admin'::user_role else 'customer'::user_role end,
        jsonb_build_object('reason', p_reason));
  if b.provider_id is not null then
    perform notify_user(b.provider_id, 'booking_cancelled', 'Booking cancelled',
      'A booking was cancelled.', jsonb_build_object('booking_id', b.id));
  end if;
  return b;
end $$;

-- ── reschedule_booking ───────────────────────────────────────────────────
-- First reschedule carries the paid booking fee; later ones are blocked
-- here and must go through admin (configurable policy).
create or replace function reschedule_booking(p_booking_id uuid, p_new_slot timestamptz)
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings; free_count integer;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.customer_id != auth.uid() then raise exception 'Not your booking'; end if;
  if b.status not in ('pending', 'offer', 'assigned') then
    raise exception 'Booking can no longer be rescheduled';
  end if;
  if p_new_slot <= now() + interval '30 minutes' then
    raise exception 'Choose a slot at least 30 minutes ahead';
  end if;
  free_count := setting_int('free_reschedule_count', 1);
  if b.reschedule_count >= free_count then
    raise exception 'Further reschedules need support assistance';
  end if;

  update bookings
     set scheduled_at = p_new_slot, reschedule_count = reschedule_count + 1
   where id = p_booking_id;
  perform do_transition(p_booking_id, 'rescheduled', auth.uid(), 'customer',
    jsonb_build_object('new_slot', p_new_slot, 'reschedule_count', b.reschedule_count + 1));
  b := do_transition(p_booking_id, 'pending', auth.uid(), 'customer',
    jsonb_build_object('note', 'requeued_after_reschedule'));
  return b;
end $$;

-- ── submit_review ────────────────────────────────────────────────────────
create or replace function submit_review(p_booking_id uuid, p_stars integer, p_text text default null)
returns reviews language plpgsql security definer set search_path = public as $$
declare b bookings; r reviews;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.customer_id != auth.uid() then raise exception 'Not your booking'; end if;
  if b.status != 'completed' then raise exception 'Only completed bookings can be reviewed'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'Stars must be 1..5'; end if;
  if p_text is not null and char_length(p_text) > 1000 then raise exception 'Review too long'; end if;

  insert into reviews (booking_id, customer_id, provider_id, stars, text)
  values (p_booking_id, auth.uid(), b.provider_id, p_stars, p_text)
  returning * into r;

  update provider_profiles pp
     set rating_avg = ((pp.rating_avg * pp.rating_count) + p_stars) / (pp.rating_count + 1),
         rating_count = pp.rating_count + 1,
         completed_jobs = pp.completed_jobs + 1
   where pp.provider_id = b.provider_id;
  return r;
end $$;

-- ── admin RPCs ───────────────────────────────────────────────────────────
create or replace function admin_approve_kyc(p_provider_id uuid, p_approved boolean, p_note text default null)
returns provider_profiles language plpgsql security definer set search_path = public as $$
declare pp provider_profiles;
begin
  if not is_admin() then raise exception 'Admin only'; end if;
  update provider_profiles
     set kyc_status = case when p_approved then 'approved'::kyc_status else 'rejected'::kyc_status end,
         kyc_reviewer_note = p_note
   where provider_id = p_provider_id
  returning * into pp;
  if not found then raise exception 'Provider not found'; end if;
  perform notify_user(p_provider_id, 'kyc_update', 'KYC update',
    case when p_approved then 'Your KYC is approved. You can now go online!'
         else 'Your KYC needs attention: ' || coalesce(p_note, 'please resubmit') end,
    jsonb_build_object('approved', p_approved));
  return pp;
end $$;

create or replace function admin_assign_provider(p_booking_id uuid, p_provider_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if not is_admin() then raise exception 'Admin only'; end if;
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('pending', 'provider_unavailable') then
    raise exception 'Booking cannot be manually assigned from %', b.status;
  end if;
  if not exists (select 1 from provider_profiles pp
                  where pp.provider_id = p_provider_id and pp.kyc_status = 'approved') then
    raise exception 'Provider not approved';
  end if;
  update bookings set provider_id = p_provider_id where id = p_booking_id;
  b := do_transition(p_booking_id, 'assigned', auth.uid(), 'admin',
        jsonb_build_object('provider_id', p_provider_id, 'mode', 'manual'));
  perform notify_user(p_provider_id, 'job_assigned', 'New job assigned',
    'You have been assigned a new job.', jsonb_build_object('booking_id', b.id));
  perform notify_user(b.customer_id, 'provider_assigned', 'Professional assigned',
    'Your professional has been assigned.', jsonb_build_object('booking_id', b.id));
  return b;
end $$;

-- ── admin_complete_booking_upi ─────────────────────────────────────────
-- Called ONLY by the Razorpay webhook (service role) after a captured UPI
-- payment. Never callable usefully by clients: it asserts the booking is
-- awaiting_payment with a paid final payment.
create or replace function admin_complete_booking_upi(p_booking_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.status != 'awaiting_payment' then raise exception 'Booking is not awaiting payment'; end if;
  if b.final_payment_status != 'paid' then raise exception 'Final payment not marked paid'; end if;
  b := do_transition(p_booking_id, 'completed', null, 'admin',
        jsonb_build_object('method', 'upi'));
  perform notify_user(b.customer_id, 'payment_success', 'Payment successful',
    'Your payment was successful. Enjoy your service!',
    jsonb_build_object('booking_id', b.id));
  return b;
end $$;

-- ── offer_next_provider ──────────────────────────────────────────────────
-- Called by scheduler/cron for auto-assignment: picks the highest-rated
-- eligible provider not yet offered, creates a 15s offer. Ranking is
-- deliberately simple (rating first) and extensible.
create or replace function offer_next_provider(p_booking_id uuid)
returns offers language plpgsql security definer set search_path = public as $$
declare
  b bookings; o offers; s services;
  window_s integer; cap integer;
  next_provider uuid;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('pending') then raise exception 'Booking not awaiting assignment'; end if;
  -- The ₹49 booking fee must be paid before a professional is dispatched.
  if b.booking_fee_status != 'paid' then raise exception 'Booking fee not paid'; end if;
  select * into s from services where id = b.service_id;

  window_s := setting_int('offer_window_s', 15);
  cap := setting_int('provider_cash_capacity_paise', 30000);

  -- Expire stale offers first (server clock is authoritative).
  update offers set status = 'expired'
   where booking_id = p_booking_id and status = 'pending' and expires_at <= now();

  select pp.provider_id into next_provider
    from provider_profiles pp
    join provider_services ps on ps.provider_id = pp.provider_id and ps.active
   where ps.service_id = b.service_id
     and pp.kyc_status = 'approved'
     and pp.online = true
     and pp.cash_liability_paise < cap
     and not exists (select 1 from offers of
                      where of.booking_id = p_booking_id
                        and of.provider_id = pp.provider_id
                        and of.status in ('pending', 'accepted', 'declined'))
   order by pp.rating_avg desc, pp.completed_jobs desc
   limit 1
   for update of pp;

  if next_provider is null then
    perform do_transition(p_booking_id, 'provider_unavailable', null, 'admin',
      jsonb_build_object('note', 'no_eligible_providers'));
    return null;
  end if;

  insert into offers (booking_id, provider_id, expires_at)
  values (p_booking_id, next_provider, now() + make_interval(secs => window_s))
  returning * into o;

  update bookings set status = 'offer', version = version + 1 where id = p_booking_id;
  insert into booking_events (booking_id, actor_role, from_status, to_status, metadata)
  values (p_booking_id, 'admin', 'pending', 'offer',
          jsonb_build_object('provider_id', next_provider, 'expires_at', o.expires_at));

  perform notify_user(next_provider, 'new_offer', 'New job offer',
    'A new job is available near you. Accept within the timer.',
    jsonb_build_object('booking_id', p_booking_id, 'offer_id', o.id));
  return o;
end $$;
