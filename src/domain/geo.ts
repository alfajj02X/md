/**
 * Geographic helpers: distance and geofence checks.
 * Uses the haversine formula; good to ~0.5% for the short distances we need.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export interface GeofenceCheck {
  inside: boolean;
  distanceMeters: number;
  thresholdMeters: number;
}

/** Check whether `point` is within `thresholdMeters` of `center`. */
export function checkGeofence(
  center: LatLng,
  point: LatLng,
  thresholdMeters: number,
): GeofenceCheck {
  const distanceMeters = haversineMeters(center, point);
  return {
    inside: distanceMeters <= thresholdMeters,
    distanceMeters,
    thresholdMeters,
  };
}

/** Arrival evidence recorded when a provider marks arrival. */
export interface ArrivalEvidence {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  timestampIso: string;
  distanceMeters: number;
  thresholdMeters: number;
}
