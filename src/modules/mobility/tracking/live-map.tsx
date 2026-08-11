import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import { Loader2 } from "lucide-react";

/**
 * Client-only Leaflet map used by booking, dispatch and tracking.
 *
 * Leaflet touches `window` at import time, so the library is loaded
 * dynamically after mount. Markers are plain HTML div icons — no image
 * assets to resolve, so the map renders identically in preview and prod.
 */

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  /** Any tailwind-ish colour string used for the pin dot. */
  color?: string;
  label?: string;
  popup?: string;
  onClick?: () => void;
}

export interface LiveMapProps {
  markers?: MapMarker[];
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  height?: number | string;
  /** Click anywhere to drop / move a pin. */
  onPick?: (lat: number, lng: number) => void;
  /** Refit bounds whenever markers change. */
  fit?: boolean;
  className?: string;
}

const NAIROBI = { lat: -1.286389, lng: 36.817223 };

function pinHtml(color: string, label?: string) {
  return `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)">
    <span style="width:14px;height:14px;border-radius:9999px;background:${color};box-shadow:0 0 0 4px ${color}33,0 1px 3px rgba(0,0,0,.4)"></span>
    ${label ? `<span style="margin-top:2px;font-size:10px;font-weight:600;white-space:nowrap;background:rgba(255,255,255,.9);color:#111;padding:0 4px;border-radius:4px">${label}</span>` : ""}
  </div>`;
}

export function LiveMap({
  markers = [], center, zoom = 12, height = 360, onPick, fit = true, className,
}: LiveMapProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !nodeRef.current || mapRef.current) return;
      const start = center ?? markers[0] ?? NAIROBI;
      const map = leaflet.map(nodeRef.current, { zoomControl: true, attributionControl: true })
        .setView([start.lat, start.lng], zoom);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      map.on("click", (e: L.LeafletMouseEvent) => {
        pickRef.current?.(e.latlng.lat, e.latlng.lng);
      });
      leafletRef.current = leaflet;
      mapRef.current = map;
      layerRef.current = leaflet.layerGroup().addTo(map);
      setReady(true);
      setTimeout(() => map.invalidateSize(), 120);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers
  useEffect(() => {
    const leaflet = leafletRef.current;
    const group = layerRef.current;
    const map = mapRef.current;
    if (!ready || !leaflet || !group || !map) return;
    group.clearLayers();
    markers.forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const icon = leaflet.divIcon({
        html: pinHtml(m.color ?? "#2563eb", m.label),
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = leaflet.marker([m.lat, m.lng], { icon }).addTo(group);
      if (m.popup) marker.bindPopup(m.popup);
      if (m.onClick) marker.on("click", m.onClick);
    });
    if (fit && markers.length > 1) {
      map.fitBounds(leaflet.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), {
        padding: [40, 40],
        maxZoom: 15,
      });
    } else if (markers.length === 1 && markers[0]) {
      map.setView([markers[0].lat, markers[0].lng], Math.max(map.getZoom(), 14));
    }
  }, [markers, ready, fit]);

  // Follow an explicit centre
  useEffect(() => {
    if (!ready || !center || !mapRef.current) return;
    mapRef.current.setView([center.lat, center.lng], Math.max(mapRef.current.getZoom(), 14));
  }, [center?.lat, center?.lng, ready]);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-muted ${className ?? ""}`}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      <div ref={nodeRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map…
        </div>
      )}
    </div>
  );
}
