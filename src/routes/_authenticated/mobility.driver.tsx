import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Ambulance, CheckCircle2, MapPin, Navigation, Phone, XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { RoleGate } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  useAdvanceTrip, useMyDriver, useRequests, useTrips, useUpdateRow, useVehicles,
} from "@/modules/mobility/api";
import {
  PRIORITY_CLASS, PRIORITY_LABEL, REQUIREMENT_LABEL, SERVICE_LABEL,
  STATUS_CLASS, STATUS_LABEL, isActive, nextStatus, progressPct,
} from "@/modules/mobility/types";
import type {
  MobilityRequest, Priority, Requirements, ServiceType, Trip, TripStatus,
} from "@/modules/mobility/types";
import { formatKes } from "@/modules/mobility/pricing/pricing";

export const Route = createFileRoute("/_authenticated/mobility/driver")({
  component: DriverPortalPage,
  head: () => ({
    meta: [
      { title: "Driver portal — Litu Vault Mobility" },
      { name: "description", content: "Go online, accept transport jobs and progress each trip through pickup, transit, handover and completion." },
      { property: "og:title", content: "Driver portal — Litu Vault Mobility" },
      { property: "og:description", content: "Accept dispatched jobs and run every trip through to handover and completion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function timeOf(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Driver-facing label for the button that moves the trip forward. */
const ACTION_LABEL: Partial<Record<TripStatus, string>> = {
  EN_ROUTE_TO_PICKUP: "Start driving to pickup",
  ARRIVED_PICKUP: "Arrived at pickup",
  PATIENT_BOARDING: "Patient boarding",
  IN_TRANSIT: "Start transit",
  ARRIVED_DESTINATION: "Arrived at destination",
  HANDOVER: "Begin handover",
  COMPLETED: "Complete trip",
};

function DriverPortalPage() {
  return (
    <RoleGate path="/mobility/driver">
      <DriverPortal />
    </RoleGate>
  );
}

function DriverPortal() {
  const { data: driver, isLoading } = useMyDriver();
  const { data: trips = [] } = useTrips();
  const { data: requests = [] } = useRequests();
  const { data: vehicles = [] } = useVehicles();
  const advance = useAdvanceTrip();
  const updateDriver = useUpdateRow("mobility_drivers");
  const [handover, setHandover] = useState("");

  const myTrips = useMemo(
    () => (driver ? trips.filter((t) => t.driver_id === driver.id) : []),
    [trips, driver],
  );
  const incoming = myTrips.filter((t) => t.status === "ASSIGNED");
  const active = myTrips.find((t) => isActive(t.status) && t.status !== "ASSIGNED") ?? null;
  const completedToday = myTrips.filter(
    (t) => t.status === "COMPLETED" && t.completed_at?.slice(0, 10) === new Date().toISOString().slice(0, 10),
  );
  const requestFor = (t: Trip) => requests.find((r) => r.id === t.request_id) ?? null;
  const vehicle = vehicles.find((v) => v.id === (active?.vehicle_id ?? incoming[0]?.vehicle_id));

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your driver profile…</p>;

  if (!driver) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader><CardTitle>No driver profile</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Your account is not linked to a driver record yet. Ask the fleet manager to add you
          to the driver roster in Fleet admin.
        </CardContent>
      </Card>
    );
  }

  const online = driver.status !== "offline";

  async function toggleOnline(next: boolean) {
    if (driver!.status === "on_trip" && !next) {
      toast.error("Finish or hand over the active trip before going offline.");
      return;
    }
    await updateDriver.mutateAsync({ id: driver!.id, patch: { status: next ? "online" : "offline" } });
    toast.success(next ? "You are online — dispatch can assign you jobs." : "You are offline.");
  }

  async function move(trip: Trip, to: TripStatus, extra?: Record<string, unknown>) {
    try {
      await advance.mutateAsync({ trip, to, extra });
      toast.success(STATUS_LABEL[to]);
      if (to === "COMPLETED") setHandover("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the trip");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Driver portal</h1>
          <p className="text-sm text-muted-foreground">
            {driver.full_name}
            {vehicle ? ` · ${vehicle.registration}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2">
          <span className={`text-sm font-medium ${online ? "text-emerald-600" : "text-muted-foreground"}`}>
            {driver.status === "on_trip" ? "On trip" : online ? "Online" : "Offline"}
          </span>
          <Switch checked={online} onCheckedChange={toggleOnline} aria-label="Toggle availability" />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Incoming jobs" value={String(incoming.length)} />
        <StatCard label="Completed today" value={String(completedToday.length)} />
        <StatCard
          label="Earnings today"
          value={formatKes(completedToday.reduce((s, t) => s + (t.fare_cents ?? 0), 0))}
        />
      </div>

      {!online && !active && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            You are offline. Flip the switch above to start receiving dispatch requests.
          </CardContent>
        </Card>
      )}

      {incoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Incoming request{incoming.length > 1 ? "s" : ""}
          </h2>
          {incoming.map((t) => (
            <IncomingCard
              key={t.id}
              trip={t}
              request={requestFor(t)}
              onAccept={() => move(t, "DRIVER_ACCEPTED")}
              onDecline={() => move(t, "REJECTED", { cancel_reason: "Declined by driver" })}
              busy={advance.isPending}
            />
          ))}
        </section>
      )}

      {active && (
        <ActiveTripCard
          trip={active}
          request={requestFor(active)}
          handover={handover}
          setHandover={setHandover}
          onMove={move}
          busy={advance.isPending}
        />
      )}

      {!active && incoming.length === 0 && online && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No jobs right now. You will see dispatched requests here the moment they arrive.
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today’s trips</h2>
        {completedToday.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed trips yet today.</p>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {completedToday.map((t) => {
              const r = requestFor(t);
              return (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="font-medium">{r?.request_code ?? "Trip"}</span>
                  <span className="text-muted-foreground">
                    {r?.pickup_label} → {r?.destination_label}
                  </span>
                  <span className="text-muted-foreground">{timeOf(t.completed_at)}</span>
                  <span className="font-medium">{formatKes(t.fare_cents)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function RequestSummary({ request }: { request: MobilityRequest | null }) {
  if (!request) return <p className="text-sm text-muted-foreground">Request details unavailable.</p>;
  const reqs = Object.entries(request.requirements ?? {})
    .filter(([, v]) => v)
    .map(([k]) => REQUIREMENT_LABEL[k as keyof Requirements]);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{SERVICE_LABEL[request.service_type as ServiceType]}</Badge>
        <Badge
          variant="outline"
          className={PRIORITY_CLASS[(request.clinical_priority ?? request.declared_priority) as Priority]}
        >
          {PRIORITY_LABEL[(request.clinical_priority ?? request.declared_priority) as Priority]}
        </Badge>
        <span className="text-muted-foreground">{request.request_code}</span>
      </div>
      <div className="space-y-1">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{request.pickup_label}{request.pickup_address ? ` · ${request.pickup_address}` : ""}</span>
        </p>
        <p className="flex items-start gap-2">
          <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <span>{request.destination_label}{request.destination_address ? ` · ${request.destination_address}` : ""}</span>
        </p>
      </div>
      {request.requester_phone && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Phone className="h-4 w-4" />
          <a className="underline" href={`tel:${request.requester_phone}`}>{request.requester_phone}</a>
          {request.requester_name ? ` · ${request.requester_name}` : ""}
        </p>
      )}
      {reqs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reqs.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
        </div>
      )}
      {request.special_instructions && (
        <p className="rounded-md bg-muted p-2 text-muted-foreground">{request.special_instructions}</p>
      )}
    </div>
  );
}

function IncomingCard({
  trip, request, onAccept, onDecline, busy,
}: {
  trip: Trip;
  request: MobilityRequest | null;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  return (
    <Card className="border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ambulance className="h-4 w-4" /> New job
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {trip.distance_km ? `${trip.distance_km.toFixed(1)} km · ` : ""}
          {trip.eta_minutes ? `${trip.eta_minutes} min ETA · ` : ""}
          {formatKes(trip.fare_cents)}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <RequestSummary request={request} />
        <div className="flex gap-2">
          <Button onClick={onAccept} disabled={busy} className="flex-1">
            <CheckCircle2 className="mr-2 h-4 w-4" /> Accept
          </Button>
          <Button variant="outline" onClick={onDecline} disabled={busy}>
            <XCircle className="mr-2 h-4 w-4" /> Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveTripCard({
  trip, request, handover, setHandover, onMove, busy,
}: {
  trip: Trip;
  request: MobilityRequest | null;
  handover: string;
  setHandover: (v: string) => void;
  onMove: (trip: Trip, to: TripStatus, extra?: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const next = nextStatus(trip.status);
  const atHandover = trip.status === "HANDOVER";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Active trip</CardTitle>
        <Badge variant="outline" className={STATUS_CLASS[trip.status]}>{STATUS_LABEL[trip.status]}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progressPct(trip.status)} />
        <RequestSummary request={request} />

        {atHandover && (
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="handover-notes">Handover notes</label>
            <Textarea
              id="handover-notes"
              value={handover}
              onChange={(e) => setHandover(e.target.value)}
              placeholder="Who received the patient, condition on arrival, equipment returned…"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {next && (
            <Button
              disabled={busy}
              onClick={() =>
                onMove(trip, next, next === "COMPLETED" && handover ? { handover_notes: handover } : undefined)
              }
            >
              {ACTION_LABEL[next] ?? STATUS_LABEL[next]}
            </Button>
          )}
          {trip.status === "ARRIVED_PICKUP" && (
            <Button variant="outline" disabled={busy} onClick={() => onMove(trip, "NO_SHOW")}>
              Patient no-show
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onMove(trip, "UNABLE_TO_COMPLETE", { cancel_reason: "Reported by driver" })}
          >
            Unable to complete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
