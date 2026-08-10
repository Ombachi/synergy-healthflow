/** Great-circle distance helpers shared by booking, dispatch and tracking. */

export interface Coords {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

export function haversineKm(a: Coords, b: Coords): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Straight-line distance inflated for Nairobi road routing. */
export function roadKm(a: Coords, b: Coords, fallback = 8): number {
  const km = haversineKm(a, b);
  if (km == null) return fallback;
  return Math.max(0.5, Math.round(km * 1.35 * 10) / 10);
}

/** Rough ETA at an average urban speed, with a dispatch buffer. */
export function etaMinutes(km: number, avgSpeedKmh = 28, bufferMin = 4): number {
  return Math.max(1, Math.round((km / avgSpeedKmh) * 60 + bufferMin));
}
