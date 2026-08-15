import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Truck, Wrench } from "lucide-react";
import { toast } from "sonner";

import { RoleGate } from "@/components/role-gate";
import { Pager, usePager } from "@/components/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  useDrivers, useInsertRow, useMaintenance, usePricingRules, useUpdateRow,
  useVehicleDocuments, useVehicleEquipment, useEquipmentTypes, useVehicles,
} from "@/modules/mobility/api";
import {
  VEHICLE_STATUSES, VEHICLE_STATUS_CLASS, VEHICLE_STATUS_LABEL,
} from "@/modules/mobility/types";
import type { Vehicle, VehicleStatus } from "@/modules/mobility/types";
import { formatKes } from "@/modules/mobility/pricing/pricing";

export const Route = createFileRoute("/_authenticated/mobility/fleet")({
  component: FleetPage,
  head: () => ({
    meta: [
      { title: "Fleet & compliance — Litu Vault Mobility" },
      { name: "description", content: "Manage vehicles, on-board equipment, statutory documents, maintenance, drivers and transport pricing." },
      { property: "og:title", content: "Fleet & compliance — Litu Vault Mobility" },
      { property: "og:description", content: "Vehicle registry, document expiry alerts, maintenance log, driver roster and fare rules." },
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

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-8 max-w-xs"
    />
  );
}

function FleetPage() {
  return (
    <RoleGate path="/mobility/fleet">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Fleet, compliance &amp; pricing</h1>
          <p className="text-sm text-muted-foreground">
            Vehicles, on-board equipment, statutory documents, maintenance, drivers and fare rules.
          </p>
        </div>
        <Tabs defaultValue="vehicles">
          <TabsList className="flex-wrap">
            <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="drivers">Drivers</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
          </TabsList>
          <TabsContent value="vehicles"><VehiclesTab /></TabsContent>
          <TabsContent value="equipment"><EquipmentTab /></TabsContent>
          <TabsContent value="documents"><DocumentsTab /></TabsContent>
          <TabsContent value="maintenance"><MaintenanceTab /></TabsContent>
          <TabsContent value="drivers"><DriversTab /></TabsContent>
          <TabsContent value="pricing"><PricingTab /></TabsContent>
        </Tabs>
      </div>
    </RoleGate>
  );
}

/* ------------------------------------------------------------------ vehicles */

function VehiclesTab() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const update = useUpdateRow("mobility_vehicles");
  const insert = useInsertRow("mobility_vehicles");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    registration: "", vehicle_type: "ambulance_bls", make: "", model: "", capacity: "2", base_location: "",
  });

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return vehicles.filter((v) =>
      !t || [v.registration, v.vehicle_type, v.make, v.model, v.base_location]
        .some((f) => (f ?? "").toLowerCase().includes(t)));
  }, [vehicles, q]);
  const pager = usePager(rows, 15);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Vehicle registry</CardTitle>
        <div className="flex items-center gap-2">
          <Search value={q} onChange={setQ} placeholder="Search registration, type…" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add vehicle</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add vehicle</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["registration", "Registration"], ["vehicle_type", "Vehicle type"],
                  ["make", "Make"], ["model", "Model"],
                  ["capacity", "Capacity"], ["base_location", "Base location"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Input
                      value={form[key] ?? ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <Button
                disabled={!form.registration || insert.isPending}
                onClick={() => {
                  insert.mutate({
                    registration: form.registration,
                    vehicle_type: form.vehicle_type || "cab",
                    make: form.make || null,
                    model: form.model || null,
                    capacity: Number(form.capacity || 2),
                    base_location: form.base_location || null,
                    status: "available",
                  }, {
                    onSuccess: () => { toast.success("Vehicle added"); setOpen(false); },
                    onError: (e) => toast.error((e as Error).message),
                  });
                }}
              >
                Save vehicle
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Registration</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Make / model</TableHead>
              <TableHead>Base</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No vehicles.</TableCell></TableRow>
            )}
            {pager.slice.map((v: Vehicle) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.registration}</TableCell>
                <TableCell className="capitalize">{v.vehicle_type.replace(/_/g, " ")}</TableCell>
                <TableCell>{[v.make, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
                <TableCell>{v.base_location ?? "—"}</TableCell>
                <TableCell>{v.capacity}</TableCell>
                <TableCell>
                  <Select
                    value={v.status}
                    onValueChange={(status) =>
                      update.mutate({ id: v.id, patch: { status } },
                        { onError: (e) => toast.error((e as Error).message) })}
                  >
                    <SelectTrigger className="h-8 w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLE_STATUSES.map((s: VehicleStatus) => (
                        <SelectItem key={s} value={s}>{VEHICLE_STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className={`ml-2 ${VEHICLE_STATUS_CLASS[v.status]}`}>
                    {VEHICLE_STATUS_LABEL[v.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager {...pager} label="vehicles" />
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------- equipment */

function EquipmentTab() {
  const { data: vehicles = [] } = useVehicles();
  const { data: equipment = [] } = useVehicleEquipment();
  const { data: types = [] } = useEquipmentTypes();
  const insert = useInsertRow("mobility_vehicle_equipment");
  const [vehicleId, setVehicleId] = useState("");
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("1");
  const [q, setQ] = useState("");

  const reg = (id: string) => vehicles.find((v) => v.id === id)?.registration ?? "—";
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return equipment.filter((e) => !t || e.equipment_code.toLowerCase().includes(t) || reg(e.vehicle_id).toLowerCase().includes(t));
  }, [equipment, q, vehicles]);
  const pager = usePager(rows, 15);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">On-board equipment</CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Vehicle" /></SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.registration}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Equipment" /></SelectTrigger>
            <SelectContent>
              {types.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="h-8 w-20" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Button
            size="sm"
            disabled={!vehicleId || !code || insert.isPending}
            onClick={() => insert.mutate(
              { vehicle_id: vehicleId, equipment_code: code, quantity: Number(qty || 1), last_checked_on: new Date().toISOString().slice(0, 10) },
              { onSuccess: () => toast.success("Equipment recorded"), onError: (e) => toast.error((e as Error).message) },
            )}
          >
            <Plus className="mr-1 h-4 w-4" />Fit equipment
          </Button>
          <Search value={q} onChange={setQ} placeholder="Search…" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead><TableHead>Equipment</TableHead>
              <TableHead>Qty</TableHead><TableHead>Last checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.slice.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{reg(e.vehicle_id)}</TableCell>
                <TableCell>{types.find((t) => t.code === e.equipment_code)?.label ?? e.equipment_code}</TableCell>
                <TableCell>{e.quantity}</TableCell>
                <TableCell>{dmy(e.last_checked_on)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-muted-foreground">No equipment recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <Pager {...pager} label="items" />
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------- documents */

function DocumentsTab() {
  const { data: vehicles = [] } = useVehicles();
  const { data: docs = [] } = useVehicleDocuments();
  const insert = useInsertRow("mobility_vehicle_documents");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    vehicle_id: "", doc_type: "insurance", reference: "", issued_on: "", expires_on: "",
  });

  const reg = (id: string) => vehicles.find((v) => v.id === id)?.registration ?? "—";
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return docs.filter((d) => !t || d.doc_type.toLowerCase().includes(t) || reg(d.vehicle_id).toLowerCase().includes(t));
  }, [docs, q, vehicles]);
  const expiring = rows.filter((d) => {
    const n = daysUntil(d.expires_on);
    return n !== null && n <= 30;
  });
  const pager = usePager(rows, 15);

  return (
    <div className="space-y-4">
      {expiring.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              {expiring.length} document{expiring.length === 1 ? "" : "s"} expiring or expired
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            {expiring.map((d) => {
              const n = daysUntil(d.expires_on)!;
              return (
                <Badge key={d.id} variant="outline" className={n < 0 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-700"}>
                  {reg(d.vehicle_id)} · {d.doc_type} · {n < 0 ? `expired ${Math.abs(n)}d ago` : `${n}d left`}
                </Badge>
              );
            })}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Statutory documents</CardTitle>
          <div className="flex items-center gap-2">
            <Search value={q} onChange={setQ} placeholder="Search…" />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />Add document</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add vehicle document</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Vehicle</Label>
                    <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.registration}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Document type</Label>
                    <Select value={form.doc_type} onValueChange={(v) => setForm({ ...form, doc_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["insurance", "inspection", "licence", "ntsa", "fire_extinguisher", "oxygen_certification"].map((t) => (
                          <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Issued on</Label><Input type="date" value={form.issued_on} onChange={(e) => setForm({ ...form, issued_on: e.target.value })} /></div>
                    <div><Label>Expires on</Label><Input type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} /></div>
                  </div>
                  <Button
                    disabled={!form.vehicle_id || insert.isPending}
                    onClick={() => insert.mutate({
                      vehicle_id: form.vehicle_id,
                      doc_type: form.doc_type,
                      reference: form.reference || null,
                      issued_on: form.issued_on || null,
                      expires_on: form.expires_on || null,
                      blocks_dispatch: ["insurance", "inspection", "licence"].includes(form.doc_type),
                    }, {
                      onSuccess: () => { toast.success("Document saved"); setOpen(false); },
                      onError: (e) => toast.error((e as Error).message),
                    })}
                  >
                    Save document
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead>
                <TableHead>Issued</TableHead><TableHead>Expires</TableHead><TableHead>Blocks dispatch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.slice.map((d) => {
                const n = daysUntil(d.expires_on);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{reg(d.vehicle_id)}</TableCell>
                    <TableCell className="capitalize">{d.doc_type.replace(/_/g, " ")}</TableCell>
                    <TableCell>{d.reference ?? "—"}</TableCell>
                    <TableCell>{dmy(d.issued_on)}</TableCell>
                    <TableCell className={n !== null && n <= 30 ? (n < 0 ? "text-destructive font-medium" : "text-amber-600 font-medium") : ""}>
                      {dmy(d.expires_on)}
                    </TableCell>
                    <TableCell>{d.blocks_dispatch ? "Yes" : "No"}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No documents.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <Pager {...pager} label="documents" />
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- maintenance */

function MaintenanceTab() {
  const { data: vehicles = [] } = useVehicles();
  const { data: logs = [] } = useMaintenance();
  const insert = useInsertRow("mobility_vehicle_maintenance");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    vehicle_id: "", kind: "service", performed_on: "", next_due_on: "", vendor: "", cost: "0", notes: "",
  });

  const reg = (id: string) => vehicles.find((v) => v.id === id)?.registration ?? "—";
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return logs.filter((l) => !t || l.kind.toLowerCase().includes(t) || reg(l.vehicle_id).toLowerCase().includes(t));
  }, [logs, q, vehicles]);
  const pager = usePager(rows, 15);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />Maintenance log</CardTitle>
        <div className="flex items-center gap-2">
          <Search value={q} onChange={setQ} placeholder="Search…" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />Log service</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log maintenance</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Vehicle</Label>
                  <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.registration}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kind</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["service", "repair", "inspection", "tyres", "deep_clean", "equipment_check"].map((k) => (
                        <SelectItem key={k} value={k}>{k.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Performed on</Label><Input type="date" value={form.performed_on} onChange={(e) => setForm({ ...form, performed_on: e.target.value })} /></div>
                  <div><Label>Next due</Label><Input type="date" value={form.next_due_on} onChange={(e) => setForm({ ...form, next_due_on: e.target.value })} /></div>
                  <div><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
                  <div><Label>Cost (KES)</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button
                  disabled={!form.vehicle_id || insert.isPending}
                  onClick={() => insert.mutate({
                    vehicle_id: form.vehicle_id,
                    kind: form.kind,
                    performed_on: form.performed_on || new Date().toISOString().slice(0, 10),
                    next_due_on: form.next_due_on || null,
                    vendor: form.vendor || null,
                    cost_cents: Math.round(Number(form.cost || 0) * 100),
                    notes: form.notes || null,
                  }, {
                    onSuccess: () => { toast.success("Maintenance logged"); setOpen(false); },
                    onError: (e) => toast.error((e as Error).message),
                  })}
                >
                  Save entry
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead><TableHead>Kind</TableHead><TableHead>Performed</TableHead>
              <TableHead>Next due</TableHead><TableHead>Vendor</TableHead><TableHead>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.slice.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{reg(l.vehicle_id)}</TableCell>
                <TableCell className="capitalize">{l.kind.replace(/_/g, " ")}</TableCell>
                <TableCell>{dmy(l.performed_on)}</TableCell>
                <TableCell>{dmy(l.next_due_on)}</TableCell>
                <TableCell>{l.vendor ?? "—"}</TableCell>
                <TableCell>{formatKes(l.cost_cents)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No maintenance recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <Pager {...pager} label="entries" />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------- drivers */

function DriversTab() {
  const { data: drivers = [] } = useDrivers();
  const update = useUpdateRow("mobility_drivers");
  const insert = useInsertRow("mobility_drivers");
  const remove = useDeleteRow("mobility_drivers");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    full_name: "", phone: "", licence_number: "", licence_expiry: "", qualifications: "",
  });
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return drivers.filter((d) => !t || d.full_name.toLowerCase().includes(t) || (d.licence_number ?? "").toLowerCase().includes(t));
  }, [drivers, q]);
  const pager = usePager(rows, 15);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" />Driver roster</CardTitle>
        <div className="flex items-center gap-2">
          <Search value={q} onChange={setQ} placeholder="Search driver…" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" />Onboard driver</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Onboard driver</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["full_name", "Full name", "text"], ["phone", "Phone", "text"],
                  ["licence_number", "Licence number", "text"], ["licence_expiry", "Licence expiry", "date"],
                ].map(([key, label, type]) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Input
                      type={type}
                      value={form[key] ?? ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  </div>
                ))}
                <div className="col-span-2">
                  <Label>Qualifications (comma separated)</Label>
                  <Input
                    placeholder="BLS, ALS, wheelchair"
                    value={form.qualifications ?? ""}
                    onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
                  />
                </div>
              </div>
              <Button
                disabled={!form.full_name || insert.isPending}
                onClick={() => {
                  insert.mutate({
                    full_name: form.full_name,
                    phone: form.phone || null,
                    licence_number: form.licence_number || null,
                    licence_expiry: form.licence_expiry || null,
                    qualifications: form.qualifications
                      ? form.qualifications.split(",").map((s) => s.trim()).filter(Boolean)
                      : [],
                    status: "offline",
                    active: true,
                  }, {
                    onSuccess: () => {
                      toast.success("Driver onboarded");
                      setOpen(false);
                      setForm({ full_name: "", phone: "", licence_number: "", licence_expiry: "", qualifications: "" });
                    },
                    onError: (e) => toast.error((e as Error).message),
                  });
                }}
              >
                Save driver
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead><TableHead>Phone</TableHead><TableHead>Licence</TableHead>
              <TableHead>Licence expiry</TableHead><TableHead>Qualifications</TableHead><TableHead>Status</TableHead>
              <TableHead>Account</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.slice.map((d) => {
              const n = daysUntil(d.licence_expiry);
              return (
                <TableRow key={d.id} className={d.active === false ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{d.full_name}</TableCell>
                  <TableCell>{d.phone ?? "—"}</TableCell>
                  <TableCell>{d.licence_number ?? "—"}</TableCell>
                  <TableCell className={n !== null && n <= 30 ? "font-medium text-amber-600" : ""}>{dmy(d.licence_expiry)}</TableCell>
                  <TableCell className="text-xs">{(d.qualifications ?? []).join(", ") || "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={d.status}
                      onValueChange={(status) => update.mutate({ id: d.id, patch: { status } },
                        { onError: (e) => toast.error((e as Error).message) })}
                    >
                      <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["online", "offline", "on_trip"].map((s) => (
                          <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.active === false ? "outline" : "secondary"}>
                      {d.active === false ? "Deactivated" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate(
                          { id: d.id, patch: { active: d.active === false, ...(d.active === false ? {} : { status: "offline" }) } },
                          {
                            onSuccess: () => toast.success(d.active === false ? "Driver reactivated" : "Driver deactivated"),
                            onError: (e) => toast.error((e as Error).message),
                          },
                        )}
                      >
                        {d.active === false ? "Activate" : "Deactivate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (!window.confirm(`Remove ${d.full_name} from the driver roster?`)) return;
                          remove.mutate(d.id, {
                            onSuccess: () => toast.success("Driver removed"),
                            onError: (e) => toast.error((e as Error).message),
                          });
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-muted-foreground">No drivers.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <Pager {...pager} label="drivers" />
      </CardContent>
    </Card>
  );
}


/* ------------------------------------------------------------------- pricing */

const PRICE_FIELDS: { key: string; label: string }[] = [
  { key: "base_fare_cents", label: "Base fare" },
  { key: "per_km_cents", label: "Per km" },
  { key: "per_minute_cents", label: "Per minute" },
  { key: "waiting_per_minute_cents", label: "Waiting / min" },
  { key: "minimum_fare_cents", label: "Minimum fare" },
  { key: "crew_cents", label: "Crew" },
  { key: "equipment_cents", label: "Equipment" },
  { key: "accessibility_cents", label: "Accessibility" },
];

function PricingTab() {
  const { data: rules = [] } = usePricingRules();
  const update = useUpdateRow("mobility_pricing_rules");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rules.filter((r) => !t || r.label.toLowerCase().includes(t) || r.service_type.includes(t));
  }, [rules, q]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Fare rules</CardTitle>
        <Search value={q} onChange={setQ} placeholder="Search rule…" />
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground capitalize">{r.service_type} · {r.tier} · {r.currency}</p>
              </div>
              <Badge variant="outline">{r.active ? "Active" : "Inactive"}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {PRICE_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label} (KES)</Label>
                  <Input
                    className="h-8"
                    type="number"
                    defaultValue={(r as unknown as Record<string, number>)[f.key] / 100}
                    onBlur={(e) => {
                      const cents = Math.round(Number(e.target.value || 0) * 100);
                      if (cents === (r as unknown as Record<string, number>)[f.key]) return;
                      update.mutate({ id: r.id, patch: { [f.key]: cents } }, {
                        onSuccess: () => toast.success(`${r.label}: ${f.label} updated`),
                        onError: (err) => toast.error((err as Error).message),
                      });
                    }}
                  />
                </div>
              ))}
              <div>
                <Label className="text-xs">After-hours %</Label>
                <Input
                  className="h-8"
                  type="number"
                  defaultValue={r.after_hours_pct}
                  onBlur={(e) => {
                    const pct = Number(e.target.value || 0);
                    if (pct === r.after_hours_pct) return;
                    update.mutate({ id: r.id, patch: { after_hours_pct: pct } }, {
                      onSuccess: () => toast.success(`${r.label}: after-hours updated`),
                      onError: (err) => toast.error((err as Error).message),
                    });
                  }}
                />
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No pricing rules.</p>}
      </CardContent>
    </Card>
  );
}
