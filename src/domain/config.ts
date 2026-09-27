/**
 * Authoritative business configuration for Mechanic Dekho.
 *
 * These are compiled-in DEFAULTS. Every value here is designed to be
 * overridden by backend/admin configuration at runtime (platform settings
 * table) — the mobile app must never scatter competing literals.
 * Import from here, never hardcode.
 */

/** Booking/platform fee charged to the customer at booking time. ₹49. */
export const BOOKING_FEE_PAISE = 4900;

/** Platform commission on provider service earnings, in basis points. 10%. */
export const PLATFORM_COMMISSION_BPS = 1000;

/**
 * Approximate same-day cash-collection capacity per provider before the
 * platform requires a settlement. ₹300. Enforced by backend ledger logic.
 */
export const PROVIDER_CASH_CAPACITY_PAISE = 30_000;

/** Geofence radius for provider arrival verification. ~100 metres. */
export const GEOFENCE_RADIUS_METERS = 100;

/** Auto-assignment offer window presented to a provider (slider accept). */
export const OFFER_WINDOW_MS = 15_000;

/** Start-service OTP: 6 digits, 10 minute expiry, 5 attempts then lock. */
export const START_OTP_LENGTH = 6;
export const START_OTP_EXPIRY_MS = 10 * 60 * 1000;
export const START_OTP_MAX_ATTEMPTS = 5;

/** Initial service market. Backend-controlled; this is the default only. */
export const DEFAULT_SERVICE_AREA = {
  city: 'Berhampore',
  district: 'Murshidabad',
  state: 'West Bengal',
  country: 'India',
} as const;

/** First reschedule carries the already-paid booking fee; later ones may be chargeable. */
export const FREE_RESCHEDULE_COUNT = 1;

/** Ratings are 1..5 stars. */
export const MIN_RATING = 1;
export const MAX_RATING = 5;

/** Support contact surface (placeholder until backend config lands). */
export const SUPPORT = {
  phone: '+91-XXXXXXXXXX',
  email: 'support@mechanicdekho.in',
} as const;
