import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ambulance, Car, CheckCircle2, Clock, Loader2, MapPin, Radio, ShieldAlert, Truck, Users, XCircle, Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  useAssignVehicle, useCancelRequest, useDrivers, usePricingRules, useRequests,
  useTrips, useVehicleDocuments, useVehicleEquipment, useVehicles,
} from "../api";
import {
  PRIORITY_CLASS, PRIORITY_LABEL, REQUIREMENT_LABEL, SERVICE_LABEL, STATUS_CLASS, STATUS_LABEL,
  VEHICLE_STATUS_CLASS, VEHICLE_STATUS_LABEL, isActive,
} from "../types";
import type { MobilityRequest, Priority, Requirements, ServiceType, Trip } from "../types";
import { rankCandidates } from "../dispatch/matcher";
import type { Candidate } from "../dispatch/matcher";
import { ambulanceTier, calculateFare, formatKes, pickRule } from "../pricing/pricing";
import { LiveMap } from "../tracking/live-map";
import type { MapMarker } from "../tracking/live-map";

const OPEN_STATUSES = ["REQUESTED", "TRIAGED", "MATCHING"];

function Kpi({ label, value, icon: Icon, tone }: {
  label: string; value: string | number; icon: typeof Truck; tone?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`rounded-md p-2 ${tone ?? "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-lg font-semibold leading-none">{value}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </span>
      </CardContent>
    </Card>
  );
}

export function DispatchBoard() {
  const { data: requests = [], isLoading } = useRequests();
  const { data: trips = [] } = useTrips();
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: equipment = [] } = useVehicleEquipment();
  const { data: documents = [] } = useVehicleDocuments();
  const { data: rules = [] } = usePricingRules();

  const assign = useAssignVehicle();
  const cancel = useCancelRequest();

  const [assigning, setAssigning] = useState<MobilityRequest | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const tripByRequest = useMemo(() => {
    const m = new Map<string, Trip>();
    trips.forEach((t) => {
      const prev = m.get(t.request_id);
      if (!prev || (t.created_at ?? "") > (prev.created_at ?? "")) m.set(t.request_id, t);
    });
    return m;
  }, [trips]);

  const busyVehicleIds = useMemo(
    () => trips.filter((t) => isActive(t.status) && t.vehicle_id).map((t) => t.vehicle_id!),
    [trips],
  );

  const live = useMemo(
    () => requests.filter((r) => isActive(r.status)),
    [requests],
  );

  const queue = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return live
      .filter((r) => serviceFilter === "all" || r.service_type === serviceFilter)
      .filter((r) => !needle || [r.request_code, r.pickup_label, r.destination_label, r.requester_name]
        .some((v) => (v ?? "").toLowerCase().includes(needle)));
  }, [live, serviceFilter, q]);

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const todays = requests.filter((r) => (r.created_at ?? "").slice(0, 10) === today);
    const completedToday = trips.filter((t) => (t.completed_at ?? "").slice(0, 10) === today);
    return {
      pending: live.filter((r) => OPEN_STATUSES.includes(r.status)).length,
      active: live.length,
      available: vehicles.filter((v) => v.status === "available" && v.active).length,
      onTrip: vehicles.filter((v) => ["assigned", "en_route", "on_trip"].includes(v.status)).length,
      offline: vehicles.filter((v) => ["offline", "maintenance", "out_of_service"].includes(v.status)).length,
      driversOnline: drivers.filter((d) => d.status === "online" && d.active).length,
      tripsToday: todays.length,
      completedToday: completedToday.length,
      cancelledToday: requests.filter(
        (r) => r.status === "CANCELLED" && (r.created_at ?? "").slice(0, 10) === today,
      ).length,
      revenueToday: completedToday.reduce((s, t) => s + (t.fare_cents ?? 0), 0),
    };
  }, [requests, trips, vehicles, drivers, live, today]);

  function candidatesFor(request: MobilityRequest): Candidate[] {
    return rankCandidates({
      request, vehicles, equipment, documents, drivers, busyVehicleIds,
    });
  }

  function fareFor(request: MobilityRequest, distanceKm: number, eta: number) {
    const service = request.service_type as ServiceType;
    const tier = service === "ambulance"
      ? ambulanceTier((request.requirements ?? {}) as Requirements)
      : null;
    const rule = pickRule(rules, service, tier);
    if (!rule) return request.estimated_fare_cents ?? 0;
    return calculateFare({
      rule,
      distanceKm: request.distance_km || distanceKm,
      durationMinutes: eta,
      requirements: (request.requirements ?? {}) as Requirements,
    }).totalCents;
  }

  async function dispatch(request: MobilityRequest, c: Candidate, mode: "auto" | "manual") {
    if (!c.eligible) {
      toast.error(`Cannot dispatch: ${c.blockers[0]}`);
      return;
    }
    try {
      await assign.mutateAsync({
        request,
        vehicleId: c.vehicle.id,
        driverId: c.driver?.id ?? null,
        distanceKm: request.distance_km || c.distanceKm,
        etaMinutes: c.etaMinutes,
        fareCents: fareFor(request, c.distanceKm, c.etaMinutes),
        mode,
        score: c.score,
        reason: mode === "auto" ? "Auto-dispatch: best ranked eligible vehicle" : "Manual dispatch",
        existingTripId: tripByRequest.get(request.id)?.id ?? null,
      });
      toast.success(`${c.vehicle.registration} dispatched to ${request.request_code}`);
      setAssigning(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function autoDispatch() {
    const pending = queue.filter((r) => OPEN_STATUSES.includes(r.status));
    if (pending.length === 0) { toast.info("No pending requests to dispatch"); return; }
    let done = 0;
    for (const r of pending) {
      const best = candidatesFor(r).find((c) => c.eligible);
      if (!best) continue;
      if (r.declared_priority === "emergency" || r.clinical_priority === "emergency") {
        // Emergencies still go out automatically, but are flagged for review.
        await dispatch(r, best, "auto");
      } else {
        await dispatch(r, best, "auto");
      }
      done += 1;
    }
    toast[done ? "success" : "warning"](
      done ? `Auto-dispatched ${done} request${done > 1 ? "s" : ""}` : "No eligible vehicle for the pending requests",
    );
  }

  const mapMarkers: MapMarker[] = useMemo(() => {
    const vehicleMarks = vehicles
      .filter((v) => v.current_lat != null && v.current_lng != null && v.active)
      .map<MapMarker>((v) => ({
        id: `v-${v.id}`,
        lat: v.current_lat!,
        lng: v.current_lng!,
        color: v.status === "available" ? "#10b981" : ["offline", "maintenance", "out_of_service"].includes(v.status) ? "#94a3b8" : "#f59e0b",
        label: v.registration,
        popup: `<b>${v.registration}</b><br/>${v.vehicle_type} · ${VEHICLE_STATUS_LABEL[v.status]}`,
      }));
    const requestMarks = live
      .filter((r) => r.pickup_lat != null && r.pickup_lng != null)
      .map<MapMarker>((r) => ({
        id: `r-${r.id}`,
        lat: r.pickup_lat!,
        lng: r.pickup_lng!,
        color: (r.clinical_priority ?? r.declared_priority) === "emergency" ? "#ef4444" : "#2563eb",
        label: r.request_code,
        popup: `<b>${r.request_code}</b><br/>${SERVICE_LABEL[r.service_type]}<br/>${r.pickup_label} → ${r.destination_label}`,
      }));
    return [...vehicleMarks, ...requestMarks];
  }, [vehicles, live]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Pending requests" value={stats.pending} icon={Clock} tone="bg-amber-500/15 text-amber-600" />
        <Kpi label="Active trips" value={stats.active} icon={Radio} tone="bg-sky-500/15 text-sky-600" />
        <Kpi label="Vehicles available" value={stats.available} icon={Truck} tone="bg-emerald-500/15 text-emerald-600" />
        <Kpi label="On trip / assigned" value={stats.onTrip} icon={Ambulance} />
        <Kpi label="Drivers online" value={stats.driversOnline} icon={Users} />
        <Kpi label="Requests today" value={stats.tripsToday} icon={Car} />
        <Kpi label="Completed today" value={stats.completedToday} icon={CheckCircle2} tone="bg-emerald-500/15 text-emerald-600" />
        <Kpi label="Cancelled today" value={stats.cancelledToday} icon={XCircle} />
        <Kpi label="Vehicles offline" value={stats.offline} icon={ShieldAlert} tone="bg-orange-500/15 text-orange-600" />
        <Kpi label="Revenue today" value={formatKes(stats.revenueToday)} icon={Zap} />
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Dispatch queue</TabsTrigger>
          <TabsTrigger value="map">Live map</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xs"
              placeholder="Search code, pickup, destination…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {(Object.keys(SERVICE_LABEL) as ServiceType[]).map((s) => (
                  <SelectItem key={s} value={s}>{SERVICE_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={autoDispatch} disabled={assign.isPending}>
              {assign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Auto-dispatch pending
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading dispatch queue…</p>
          ) : queue.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
              No active transport requests.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {queue.map((r) => {
                const trip = tripByRequest.get(r.id);
                const vehicle = vehicles.find((v) => v.id === trip?.vehicle_id) ?? null;
                const driver = drivers.find((d) => d.id === trip?.driver_id) ?? null;
                const best = OPEN_STATUSES.includes(r.status)
                  ? candidatesFor(r).find((c) => c.eligible) ?? null
                  : null;
                const priority = (r.clinical_priority ?? r.declared_priority) as Priority;
                const reqs = Object.entries((r.requirements ?? {}) as Requirements)
                  .filter(([, v]) => v)
                  .map(([k]) => REQUIREMENT_LABEL[k as keyof Requirements]);
                return (
                  <Card key={r.id}>
                    <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{r.request_code}</span>
                          <Badge variant="outline">{SERVICE_LABEL[r.service_type]}</Badge>
                          <Badge variant="outline" className={PRIORITY_CLASS[priority]}>
                            {PRIORITY_LABEL[priority]}
                            {!r.clinical_priority && " (patient-declared)"}
                          </Badge>
                          <Badge variant="outline" className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                          {r.origin && r.origin !== "patient" && <Badge variant="secondary">{r.origin}</Badge>}
                        </div>
                        <p className="text-sm">
                          <MapPin className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
                          {r.pickup_label} → {r.destination_label}
                          {r.distance_km ? <span className="text-muted-foreground"> · {r.distance_km.toFixed(1)} km</span> : null}
                        </p>
                        {reqs.length > 0 && (
                          <p className="text-xs text-muted-foreground">Requires: {reqs.join(", ")}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Requested {new Date(r.created_at).toLocaleString("en-GB")}
                          {r.schedule_mode === "later" && r.scheduled_at
                            ? ` · scheduled ${new Date(r.scheduled_at).toLocaleString("en-GB")}` : ""}
                          {r.requester_name ? ` · ${r.requester_name}` : ""}
                          {r.requester_phone ? ` · ${r.requester_phone}` : ""}
                        </p>
                        {vehicle && (
                          <p className="text-xs">
                            Assigned <span className="font-medium">{vehicle.registration}</span>
                            {driver ? ` · ${driver.full_name}${driver.phone ? ` (${driver.phone})` : ""}` : " · no driver"}
                            {trip?.eta_minutes ? ` · ETA ${trip.eta_minutes} min` : ""}
                          </p>
                        )}
                        {!vehicle && best && (
                          <p className="text-xs text-muted-foreground">
                            Recommended: <span className="font-medium">{best.vehicle.registration}</span> ·
                            {" "}{best.distanceKm.toFixed(1)} km · ETA {best.etaMinutes} min
                            {best.driver ? ` · ${best.driver.full_name}` : ""}
                          </p>
                        )}
                        {!vehicle && !best && OPEN_STATUSES.includes(r.status) && (
                          <p className="text-xs text-destructive">No compliant vehicle currently satisfies this request.</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-start gap-2">
                        <Button size="sm" onClick={() => setAssigning(r)}>
                          {vehicle ? "Reassign" : "Assign"}
                        </Button>
                        {best && !vehicle && (
                          <Button size="sm" variant="secondary" onClick={() => dispatch(r, best, "auto")}>
                            Dispatch recommended
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await cancel.mutateAsync({ requestId: r.id, reason: "Cancelled by dispatch" });
                            toast.success("Request cancelled");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="map">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Live fleet & request map</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <LiveMap height={480} markers={mapMarkers} />
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Available vehicle</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />On trip</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />Offline</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />Request pickup</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Emergency pickup</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Dispatch {assigning?.request_code} · {assigning ? SERVICE_LABEL[assigning.service_type] : ""}
            </DialogTitle>
          </DialogHeader>
          {assigning && (
            <div className="max-h-[65vh] space-y-2 overflow-auto pr-1">
              {candidatesFor(assigning).map((c) => (
                <div
                  key={c.vehicle.id}
                  className={`rounded-lg border p-3 ${c.eligible ? "" : "opacity-70"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {c.vehicle.registration}
                        <Badge variant="outline" className={`ml-2 ${VEHICLE_STATUS_CLASS[c.vehicle.status]}`}>
                          {VEHICLE_STATUS_LABEL[c.vehicle.status]}
                        </Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[c.vehicle.make, c.vehicle.model].filter(Boolean).join(" ")} · {c.vehicle.vehicle_type} ·
                        {" "}{c.distanceKm.toFixed(1)} km · ETA {c.etaMinutes} min ·
                        {" "}{c.driver ? c.driver.full_name : "no driver"}
                      </p>
                      {c.equipmentMet.length > 0 && (
                        <p className="text-xs text-emerald-600">Equipment: {c.equipmentMet.join(", ")}</p>
                      )}
                      {c.blockers.map((b) => (
                        <p key={b} className="text-xs text-destructive">{b}</p>
                      ))}
                      {c.warnings.map((w) => (
                        <p key={w} className="text-xs text-amber-600">{w}</p>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      disabled={!c.eligible || assign.isPending}
                      onClick={() => dispatch(assigning, c, "manual")}
                    >
                      Dispatch
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
