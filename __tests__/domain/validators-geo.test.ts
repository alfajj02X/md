import {
  isValidIndianPhone,
  maskPhone,
  normalizeIndianPhone,
  validateAddress,
  validateOtpCode,
  validateRating,
  ValidationError,
} from '../../src/domain/validators';
import { checkGeofence, haversineMeters } from '../../src/domain/geo';
import { GEOFENCE_RADIUS_METERS } from '../../src/domain/config';

describe('validators', () => {
  test('normalizeIndianPhone accepts common formats', () => {
    expect(normalizeIndianPhone('9876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizeIndianPhone('919876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('09876543210')).toBe('+919876543210');
  });

  test('normalizeIndianPhone rejects invalid numbers', () => {
    expect(() => normalizeIndianPhone('12345')).toThrow(ValidationError);
    expect(() => normalizeIndianPhone('5876543210')).toThrow(ValidationError); // starts with 5
    expect(() => normalizeIndianPhone('abcdefghij')).toThrow(ValidationError);
    expect(isValidIndianPhone('9876543210')).toBe(true);
    expect(isValidIndianPhone('123')).toBe(false);
  });

  test('maskPhone hides all but last digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91 ••••• 43210');
  });

  test('validateOtpCode accepts numeric codes only', () => {
    expect(() => validateOtpCode('123456')).not.toThrow();
    expect(() => validateOtpCode('12a456')).toThrow(ValidationError);
    expect(() => validateOtpCode('12')).toThrow(ValidationError);
  });

  test('validateAddress enforces required fields', () => {
    const base = {
      label: 'Home',
      customerName: 'Test User',
      phone: '9876543210',
      addressLine1: '123 Main St',
      locality: 'Berhampore',
      city: 'Berhampore',
      state: 'West Bengal',
      pincode: '742101',
    };
    expect(validateAddress(base).phone).toBe('+919876543210');
    expect(() => validateAddress({ ...base, pincode: '7421' })).toThrow(ValidationError);
    expect(() => validateAddress({ ...base, city: '' })).toThrow(ValidationError);
    expect(() => validateAddress({ ...base, latitude: 95 })).toThrow(ValidationError);
  });

  test('validateRating bounds 1..5', () => {
    expect(() => validateRating(5)).not.toThrow();
    expect(() => validateRating(0)).toThrow(ValidationError);
    expect(() => validateRating(6)).toThrow(ValidationError);
    expect(() => validateRating(4.5)).toThrow(ValidationError);
  });
});

describe('geo', () => {
  test('haversineMeters is sane for known distances', () => {
    // Berhampore approx (24.0986, 88.2454) to itself
    const p = { latitude: 24.0986, longitude: 88.2454 };
    expect(haversineMeters(p, p)).toBe(0);
    // ~111m north (0.001 deg latitude)
    const q = { latitude: 24.0996, longitude: 88.2454 };
    const d = haversineMeters(p, q);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });

  test('checkGeofence enforces arrival radius', () => {
    const home = { latitude: 24.0986, longitude: 88.2454 };
    const near = { latitude: 24.0987, longitude: 88.2454 }; // ~11m
    const far = { latitude: 24.1086, longitude: 88.2454 }; // ~1.1km
    expect(checkGeofence(home, near, GEOFENCE_RADIUS_METERS).inside).toBe(true);
    expect(checkGeofence(home, far, GEOFENCE_RADIUS_METERS).inside).toBe(false);
  });
});
