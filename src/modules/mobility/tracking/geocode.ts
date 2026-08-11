/**
 * Address lookup for the mobility module.
 *
 * Uses OpenStreetMap Nominatim — no API key, biased to Kenya so that
 * "Kenyatta" resolves to the hospital and not a street in another country.
 */

export interface GeoResult {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

const ENDPOINT = "https://nominatim.openstreetmap.org";

export async function searchPlaces(query: string, limit = 6): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url =
    `${ENDPOINT}/search?format=jsonv2&addressdetails=1&countrycodes=ke&limit=${limit}` +
    `&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const rows = (await res.json()) as Array<{
    display_name: string; lat: string; lon: string; name?: string;
  }>;
  return rows.map((r) => ({
    label: r.name || r.display_name.split(",")[0] || r.display_name,
    address: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  const url = `${ENDPOINT}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const r = (await res.json()) as { display_name?: string; name?: string };
    if (!r.display_name) return null;
    return {
      label: r.name || r.display_name.split(",")[0] || "Pinned location",
      address: r.display_name,
      lat,
      lng,
    };
  } catch {
    return null;
  }
}

export interface LocateResult {
  lat: number;
  lng: number;
  accuracy: number;
}

/** Plain-language reason a geolocation attempt failed. */
export function locateErrorMessage(err: GeolocationPositionError | Error): string {
  if ("code" in err) {
    if (err.code === 1) {
      return "Location permission is blocked. Allow location for this site in your browser, or drop a pin on the map.";
    }
    if (err.code === 2) {
      return "Your device could not get a GPS fix. Drop a pin on the map or search for the address.";
    }
    if (err.code === 3) {
      return "Getting your location took too long. Try again, or drop a pin on the map.";
    }
  }
  return "Location is unavailable — drop a pin on the map or search for the address.";
}

/**
 * Reads the current position, retrying once with a coarse, cached fix when
 * the high-accuracy attempt times out (common indoors and on desktops).
 */
export function locateMe(): Promise<LocateResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("no-geolocation"));
      return;
    }
    const ok = (pos: GeolocationPosition) =>
      resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });

    navigator.geolocation.getCurrentPosition(ok, (first) => {
      navigator.geolocation.getCurrentPosition(
        ok,
        () => reject(first),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
      );
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  });
}
