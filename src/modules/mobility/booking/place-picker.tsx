import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useLocations } from "../api";
import { LiveMap } from "../tracking/live-map";
import { locateErrorMessage, locateMe, reverseGeocode, searchPlaces } from "../tracking/geocode";
import type { GeoResult } from "../tracking/geocode";

export interface Place {
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

export const EMPTY_PLACE: Place = { label: "", address: "", lat: null, lng: null };

/**
 * Live map place picker: locate me, address search, saved facilities, or a
 * pin dropped straight on the map. Anything that resolves to coordinates
 * feeds the fare estimate and the dispatch matcher.
 */
export function PlacePicker({
  title, value, onChange, allowCurrent, pinColor = "#2563eb",
}: {
  title: string;
  value: Place;
  onChange: (p: Place) => void;
  allowCurrent?: boolean;
  pinColor?: string;
}) {
  const { data: locations = [] } = useLocations();
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchPlaces(q);
        if (!cancelled) setResults(rows);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  async function useCurrent() {
    setLocating(true);
    try {
      const pos = await locateMe();
      const place = await reverseGeocode(pos.lat, pos.lng);
      onChange({
        label: place?.label ?? "Current location",
        address: place?.address ?? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`,
        lat: pos.lat,
        lng: pos.lng,
      });
      toast.success("Using your current location");
    } catch (err) {
      toast.error(locateErrorMessage(err as GeolocationPositionError));
    } finally {
      setLocating(false);
    }
  }

  async function dropPin(lat: number, lng: number) {
    onChange({ ...value, label: value.label || "Pinned location", address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    const place = await reverseGeocode(lat, lng);
    if (place) {
      onChange({ label: value.label || place.label, address: place.address, lat, lng });
    }
  }

  const markers = useMemo(
    () => (value.lat != null && value.lng != null
      ? [{ id: "pick", lat: value.lat, lng: value.lng, color: pinColor, label: value.label || "Pin" }]
      : []),
    [value.lat, value.lng, value.label, pinColor],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">{title}</Label>
        {allowCurrent && (
          <Button type="button" variant="outline" size="sm" onClick={useCurrent} disabled={locating}>
            {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
            Use my location
          </Button>
        )}
      </div>

      <div className="relative z-[1200]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search an address or place in Kenya"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {results.length > 0 && (
          <div className="absolute z-[1200] mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-lg">
            {results.map((r, i) => (
              <button
                key={`${r.lat}-${r.lng}-${i}`}
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange({ label: r.label, address: r.address, lat: r.lat, lng: r.lng });
                  setQuery("");
                  setResults([]);
                }}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.address}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative z-0 isolate overflow-hidden rounded-md">
        <LiveMap
          height={240}
          markers={markers}
          center={value.lat != null && value.lng != null ? { lat: value.lat, lng: value.lng } : null}
          onPick={dropPin}
          fit={false}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Tap the map to drop a pin if the address is hard to describe.
      </p>


      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Place name (e.g. Home)"
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
        <Input
          placeholder="Street address"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Or pick a saved place / facility</Label>
        <Select
          value=""
          onValueChange={(id) => {
            const l = locations.find((x) => x.id === id);
            if (l) onChange({ label: l.label, address: l.address, lat: l.lat, lng: l.lng });
          }}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select a place" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.is_facility ? "🏥 " : "⭐ "}{l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
