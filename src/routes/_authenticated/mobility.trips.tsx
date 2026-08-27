import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ambulance, MapPin } from "lucide-react";

import { RoleGate } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useCancelRequest, useDrivers, useRequests, useTrips, useVehicles } from "@/modules/mobility/api";
import {
  SERVICE_LABEL, STATUS_CLASS, STATUS_LABEL, isActive, progressPct,
} from "@/modules/mobility/types";
import type { MobilityRequest, TripStatus } from "@/modules/mobility/types";
import { formatKes } from "@/modules/mobility/pricing/pricing";

export const Route = createFileRoute("/_authenticated/mobility/trips")({
  component: MyTripsPage,
  head: () => ({
    meta: [
      { title: "My trips — Litu Vault Mobility" },
      { name: "description", content: "Track your active healthcare transport, upcoming bookings and past trips." },
      { property: "og:title", content: "My trips — Litu Vault Mobility" },
      { property: "og:description", content: "Live transport status, upcoming bookings and trip history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function dmy(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function MyTripsPage() {
  const { data: requests = [], isLoading } = useRequests();
  const { data: trips = [] } = useTrips();
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const cancel = useCancelRequest();
  const [tab, setTab] = useState("active");

  const tripFor = (r: MobilityRequest) => trips.find((t) => t.request_id === r.id) ?? null;

  const buckets = useMemo(() => {
    const active: MobilityRequest[] = [];
    const upcoming: MobilityRequest[] = [];
    const history: MobilityRequest[] = [];
    for (const r of requests) {
      if (!isActive(r.status as TripStatus)) history.push(r);
      else if (r.schedule_mode === "later" && r.status === "REQUESTED") upcoming.push(r);
      else active.push(r);
    }
    return { active, upcoming, history };
  }, [requests]);

  function TripCard({ r }: { r: MobilityRequest }) {
    const trip = tripFor(r);
    const vehicle = vehicles.find((v) => v.id === trip?.vehicle_id) ?? null;
    const driver = drivers.find((d) => d.id === trip?.driver_id) ?? null;
    const status = (trip?.status ?? r.status) as TripStatus;
    const live = isActive(status);

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {SERVICE_LABEL[r.service_type] ?? r.service_type}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{r.request_code}</span>
            </CardTitle>
            <Badge variant="outline" className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{r.pickup_label} → {r.destination_label}</span>
          </div>

          {live && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct(status)}%` }} />
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Date</dt>
              <dd>{dmy(r.scheduled_at ?? r.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Distance</dt>
              <dd>{Number(r.distance_km).toFixed(1)} km</dd>
            </div>
            {vehicle && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Vehicle</dt>
                <dd>{vehicle.registration} · {vehicle.make} {vehicle.model}</dd>
              </div>
            )}
            {driver && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Driver</dt>
                <dd>{driver.full_name}</dd>
              </div>
            )}
            {trip?.eta_minutes != null && live && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Estimated arrival</dt>
                <dd>{trip.eta_minutes} min</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{status === "COMPLETED" ? "Fare" : "Estimated fare"}</dt>
              <dd>{formatKes(trip?.fare_cents || r.estimated_fare_cents)}</dd>
            </div>
          </dl>

          {status === "COMPLETED" && trip?.invoice_id && (
            <div className="pt-1">
              <p className="mb-2 text-sm font-medium">Pay this trip fare</p>
              <MpesaPayPanel
                invoiceId={trip.invoice_id}
                defaultPhone={r.contact_phone ?? null}
                invalidateKeys={[["mobility"], ["my-invoices"], ["invoices"]]}
                label="Pay fare with M-Pesa"
              />
            </div>
          )}



          {live && (
            <div className="flex flex-wrap gap-2 pt-1">
              {driver?.phone && (
                <Button asChild size="sm" variant="outline">
                  <a href={`tel:${driver.phone}`}>Contact driver</a>
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <a href="tel:+254781872670">Contact Litu Vault</a>
              </Button>
              {["REQUESTED", "TRIAGED", "MATCHING", "ASSIGNED"].includes(status) && (
                <Button
                  size="sm" variant="ghost"
                  onClick={() => cancel.mutate({ requestId: r.id, reason: "Cancelled by requester" })}
                >
                  Cancel request
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function List({ rows, empty }: { rows: MobilityRequest[]; empty: string }) {
    if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
    if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
    return <div className="grid gap-3">{rows.map((r) => <TripCard key={r.id} r={r} />)}</div>;
  }

  return (
    <RoleGate path="/mobility/trips">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">My trips</h1>
            <p className="text-sm text-muted-foreground">Live status, upcoming bookings and trip history.</p>
          </div>
          <Button asChild size="sm">
            <Link to="/mobility/request"><Ambulance className="mr-2 h-4 w-4" /> Request transport</Link>
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="active">Active ({buckets.active.length})</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming ({buckets.upcoming.length})</TabsTrigger>
            <TabsTrigger value="history">History ({buckets.history.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            <List rows={buckets.active} empty="No transport in progress." />
          </TabsContent>
          <TabsContent value="upcoming" className="mt-4">
            <List rows={buckets.upcoming} empty="No upcoming bookings." />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <List rows={buckets.history} empty="No past trips yet." />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGate>
  );
}
