/**
 * Validation for untrusted boundaries: phone, OTP, address, money payloads.
 * Pure functions — no framework dependencies, fully unit-testable.
 */

export class ValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

/**
 * Normalize an Indian mobile number to E.164: "+91XXXXXXXXXX".
 * Accepts "98765 43210", "+91-9876543210", "919876543210", "09876543210".
 * Throws ValidationError on anything that is not a valid Indian mobile.
 */
export function normalizeIndianPhone(raw: string): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('phone_type', 'Phone number must be text.');
  }
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10) {
    throw new ValidationError(
      'phone_length',
      'Enter a valid 10-digit mobile number.',
    );
  }
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new ValidationError(
      'phone_invalid',
      'Enter a valid Indian mobile number.',
    );
  }
  return `+91${digits}`;
}

/** Non-throwing phone check for form UX. */
export function isValidIndianPhone(raw: string): boolean {
  try {
    normalizeIndianPhone(raw);
    return true;
  } catch {
    return false;
  }
}

/** Mask a normalized phone for display: "+91 ••••• 43210". */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  return `+91 ••••• ${digits.slice(-5)}`;
}

/** OTP codes are numeric, 4-8 digits. */
export function validateOtpCode(code: string): void {
  if (!/^\d{4,8}$/.test(code.trim())) {
    throw new ValidationError('otp_format', 'Enter the numeric OTP code.');
  }
}

export interface AddressInput {
  label: string;
  customerName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
}

/** Validate an address payload; returns the normalized phone. */
export function validateAddress(input: AddressInput): { phone: string } {
  const require = (value: string | undefined, field: string) => {
    if (!value || !value.trim()) {
      throw new ValidationError(`${field}_required`, `${field} is required.`);
    }
  };
  require(input.label, 'Label');
  require(input.customerName, 'Name');
  require(input.addressLine1, 'Address');
  require(input.locality, 'Locality');
  require(input.city, 'City');
  require(input.state, 'State');
  if (!/^\d{6}$/.test((input.pincode ?? '').trim())) {
    throw new ValidationError('pincode_invalid', 'Enter a valid 6-digit PIN code.');
  }
  if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90)) {
    throw new ValidationError('lat_invalid', 'Invalid location latitude.');
  }
  if (input.longitude !== undefined && (input.longitude < -180 || input.longitude > 180)) {
    throw new ValidationError('lng_invalid', 'Invalid location longitude.');
  }
  return { phone: normalizeIndianPhone(input.phone) };
}

/** Rating must be an integer 1..5. */
export function validateRating(stars: number): void {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new ValidationError('rating_invalid', 'Rating must be between 1 and 5 stars.');
  }
}

/** Review text: optional, but bounded when present. */
export function validateReviewText(text: string | undefined): void {
  if (text !== undefined && text.length > 1000) {
    throw new ValidationError('review_too_long', 'Review must be under 1000 characters.');
  }
}
