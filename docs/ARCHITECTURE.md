# Mechanic Dekho — Architecture

On-demand home-services mobile app (customer + provider modes). Initial
market: Berhampore, Murshidabad, West Bengal. Android-first.

## Stack

| Layer | Choice |
|---|---|
| App | React Native / Expo SDK 57, TypeScript, Expo Router |
| State | Zustand (auth, booking draft) + TanStack Query (server state) |
| Backend | Supabase (Postgres + RLS, Auth phone OTP, Realtime, Storage, Edge Functions, pg_cron) |
| Payments | Razorpay (test mode) — orders via Edge Function, webhook is sole source of truth |
| Push | Expo push notifications (needs EAS project id) |
| Maps/GPS | expo-location, geofenced arrival (100 m) |

## Trust model

- **The database is the authority.** All booking/offer/payment/ledger writes
  go through `SECURITY DEFINER` RPCs. Authenticated clients have **no direct
  write** path to `bookings`, `offers`, `payments`, `ledger_entries`,
  `booking_amount_revisions`, or `reviews`.
- **One transition policy, two mirrors:** `src/domain/booking.ts`
  (client-side gating) and `booking_transitions` + `do_transition`
  (server-side enforcement). The server always wins.
- **Money is integer paise** everywhere (`src/domain/money.ts`). Amounts for
  Razorpay orders come from the `create-payment-order` Edge Function, which
  reads the authoritative paise value from the DB. The client never dictates
  an amount.
- **The Razorpay webhook is the sole source of truth** for UPI payment state.
  A successful checkout on the device never flips payment state by itself.
- **Privacy by RLS:** addresses, profiles, and provider profiles are
  party-private. Cross-boundary reads go through two scoped RPCs
  (`get_offer_feed` — area-only; `get_booking_details` — role-scoped).
  The customer sees the provider's locality only until acceptance.

## Data flow: booking lifecycle

```
customer: catalog → address → slot → summary (₹49 fee via Razorpay)
   │ create_booking (RPC)
   ▼
pending ──fee paid──▶ offer_next_provider / auto_assign_tick (pg_cron, 2 min)
   │                         │ picks best eligible provider (KYC-verified,
   ▼                         │ online, city match, rating, least load)
offer ──accept──▶ assigned ──on_the_way──▶ arrived (GPS geofence ≤100 m)
   │ decline/timeout → pending (requeue) / provider_unavailable (45 min)
   ▼
awaiting_start_otp ──customer generates code, reads aloud──▶ in_service
   │ provider enters code → verify_start_otp
   ▼
awaiting_amount_approval ──provider submits itemized bill──▶ customer approves
   │ (labour/parts/additional/discount) + picks UPI or cash
   ▼
awaiting_payment ──UPI: webhook completes──▶ completed
                └─cash: provider confirms → completed
   ▼
review (submit_review) → provider rating aggregates updated
```

Ledger: every money movement (booking fee, final amount, commission,
cash liability) is an immutable `ledger_entries` row. Provider commission
is computed server-side (10% default, `platform_settings`).

## Key backend pieces

- `supabase/migrations/` — 9 migrations: enums, tables, RLS, transition
  engine (`do_transition`, `notify_user`, `setting_int`), booking RPCs,
  flow RPCs (OTP, offers, amounts, cash, reviews), storage (KYC docs),
  seed (settings, catalog), push tokens, auto-assign scheduler (pg_cron),
  role-scoped detail RPCs.
- `supabase/functions/` — `create-payment-order` (idempotent order creation),
  `razorpay-webhook` (signature-verified; writes payments + ledger,
  completes bookings). Shared `cors.ts`, `razorpay.ts`.
- Anti-escalation: `prevent_role_escalation` trigger (INSERT + UPDATE),
  `guard_provider_profile_update` trigger (KYC/rating/cash fields are
  server-only).

## App structure

```
src/
  domain/      money, config, booking state machine, validators, geo, provider
  ui/          theme + design system (Button, Card, Badge, TextField, OTPInput,
               Stars, Screen, Skeleton, EmptyState, ErrorState)
  app/         Expo Router: auth/, (customer)/, (provider)/
  lib/         customer.ts, provider.ts (react-query + RPC wrappers),
               payments.ts (Razorpay client), notifications.ts (Expo push),
               bookingUi.ts (status labels/tones), queryClient.ts
  stores/      auth.ts (Supabase phone OTP), bookingDraft.ts
  supabase/    client.ts (SecureStore session), types.ts (hand-maintained)
```

Notifications: in-app `notifications` table (realtime) + Expo push via
`push_tokens`. Deep links route to the booking/job detail screens.
