import { createFileRoute } from "@tanstack/react-router";
import { Pager, usePager } from "@/components/pager";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity, Beaker, CalendarClock, Cpu, Gauge, Plus, Search, Settings, Thermometer, Trash2, TriangleAlert, Wrench,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { QcPanelEntry } from "@/components/qc-panel-entry";
import { QcHistory } from "@/components/qc-history";


export const Route = createFileRoute("/_authenticated/instruments")({
  head: () => ({
    meta: [
      { title: "Instrument QC Workspaces | Litu Vault" },
      { name: "description", content: "Analyzer-centred quality control: instrument profiles, QC history, calibration, maintenance, reagents, temperature, downtime and performance analytics." },
      { property: "og:title", content: "Instrument QC Workspaces | Litu Vault" },
      { property: "og:description", content: "Laboratory and radiology quality control organised per analyzer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RoleGate path="/instruments">
      <InstrumentsPage />
    </RoleGate>
  ),
});

interface Instrument {
  id: string; name: string; manufacturer: string | null; model: string | null; serial_number: string | null;
  asset_tag: string | null; location: string | null; lab_section: string; modality: string; status: string;
  commissioned_on: string | null; notes: string | null;
  qc_profile?: string | null; qc_panel_codes?: string[] | null;
}

const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—");

type FieldType = "text" | "number" | "date" | "datetime" | "textarea" | "select";
interface Field { key: string; label: string; type: FieldType; options?: string[]; default?: string | number }

const SECTIONS = ["Hematology", "Chemistry", "Immunology", "Microbiology", "Coagulation", "Histopathology", "Radiography", "Ultrasound", "CT", "MRI"];
const STATUSES = ["active", "maintenance", "down", "retired"];

function InstrumentsPage() {
  const qc = useQueryClient();
  const { hasAnyRole, hasRole } = useAuth();
  const canWrite = hasAnyRole(["lab_tech", "radiologist", "admin"]);
  // Modality scoping: lab staff only see laboratory analyzers, radiology staff
  // only see imaging modalities. Admins (and any cross-trained user holding both
  // roles) keep the full fleet with the modality filter.
  const isAdmin = hasRole("admin");
  const labOnly = !isAdmin && hasRole("lab_tech") && !hasRole("radiologist");
  const radOnly = !isAdmin && hasRole("radiologist") && !hasRole("lab_tech");
  const scope: "laboratory" | "radiology" | null = labOnly ? "laboratory" : radOnly ? "radiology" : null;
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState<"all" | "laboratory" | "radiology">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    lab_section: scope === "radiology" ? "Radiology" : "Chemistry",
    modality: scope ?? "laboratory",
    status: "active",
  });


  const instruments = useQuery({
    queryKey: ["instruments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments" as never).select("*").order("lab_section").order("name");
      if (error) throw error;
      return (data as unknown as Instrument[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = { ...form, commissioned_on: form["commissioned_on"] || null };
      const { error } = await supabase.from("instruments" as never).insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instruments"] });
      setAddOpen(false);
      setForm({
        lab_section: scope === "radiology" ? "Radiology" : "Chemistry",
        modality: scope ?? "laboratory",
        status: "active",
      });
      toast.success("Instrument registered");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (instruments.data ?? []).filter((i) => {
      if (scope && i.modality !== scope) return false;
      if (!scope && modality !== "all" && i.modality !== modality) return false;
      if (!q) return true;
      return [i.name, i.manufacturer, i.model, i.serial_number, i.lab_section, i.location]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [instruments.data, search, modality, scope]);
  const pager = usePager(list, 20);


  const selected = list.find((i) => i.id === selectedId) ?? list[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Cpu className="h-6 w-6 text-primary" />{" "}
            {scope === "radiology" ? "Radiology equipment quality control"
              : scope === "laboratory" ? "Laboratory analyzer quality control"
              : "Instrument quality control"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Every {scope === "radiology" ? "modality" : "analyzer"} has its own workspace: profile, QC, calibration, maintenance, reagents, temperature, downtime, service and performance.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Register instrument</Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Fleet list */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search analyzers" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {!scope && (
            <div className="flex gap-1 text-xs">
              {(["all", "laboratory", "radiology"] as const).map((m) => (
                <button key={m} onClick={() => setModality(m)}
                  className={`rounded-full border px-3 py-1 capitalize ${modality === m ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                  {m}
                </button>
              ))}
            </div>
          )}

          <div className="max-h-[70vh] overflow-auto rounded-lg border bg-card">
            {pager.total === 0 && <div className="p-4 text-sm text-muted-foreground">No instruments.</div>}
            {pager.slice.map((i) => (
              <button key={i.id} onClick={() => setSelectedId(i.id)}
                className={`flex w-full flex-col gap-0.5 border-l-4 border-b px-3 py-2 text-left text-sm transition ${
                  i.id === selected?.id ? "border-l-primary bg-accent" : "border-l-transparent hover:bg-accent/40"
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{i.name}</span>
                  <StatusDot status={i.status} />
                </div>
                <span className="text-xs text-muted-foreground">{i.lab_section} · {i.manufacturer ?? "—"} {i.model ?? ""}</span>
              </button>
            ))}
            <Pager {...pager} label="instruments" />
          </div>
        </div>

        {/* Workspace */}
        {selected ? <InstrumentWorkspace key={selected.id} inst={selected} canWrite={canWrite} /> : (
          <div className="flex h-60 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
            Select an instrument.
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register instrument</DialogTitle></DialogHeader>
          <div className="grid max-h-[60vh] gap-3 overflow-auto">
            <FormFields
              fields={[
                { key: "name", label: "Instrument name", type: "text" },
                { key: "manufacturer", label: "Manufacturer", type: "text" },
                { key: "model", label: "Model", type: "text" },
                { key: "serial_number", label: "Serial number", type: "text" },
                { key: "asset_tag", label: "Asset tag", type: "text" },
                { key: "location", label: "Location", type: "text" },
                { key: "lab_section", label: "Laboratory section", type: "select", options: SECTIONS },
                { key: "modality", label: "Modality", type: "select", options: scope ? [scope] : ["laboratory", "radiology"] },
                { key: "status", label: "Status", type: "select", options: STATUSES },
                { key: "commissioned_on", label: "Commissioned on", type: "date" },
                { key: "notes", label: "Notes", type: "textarea" },
              ]}
              values={form}
              onChange={setForm}
            />
          </div>
          <DialogFooter>
            <Button disabled={!form["name"] || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "active" ? "bg-emerald-500" : status === "maintenance" ? "bg-amber-500" : status === "down" ? "bg-destructive" : "bg-muted-foreground";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} title={status} />;
}

function FormFields({ fields, values, onChange }: { fields: Field[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const set = (k: string, v: string) => onChange({ ...values, [k]: v });
  return (
    <>
      {fields.map((f) => (
        <div key={f.key}>
          <Label className="text-xs">{f.label}</Label>
          {f.type === "textarea" ? (
            <Textarea value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
          ) : f.type === "select" ? (
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={values[f.key] ?? f.options?.[0] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            >
              {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <Input
              type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </>
  );
}

/** Generic per-instrument log table with add + delete. */
function LogSection<T extends { id: string }>({
  table, instrumentId, canWrite, orderBy, fields, columns, empty,
}: {
  table: string;
  instrumentId: string;
  canWrite: boolean;
  orderBy: string;
  fields: Field[];
  columns: { label: string; render: (row: T) => ReactNode }[];
  empty: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const rows = useQuery({
    queryKey: [table, instrumentId],
    queryFn: async () => {
      const { data, error } = await supabase.from(table as never).select("*")
        .eq("instrument_id", instrumentId).order(orderBy, { ascending: false });
      if (error) throw error;
      return (data as unknown as T[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { instrument_id: instrumentId };
      for (const f of fields) {
        const raw = form[f.key];
        if (raw === undefined || raw === "") { payload[f.key] = f.default ?? null; continue; }
        payload[f.key] = f.type === "number" ? Number(raw) : raw;
      }
      const { error } = await supabase.from(table as never).insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table, instrumentId] }); setOpen(false); setForm({}); toast.success("Record added"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table, instrumentId] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add entry</Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              {columns.map((c) => <th key={c.label} className="px-3 py-2">{c.label}</th>)}
              {canWrite && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.isLoading && <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!rows.isLoading && (rows.data ?? []).length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-muted-foreground">{empty}</td></tr>
            )}
            {(rows.data ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                {columns.map((c) => <td key={c.label} className="px-3 py-2">{c.render(r)}</td>)}
                {canWrite && (
                  <td className="px-3 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New entry</DialogTitle></DialogHeader>
          <div className="grid max-h-[60vh] gap-3 overflow-auto">
            <FormFields fields={fields} values={form} onChange={setForm} />
          </div>
          <DialogFooter>
            <Button disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface QcRun { id: string; run_at: string; analyte: string; qc_level: string; lot_number: string | null; target_value: number | null; sd: number | null; observed_value: number | null; z_score: number | null; result: string; comments: string | null }
interface Incident { id: string; occurred_at: string; error_code: string | null; description: string; severity: string; downtime_minutes: number; resolved_at: string | null; resolution: string | null }

function InstrumentWorkspace({ inst, canWrite }: { inst: Instrument; canWrite: boolean }) {
  const qcRuns = useQuery({
    queryKey: ["instrument_qc_runs", inst.id],
    queryFn: async () => {
      const { data } = await supabase.from("instrument_qc_runs" as never).select("*").eq("instrument_id", inst.id).order("run_at", { ascending: false });
      return (data as unknown as QcRun[]) ?? [];
    },
  });
  const incidents = useQuery({
    queryKey: ["instrument_incidents", inst.id],
    queryFn: async () => {
      const { data } = await supabase.from("instrument_incidents" as never).select("*").eq("instrument_id", inst.id).order("occurred_at", { ascending: false });
      return (data as unknown as Incident[]) ?? [];
    },
  });
  const linkedOrders = useQuery({
    queryKey: ["instrument-orders", inst.id],
    queryFn: async () => {
      const { data } = await supabase.from("lab_orders" as never)
        .select("id, created_at, status, test_id, updated_at").eq("instrument_id", inst.id);
      return (data as unknown as { id: string; created_at: string; status: string; test_id: string; updated_at: string | null }[]) ?? [];
    },
  });

  const analytics = useMemo(() => {
    const runs = qcRuns.data ?? [];
    const pass = runs.filter((r) => r.result === "pass").length;
    const qcPassRate = runs.length ? Math.round((pass / runs.length) * 100) : null;
    const downtime = (incidents.data ?? []).reduce((s, i) => s + (i.downtime_minutes ?? 0), 0);
    const windowMinutes = 30 * 24 * 60;
    const uptime = Math.max(0, Math.round(((windowMinutes - downtime) / windowMinutes) * 1000) / 10);
    const orders = linkedOrders.data ?? [];
    const tats = orders
      .filter((o) => o.updated_at)
      .map((o) => (new Date(o.updated_at as string).getTime() - new Date(o.created_at).getTime()) / 60000)
      .filter((n) => n > 0);
    const avgTat = tats.length ? Math.round(tats.reduce((a, b) => a + b, 0) / tats.length) : null;
    return { qcPassRate, downtime, uptime, orders: orders.length, avgTat, openIncidents: (incidents.data ?? []).filter((i) => !i.resolved_at).length };
  }, [qcRuns.data, incidents.data, linkedOrders.data]);

  const leveyJennings = useMemo(() => {
    const runs = [...(qcRuns.data ?? [])].reverse();
    return runs
      .filter((r) => r.observed_value != null)
      .map((r) => ({
        label: new Date(r.run_at).toLocaleDateString("en-GB"),
        v: Number(r.observed_value),
        target: r.target_value != null ? Number(r.target_value) : null,
      }));
  }, [qcRuns.data]);

  return (
    <div className="space-y-4">
      {/* Profile header */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{inst.name}</h2>
              <StatusDot status={inst.status} />
              <span className="text-xs capitalize text-muted-foreground">{inst.status}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {inst.manufacturer ?? "—"} {inst.model ?? ""} · S/N {inst.serial_number ?? "—"} · {inst.location ?? "—"}
            </p>
          </div>
          <div className="rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{inst.lab_section}</div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi icon={Gauge} label="Uptime (30d)" value={`${analytics.uptime}%`} />
          <Kpi icon={Activity} label="QC pass rate" value={analytics.qcPassRate == null ? "—" : `${analytics.qcPassRate}%`} />
          <Kpi icon={CalendarClock} label="Avg TAT" value={analytics.avgTat == null ? "—" : `${analytics.avgTat} min`} />
          <Kpi icon={Beaker} label="Tests run" value={String(analytics.orders)} />
          <Kpi icon={TriangleAlert} label="Open faults" value={String(analytics.openIncidents)} />
          <Kpi icon={Wrench} label="Downtime (min)" value={String(analytics.downtime)} />
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="qc">QC history</TabsTrigger>
          <TabsTrigger value="calibration">Calibration</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="reagents">Reagents</TabsTrigger>
          <TabsTrigger value="temperature">Temperature</TabsTrigger>
          <TabsTrigger value="errors">Errors & downtime</TabsTrigger>
          <TabsTrigger value="service">Service history</TabsTrigger>
          <TabsTrigger value="stats">Testing statistics</TabsTrigger>
          <TabsTrigger value="analytics">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-3">
          <div className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
            <Row label="Manufacturer" value={inst.manufacturer} />
            <Row label="Model" value={inst.model} />
            <Row label="Serial number" value={inst.serial_number} />
            <Row label="Asset tag" value={inst.asset_tag} />
            <Row label="Location" value={inst.location} />
            <Row label="Section" value={inst.lab_section} />
            <Row label="Modality" value={inst.modality} />
            <Row label="Status" value={inst.status} />
            <Row label="Commissioned" value={d(inst.commissioned_on)} />
            <Row label="Notes" value={inst.notes} />
          </div>
        </TabsContent>

        <TabsContent value="qc" className="mt-3 space-y-3">
          <div className="mb-2 flex justify-end">
            <QcPanelEntry instrumentId={inst.id} section={inst.lab_section} canWrite={canWrite} panelCodes={inst.qc_panel_codes} profile={inst.qc_profile ?? inst.modality} />
          </div>
          <QcHistory instrumentId={inst.id} instrument={inst} />
          <div className="pt-1 text-xs font-medium text-muted-foreground">Add or manage individual QC runs</div>
          <LogSection<QcRun>

            table="instrument_qc_runs" instrumentId={inst.id} canWrite={canWrite} orderBy="run_at"
            empty="No QC runs recorded."
            fields={[
              { key: "run_at", label: "Run at", type: "datetime" },
              { key: "analyte", label: "Analyte", type: "text" },
              { key: "qc_level", label: "QC level", type: "select", options: ["Level 1", "Level 2", "Level 3"] },
              { key: "lot_number", label: "Control lot", type: "text" },
              { key: "target_value", label: "Target (mean)", type: "number" },
              { key: "sd", label: "SD", type: "number" },
              { key: "observed_value", label: "Observed", type: "number" },
              { key: "z_score", label: "Z-score (SDI)", type: "number" },
              { key: "result", label: "Result", type: "select", options: ["pass", "warn", "fail"] },
              { key: "comments", label: "Comments", type: "textarea" },
            ]}
            columns={[
              { label: "Run", render: (r) => dt(r.run_at) },
              { label: "Analyte", render: (r) => r.analyte },
              { label: "Level", render: (r) => r.qc_level },
              { label: "Target ± SD", render: (r) => `${r.target_value ?? "—"} ± ${r.sd ?? "—"}` },
              { label: "Observed", render: (r) => <span className="font-mono">{r.observed_value ?? "—"}</span> },
              { label: "Z", render: (r) => r.z_score ?? "—" },
              { label: "Result", render: (r) => (
                <span className={r.result === "fail" ? "font-semibold text-destructive" : r.result === "warn" ? "text-amber-600" : "text-emerald-600"}>{r.result}</span>
              ) },
            ]}
          />
          {leveyJennings.length >= 2 && (
            <div className="mt-3 rounded-lg border bg-card p-3">
              <div className="mb-2 text-xs font-medium">Levey-Jennings (observed vs target)</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={leveyJennings} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={10} />
                    <YAxis fontSize={10} />
                    <Tooltip />
                    {leveyJennings[0]?.target != null && <ReferenceLine y={leveyJennings[0].target as number} stroke="#16a34a" strokeDasharray="4 4" />}
                    <Line type="monotone" dataKey="v" stroke="#0f4c75" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="calibration" className="mt-3">
          <LogSection<{ id: string; calibrated_at: string; analyte: string | null; method: string | null; calibrator_lot: string | null; outcome: string; next_due: string | null; notes: string | null }>
            table="instrument_calibrations" instrumentId={inst.id} canWrite={canWrite} orderBy="calibrated_at"
            empty="No calibration records."
            fields={[
              { key: "calibrated_at", label: "Calibrated at", type: "datetime" },
              { key: "analyte", label: "Analyte / channel", type: "text" },
              { key: "method", label: "Method", type: "text" },
              { key: "calibrator_lot", label: "Calibrator lot", type: "text" },
              { key: "outcome", label: "Outcome", type: "select", options: ["passed", "failed", "repeated"] },
              { key: "next_due", label: "Next due", type: "date" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { label: "Date", render: (r) => dt(r.calibrated_at) },
              { label: "Analyte", render: (r) => r.analyte ?? "—" },
              { label: "Method", render: (r) => r.method ?? "—" },
              { label: "Calibrator lot", render: (r) => r.calibrator_lot ?? "—" },
              { label: "Outcome", render: (r) => <span className={r.outcome === "failed" ? "text-destructive" : "text-emerald-600"}>{r.outcome}</span> },
              { label: "Next due", render: (r) => d(r.next_due) },
            ]}
          />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-3">
          <LogSection<{ id: string; performed_at: string; task_type: string; description: string; outcome: string | null; next_due: string | null }>
            table="instrument_maintenance" instrumentId={inst.id} canWrite={canWrite} orderBy="performed_at"
            empty="No maintenance recorded."
            fields={[
              { key: "performed_at", label: "Performed at", type: "datetime" },
              { key: "task_type", label: "Task type", type: "select", options: ["daily", "weekly", "monthly", "quarterly", "adhoc"] },
              { key: "description", label: "Task", type: "text" },
              { key: "outcome", label: "Outcome", type: "text" },
              { key: "next_due", label: "Next due", type: "date" },
            ]}
            columns={[
              { label: "Performed", render: (r) => dt(r.performed_at) },
              { label: "Type", render: (r) => r.task_type },
              { label: "Task", render: (r) => r.description },
              { label: "Outcome", render: (r) => r.outcome ?? "—" },
              { label: "Next due", render: (r) => d(r.next_due) },
            ]}
          />
        </TabsContent>

        <TabsContent value="reagents" className="mt-3">
          <LogSection<{ id: string; name: string; lot_number: string | null; quantity: number; unit: string | null; received_on: string | null; expiry_date: string | null; status: string }>
            table="instrument_reagents" instrumentId={inst.id} canWrite={canWrite} orderBy="created_at"
            empty="No reagents or consumables registered."
            fields={[
              { key: "name", label: "Reagent / consumable", type: "text" },
              { key: "lot_number", label: "Lot number", type: "text" },
              { key: "quantity", label: "Quantity", type: "number" },
              { key: "unit", label: "Unit", type: "text" },
              { key: "received_on", label: "Received on", type: "date" },
              { key: "expiry_date", label: "Expiry", type: "date" },
              { key: "status", label: "Status", type: "select", options: ["in_use", "in_stock", "quarantined", "expired", "depleted"] },
            ]}
            columns={[
              { label: "Item", render: (r) => r.name },
              { label: "Lot", render: (r) => r.lot_number ?? "—" },
              { label: "Qty", render: (r) => `${r.quantity} ${r.unit ?? ""}` },
              { label: "Received", render: (r) => d(r.received_on) },
              { label: "Expiry", render: (r) => {
                const exp = r.expiry_date ? new Date(r.expiry_date) : null;
                const soon = exp ? exp.getTime() - Date.now() < 30 * 864e5 : false;
                return <span className={soon ? "font-medium text-destructive" : ""}>{d(r.expiry_date)}</span>;
              } },
              { label: "Status", render: (r) => r.status },
            ]}
          />
        </TabsContent>

        <TabsContent value="temperature" className="mt-3">
          <LogSection<{ id: string; recorded_at: string; temperature_c: number; min_c: number | null; max_c: number | null; in_range: boolean; notes: string | null }>
            table="instrument_temperature_logs" instrumentId={inst.id} canWrite={canWrite} orderBy="recorded_at"
            empty="No temperature readings logged."
            fields={[
              { key: "recorded_at", label: "Recorded at", type: "datetime" },
              { key: "temperature_c", label: "Temperature (°C)", type: "number" },
              { key: "min_c", label: "Allowed min (°C)", type: "number" },
              { key: "max_c", label: "Allowed max (°C)", type: "number" },
              { key: "in_range", label: "In range", type: "select", options: ["true", "false"] },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { label: "Recorded", render: (r) => dt(r.recorded_at) },
              { label: "Temp", render: (r) => <span className={r.in_range ? "font-mono" : "font-mono font-semibold text-destructive"}>{r.temperature_c} °C</span> },
              { label: "Range", render: (r) => `${r.min_c ?? "—"} – ${r.max_c ?? "—"}` },
              { label: "Status", render: (r) => (r.in_range ? <span className="text-emerald-600">in range</span> : <span className="text-destructive">excursion</span>) },
              { label: "Notes", render: (r) => r.notes ?? "—" },
            ]}
          />
        </TabsContent>

        <TabsContent value="errors" className="mt-3">
          <LogSection<Incident>
            table="instrument_incidents" instrumentId={inst.id} canWrite={canWrite} orderBy="occurred_at"
            empty="No errors or downtime recorded."
            fields={[
              { key: "occurred_at", label: "Occurred at", type: "datetime" },
              { key: "error_code", label: "Error code", type: "text" },
              { key: "description", label: "Description", type: "text" },
              { key: "severity", label: "Severity", type: "select", options: ["minor", "major", "critical"] },
              { key: "downtime_minutes", label: "Downtime (minutes)", type: "number" },
              { key: "resolved_at", label: "Resolved at", type: "datetime" },
              { key: "resolution", label: "Resolution", type: "textarea" },
            ]}
            columns={[
              { label: "Occurred", render: (r) => dt(r.occurred_at) },
              { label: "Code", render: (r) => r.error_code ?? "—" },
              { label: "Description", render: (r) => r.description },
              { label: "Severity", render: (r) => <span className={r.severity === "critical" ? "font-semibold text-destructive" : r.severity === "major" ? "text-amber-600" : ""}>{r.severity}</span> },
              { label: "Downtime", render: (r) => `${r.downtime_minutes} min` },
              { label: "Resolved", render: (r) => (r.resolved_at ? dt(r.resolved_at) : <span className="text-destructive">open</span>) },
            ]}
          />
        </TabsContent>

        <TabsContent value="service" className="mt-3">
          <LogSection<{ id: string; service_date: string; vendor: string | null; engineer: string | null; service_type: string; cost_cents: number; report_ref: string | null; next_service_due: string | null }>
            table="instrument_service_history" instrumentId={inst.id} canWrite={canWrite} orderBy="service_date"
            empty="No service visits recorded."
            fields={[
              { key: "service_date", label: "Service date", type: "date" },
              { key: "vendor", label: "Vendor", type: "text" },
              { key: "engineer", label: "Engineer", type: "text" },
              { key: "service_type", label: "Type", type: "select", options: ["preventive", "corrective", "installation", "validation"] },
              { key: "cost_cents", label: "Cost (KES cents)", type: "number" },
              { key: "report_ref", label: "Service report ref", type: "text" },
              { key: "next_service_due", label: "Next service due", type: "date" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { label: "Date", render: (r) => d(r.service_date) },
              { label: "Vendor", render: (r) => r.vendor ?? "—" },
              { label: "Engineer", render: (r) => r.engineer ?? "—" },
              { label: "Type", render: (r) => r.service_type },
              { label: "Cost", render: (r) => `KES ${(r.cost_cents / 100).toLocaleString("en-GB")}` },
              { label: "Next due", render: (r) => d(r.next_service_due) },
            ]}
          />
        </TabsContent>

        <TabsContent value="stats" className="mt-3">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi icon={Beaker} label="Linked tests" value={String((linkedOrders.data ?? []).length)} />
              <Kpi icon={Activity} label="Resulted" value={String((linkedOrders.data ?? []).filter((o) => o.status === "resulted" || o.status === "completed").length)} />
              <Kpi icon={CalendarClock} label="Avg TAT" value={analytics.avgTat == null ? "—" : `${analytics.avgTat} min`} />
            </div>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-3 py-2">Ordered</th><th className="px-3 py-2">Status</th></tr>
                </thead>
                <tbody>
                  {(linkedOrders.data ?? []).length === 0 && (
                    <tr><td colSpan={2} className="px-3 py-8 text-center text-muted-foreground">
                      No patient tests are linked to this instrument yet.
                    </td></tr>
                  )}
                  {(linkedOrders.data ?? []).slice(0, 30).map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="px-3 py-2">{dt(o.created_at)}</td>
                      <td className="px-3 py-2 capitalize">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Gauge} label="Uptime (30d)" value={`${analytics.uptime}%`} />
            <Kpi icon={Activity} label="QC pass rate" value={analytics.qcPassRate == null ? "—" : `${analytics.qcPassRate}%`} />
            <Kpi icon={CalendarClock} label="Average TAT" value={analytics.avgTat == null ? "—" : `${analytics.avgTat} min`} />
            <Kpi icon={Wrench} label="Total downtime" value={`${analytics.downtime} min`} />
            <Kpi icon={TriangleAlert} label="QC failures" value={String((qcRuns.data ?? []).filter((r) => r.result === "fail").length)} />
            <Kpi icon={Settings} label="Incidents" value={String((incidents.data ?? []).length)} />
            <Kpi icon={Thermometer} label="Section" value={inst.lab_section} />
            <Kpi icon={Beaker} label="Tests run" value={String(analytics.orders)} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div>{value ?? "—"}</div>
    </div>
  );
}
