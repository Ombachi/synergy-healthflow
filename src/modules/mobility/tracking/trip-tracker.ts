import { supabase } from "@/integrations/supabase/client";
import type { MobilityRequest, PricingRule, Trip } from "../types";
import { ambulanceTier, calculateFare, pickRule, type FareBreakdown } from "../pricing/pricing";

/**
 * Records the driver's GPS trail during a trip and computes the final fare
 * from the route actually driven (distance + time, like ride-hailing apps).
 * Points are kept on the device first so tracking survives poor signal, and
 * are also sent to the backend when the trip-points store is available.
 */

export interface TrackPoint { lat: number; lng: number; t: number; acc?: number }

const key = (tripId: string) => `litu-vault:trip-points:${tripId}`;
const MIN_MOVE_M = 15; // ignore GPS jitter below this
const MAX_ACCURACY_M = 75; // drop low-quality fixes
const MAX_SPEED_MS = 55; // ~200 km/h — anything faster is a GPS jump

export function haversineM(a: TrackPoint, b: TrackPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function loadPoints(tripId: string): TrackPoint[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key(tripId)) ?? "[]") as TrackPoint[]; } catch { return []; }
}

export function clearPoints(tripId: string) {
  if (typeof window !== "undefined") localStorage.removeItem(key(tripId));
}

/** Adds a fix if it is accurate and a real movement. Returns true when stored. */
export function addPoint(tripId: string, p: TrackPoint): boolean {
  if (p.acc != null && p.acc > MAX_ACCURACY_M) return false;
  const pts = loadPoints(tripId);
  const last = pts[pts.length - 1];
  if (last) {
    const d = haversineM(last, p);
    const dt = Math.max(1, (p.t - last.t) / 1000);
    if (d < MIN_MOVE_M || d / dt > MAX_SPEED_MS) return false;
  }
  pts.push(p);
  localStorage.setItem(key(tripId), JSON.stringify(pts));
  void supabase
    .from("mobility_trip_points" as never)
    .insert({ trip_id: tripId, lat: p.lat, lng: p.lng, accuracy_m: p.acc ?? null, recorded_at: new Date(p.t).toISOString() } as never)
    .then(() => undefined, () => undefined);
  return true;
}

export function routeDistanceKm(pts: TrackPoint[]): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += haversineM(pts[i - 1]!, pts[i]!);
  return m / 1000;
}

export interface FinalFare {
  distanceKm: number;
  durationMinutes: number;
  waitingMinutes: number;
  source: "gps" | "estimate";
  breakdown: FareBreakdown | null;
  totalCents: number;
}

/** Final fare from the driven route; falls back to the booking estimate. */
export function computeFinalFare(trip: Trip, request: MobilityRequest | null, rules: PricingRule[], now = new Date()): FinalFare {
  const pts = loadPoints(trip.id);
  const gpsKm = routeDistanceKm(pts);
  const useGps = pts.length >= 2 && gpsKm >= 0.2;
  const distanceKm = useGps ? gpsKm : Number(trip.distance_km || request?.distance_km || 0);

  const start = trip.in_transit_at ?? trip.boarding_at ?? trip.arrived_pickup_at;
  const durationMinutes = start ? Math.max(0, Math.round((now.getTime() - new Date(start).getTime()) / 60000)) : 0;
  const waitStart = trip.arrived_pickup_at;
  const waitEnd = trip.in_transit_at ?? trip.boarding_at;
  const waitingMinutes = waitStart && waitEnd
    ? Math.max(0, Math.round((new Date(waitEnd).getTime() - new Date(waitStart).getTime()) / 60000) - 5) // 5 free min
    : Number(trip.waiting_minutes || 0);

  const tier = request?.service_type === "ambulance" ? ambulanceTier(request.requirements ?? {}) : null;
  const rule = request ? pickRule(rules, request.service_type, tier) : null;
  if (!rule) {
    return { distanceKm, durationMinutes, waitingMinutes, source: useGps ? "gps" : "estimate", breakdown: null, totalCents: trip.fare_cents || request?.estimated_fare_cents || 0 };
  }
  const breakdown = calculateFare({
    rule, distanceKm, durationMinutes, waitingMinutes, requirements: request?.requirements, when: now,
  });
  return { distanceKm, durationMinutes, waitingMinutes, source: useGps ? "gps" : "estimate", breakdown, totalCents: breakdown.totalCents };
}
