# Mechanic Dekho — Business Rules

Canonical rules. Where prose and code differ, the **migration SQL** is
authoritative (mirrors live in `src/domain/`).

## Money

- All amounts are **integer paise** — no floats, no strings.
- **Booking fee: ₹49** (4,900 paise), paid upfront via Razorpay (UPI/cards).
  A booking enters the provider-matching pool only after the fee is paid.
- **Platform commission: 10%** on the final service amount, recorded as a
  ledger entry. Tunable via `platform_settings` (`commission_bps`).
- Payment for the final amount is **UPI or cash**, chosen by the customer at
  approval time. UPI settlement is confirmed only by the Razorpay webhook;
  cash is confirmed by the provider (`admin_complete_booking_upi`-style
  reconciliation for edge cases).

## Provider matching

- `auto_assign_tick()` runs **every 2 minutes** (pg_cron):
  - Dispatches `offer_next_provider` for paid bookings pending > 2 min with
    no live offer.
  - Expires stale offers past `expires_at` → booking requeues.
  - After **45 min** with no acceptance → booking moves to
    `provider_unavailable`, customer is notified.
- Eligibility: KYC verified, online, service-city match (Berhampore launch),
  ordered by rating then current load.
- Offers show the customer **area only** (locality/city). The exact address
  and contact are revealed to the provider on accept.

## Job execution

- **Arrival** requires a GPS fix within **100 m** of the customer address
  (`mark_arrived` geofence).
- **Start OTP:** the *customer* generates a 6-digit code (`issue_start_otp`),
  reads it aloud; the *provider* enters it (`verify_start_otp`). 10-minute
  expiry, 5 attempts, lock on exhaustion. Work starts only after
  verification.
- **Final amount** is itemized (labour + parts + additional − discount).
  The customer approves the exact breakdown; the approved total is what
  Razorpay charges. No silent changes.
- **Reviews** are 1–5 stars; provider aggregates (`rating_avg`,
  `rating_count`, `completed_jobs`) update server-side on review.
- **Cancellation:** free before provider acceptance; the booking fee is
  forfeited after dispatch. Full policy text is shown in-app before the
  customer pays.

## Privacy

- Customer sees the provider's locality only until acceptance; name/rating
  card appears once assigned.
- Provider sees the exact address and customer contact only after accepting
  an offer. Never via direct table reads — only `get_booking_details`.
- Cash collected by a provider accrues as `cash_liability_paise`, settled
  per the provider agreement.

## Launch scope

- **Market:** Berhampore, Murshidabad, West Bengal. City-scoped eligibility.
- **Platform:** Android-first. iOS later.
- **Payments:** Razorpay **test mode only** until keys are provisioned.
