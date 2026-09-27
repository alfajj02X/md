# Mechanic Dekho — Current State

_Last updated: 2026-09-27 (IST). This is the living build log; update it at
every milestone._

## What exists

- **Repo:** `github.com/alfajj02X/mechanic_dekho`, branch `main`, local at
  `~/workspace/muse_mechanic`.
- **Domain core** (`src/domain/`): money (integer paise), config (₹49 fee,
  10% commission, 100 m geofence, 6-digit/10-min/5-attempt OTP), booking
  state machine (15 states), validators, geo, provider eligibility.
- **Backend:** 9 migrations + 2 Edge Functions (see `docs/ARCHITECTURE.md`).
  Parsed with sqlglot; RLS audited. **Not yet applied to a live Supabase
  project** — needs project URL + keys.
- **App:** auth (phone→OTP→role), customer tabs (catalog, service detail,
  book flow with address/slot/summary, booking tracking, payments client,
  reviews), provider tabs (KYC upload, online toggle, offer feed with
  countdown, GPS geofenced arrival, start-OTP entry, itemized bill, earnings
  ledger, account), push notification wiring.
- **Tests:** 26 jest tests passing (domain). `npx tsc --noEmit` clean,
  `npx expo lint` clean.
- **Privacy fix (2026-09-27):** provider/customer cross-reads now go through
  `get_offer_feed()` and `get_booking_details()` RPCs; direct table selects
  removed. Customer sees provider name/rating/jobs after assignment.

## Environment (build machine)

- Node 24.20.0, npm 10.9.4, Expo CLI 57.0.27. JDK 17 at `~/jdk17`.
- Android SDK at `~/android-sdk`: platform-tools (adb 1.0.41), android-36
  platform, build-tools 36.0.0 — all installed via direct curl (sdkmanager
  can't handle the authenticated proxy; correct build-tools filename is
  `build-tools_r36_linux.zip`, zip-internal dir `android-16`).
- `expo-doctor`: 21/21 checks pass. `npx expo prebuild` succeeds (native
  project generates; fixed missing `notification-icon.png` asset).
- **Native APK compile is blocked in this sandbox:** Gradle 9.3.1 installs
  and starts, but the Gradle daemon's NIO loopback IPC fails — the client
  always gets "Could not dispatch a message to the daemon" (broken pipe),
  even for `gradle help` in an empty dir. Python loopback TCP works, so this
  is specific to Java's non-blocking SocketChannel path here (stale-registry
  and IPv4-stack variants also tried). The APK must be built on the user's
  machine (`npx expo run:android`) or via EAS cloud build.
- No KVM, no Docker, no emulator — no on-device verification here.

## External credentials required (blockers)

Supabase project (URL + anon key), Twilio (phone OTP), Razorpay **test**
keys, EAS/Play credentials. Raw PAT was never pasted here.

## Known limitations / next work

1. Migrations written but not applied anywhere — needs a live Supabase
   project + semantic validation (a real Postgres run).
2. Phone OTP: Twilio not configured; Razorpay: test keys not provisioned.
3. Expo push: needs EAS project id (`extra.eas.projectId` unset).
4. Provider list calls `get_booking_details` per booking (N+1); fine at
   launch scale, batch later if needed.
5. Android native build not yet attempted (waiting on build-tools).

## Release readiness: NOT SHIPPABLE yet

Working app scaffold + complete backend design, zero crashes in static
checks, but: no live backend, no payment keys, no OTP provider, no native
build. The first real gate is applying the migrations to a Supabase project
and running the full booking flow end-to-end on a device.
