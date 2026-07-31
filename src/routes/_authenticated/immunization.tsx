import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Syringe, CalendarClock, AlertTriangle, Thermometer, Package, Search, ShieldAlert, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/immunization")({
  head: () => ({
    meta: [
      { title: "Immunization — Litu Vault" },
      { name: "description", content: "KEPI immunization dashboard, vaccination registry, vaccine stock and AEFI monitoring." },
      { property: "og:title", content: "Immunization — Litu Vault" },
      { property: "og:description", content: "KEPI immunization dashboard, registry, cold chain and AEFI monitoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RoleGate path="/immunization">
      <ImmunizationModule />
    </RoleGate>
  ),
});

interface Vaccine {
  id: string; code: string; name: string; antigen: string; manufacturer: string | null;
  default_route: string; default_site: string; doses_required: number; target_group: string;
}
interface ScheduleRow { id: string; vaccine_id: string; dose_number: number; due_age_days: number; window_days: number; label: string }
interface Immunization {
  id: string; patient_id: string; vaccine_id: string | null; vaccine_name: string; antigen: string | null;
  dose_number: number; route: string | null; site: string | null; administered_at: string;
  batch_number: string | null; expiry_date: string | null; manufacturer: string | null;
  vaccinator_name: string | null; facility: string | null; immediate_reaction: string | null; comments: string | null;
}
interface StockRow {
  id: string; vaccine_id: string; batch_number: string; expiry_date: string | null; quantity: number;
  reorder_level: number; storage_location: string | null; storage_temp_c: number | null; cold_chain_ok: boolean; last_temp_check: string | null;
}
interface AefiRow { id: string; patient_id: string; onset_at: string; severity: string; description: string; outcome: string | null }
interface PatientOpt { id: string; full_name: string; date_of_birth: string | null; medical_record_number: string | null }

type Tab = "dashboard" | "registry" | "workspace" | "stock" | "aefi";

const DAY = 24 * 3600 * 1000;
const ageDays = (dob: string | null) => (dob ? Math.floor((Date.now() - new Date(dob).getTime()) / DAY) : null);

function ImmunizationModule() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [patientId, setPatientId] = useState("");
  const [search, setSearch] = useState("");

  const vaccines = useQuery({
    queryKey: ["vaccine-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vaccine_catalog" as never).select("*").order("name");
      if (error) throw error;
      return (data as unknown as Vaccine[]) ?? [];
    },
  });
  const schedule = useQuery({
    queryKey: ["kepi-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kepi_schedule" as never).select("*").order("due_age_days");
      if (error) throw error;
      return (data as unknown as ScheduleRow[]) ?? [];
    },
  });
  // Registry & workspace list real patients only — staff accounts that happen to
  // have a patient row are excluded via a security-definer helper.
  const staffIds = useQuery({
    queryKey: ["staff-patient-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_patient_ids" as never);
      if (error) return [] as string[];
      return ((data as unknown as string[]) ?? []).map(String);
    },
  });
  const patients = useQuery({
    queryKey: ["imm-patients", (staffIds.data ?? []).length],
    enabled: staffIds.isFetched,
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never)
        .select("id, full_name, date_of_birth, gender, medical_record_number").order("full_name");
      if (error) throw error;
      const staff = new Set(staffIds.data ?? []);
      return ((data as unknown as PatientOpt[]) ?? []).filter((p) => !staff.has(p.id));
    },
  });

  const immunizations = useQuery({
    queryKey: ["immunizations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("immunizations" as never)
        .select("*").order("administered_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data as unknown as Immunization[]) ?? [];
    },
  });
  const stock = useQuery({
    queryKey: ["vaccine-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vaccine_stock" as never).select("*").order("expiry_date");
      if (error) throw error;
      return (data as unknown as StockRow[]) ?? [];
    },
  });
  const aefi = useQuery({
    queryKey: ["aefi-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("aefi_events" as never)
        .select("*").order("onset_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data as unknown as AefiRow[]) ?? [];
    },
  });

  const vaccineById = (id: string | null) => vaccines.data?.find((v) => v.id === id);
  const patientById = (id: string) => patients.data?.find((p) => p.id === id);
  const patientName = (id: string) => patientById(id)?.full_name ?? "—";

  // ---- KEPI due calculation ----
  const dueFor = (pid: string) => {
    const p = patientById(pid);
    const age = ageDays(p?.date_of_birth ?? null);
    if (age === null) return [] as (ScheduleRow & { overdue: boolean })[];
    const given = (immunizations.data ?? []).filter((i) => i.patient_id === pid);
    return (schedule.data ?? [])
      .filter((s) => age >= s.due_age_days)
      .filter((s) => !given.some((g) => g.vaccine_id === s.vaccine_id && g.dose_number === s.dose_number))
      .map((s) => ({ ...s, overdue: age > s.due_age_days + s.window_days }));
  };

  const todayCount = (immunizations.data ?? []).filter(
    (i) => new Date(i.administered_at).toDateString() === new Date().toDateString(),
  ).length;

  const dueSummary = useMemo(() => {
    let due = 0, missed = 0, catchUp = 0;
    for (const p of patients.data ?? []) {
      const rows = dueFor(p.id);
      due += rows.length;
      missed += rows.filter((r) => r.overdue).length;
      const age = ageDays(p.date_of_birth);
      if (age !== null && age > 365 && rows.some((r) => r.due_age_days < 365)) catchUp += 1;
    }
    return { due, missed, catchUp };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients.data, schedule.data, immunizations.data]);

  const lowStock = (stock.data ?? []).filter((s) => s.quantity <= s.reorder_level);
  const coldChainAlerts = (stock.data ?? []).filter(
    (s) => !s.cold_chain_ok || (s.storage_temp_c !== null && (s.storage_temp_c < 2 || s.storage_temp_c > 8)),
  );
  const expiringSoon = (stock.data ?? []).filter(
    (s) => s.expiry_date && new Date(s.expiry_date).getTime() - Date.now() < 90 * DAY,
  );

  // ---- Record a vaccination ----
  const [form, setForm] = useState<Record<string, string>>({});
  const selectedVaccine = vaccineById(form.vaccine_id ?? null);

  const record = useMutation({
    mutationFn: async () => {
      if (!patientId) throw new Error("Select a patient first");
      if (!form.vaccine_id) throw new Error("Select a vaccine");
      const v = vaccineById(form.vaccine_id);
      const { error } = await supabase.from("immunizations" as never).insert({
        patient_id: patientId,
        vaccine_id: form.vaccine_id,
        vaccine_name: v?.name ?? "Vaccine",
        antigen: v?.antigen ?? null,
        dose_number: Number(form.dose_number || 1),
        route: form.route || v?.default_route || null,
        site: form.site || v?.default_site || null,
        administered_at: form.administered_at ? new Date(form.administered_at).toISOString() : new Date().toISOString(),
        batch_number: form.batch_number || null,
        expiry_date: form.expiry_date || null,
        manufacturer: form.manufacturer || v?.manufacturer || null,
        vaccinator_id: user?.id ?? null,
        vaccinator_name: profile?.full_name ?? null,
        facility: form.facility || "Litu Vault Hospital",
        immediate_reaction: form.immediate_reaction || null,
        comments: form.comments || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["immunizations"] });
      setForm({});
      toast.success("Vaccination recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [aefiForm, setAefiForm] = useState<Record<string, string>>({});
  const reportAefi = useMutation({
    mutationFn: async () => {
      if (!patientId) throw new Error("Select a patient first");
      if (!aefiForm.description) throw new Error("Describe the adverse event");
      const { error } = await supabase.from("aefi_events" as never).insert({
        patient_id: patientId,
        severity: aefiForm.severity || "mild",
        description: aefiForm.description,
        outcome: aefiForm.outcome || null,
        reported_by: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aefi-events"] });
      setAefiForm({});
      toast.success("AEFI reported");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patientHistory = (immunizations.data ?? []).filter((i) => i.patient_id === patientId);
  const filteredPatients = (patients.data ?? []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.full_name.toLowerCase().includes(q) || (p.medical_record_number ?? "").toLowerCase().includes(q);
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "registry", label: "Registry" },
    { key: "workspace", label: "Vaccination workspace" },
    { key: "stock", label: "Vaccine stock & cold chain" },
    { key: "aefi", label: "AEFI monitoring" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Syringe className="h-6 w-6 text-primary" /> Immunization
        </h1>
        <p className="text-sm text-muted-foreground">
          Kenya EPI schedule, lifelong vaccination registry, cold chain and adverse-event monitoring.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Syringe} label="Today's vaccinations" value={todayCount} tone="sky" />
            <Stat icon={CalendarClock} label="Doses due" value={dueSummary.due} tone="amber" />
            <Stat icon={AlertTriangle} label="Missed / overdue" value={dueSummary.missed} tone="rose" />
            <Stat icon={Activity} label="Catch-up needed" value={dueSummary.catchUp} tone="violet" />
            <Stat icon={Package} label="Vaccine stock alerts" value={lowStock.length} tone="amber" />
            <Stat icon={Thermometer} label="Cold chain alerts" value={coldChainAlerts.length} tone="rose" />
            <Stat icon={ShieldAlert} label="AEFI reports" value={aefi.data?.length ?? 0} tone="rose" />
            <Stat
              icon={Activity}
              label="Coverage (fully due given)"
              value={`${coverage(patients.data ?? [], dueFor)}%`}
              tone="emerald"
            />
          </div>

          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="border-b px-4 py-2 text-sm font-medium">Patients due / overdue</div>
            <ul className="divide-y">
              {(patients.data ?? []).flatMap((p) => {
                const rows = dueFor(p.id);
                if (rows.length === 0) return [];
                return [(
                  <li key={p.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div>
                      <div className="font-medium">{p.full_name}</div>
                      <div className="text-xs text-muted-foreground">MRN {p.medical_record_number ?? "—"}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {rows.slice(0, 6).map((r) => (
                        <span
                          key={r.id}
                          className={`rounded border px-1.5 py-0.5 text-xs ${r.overdue ? "border-rose-500/40 bg-rose-500/10 text-rose-700" : "border-amber-500/40 bg-amber-500/10 text-amber-700"}`}
                        >
                          {vaccineById(r.vaccine_id)?.code ?? "?"} d{r.dose_number} · {r.label}
                        </span>
                      ))}
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => { setPatientId(p.id); setTab("workspace"); }}>
                      Vaccinate
                    </Button>
                  </li>
                )];
              })}
              {(patients.data ?? []).every((p) => dueFor(p.id).length === 0) && (
                <li className="p-6 text-center text-sm text-muted-foreground">No vaccinations currently due.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {tab === "registry" && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search patient or MRN…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="max-h-[70vh] overflow-auto rounded-lg border bg-card">
              {filteredPatients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPatientId(p.id)}
                  className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted ${patientId === p.id ? "bg-muted" : ""}`}
                >
                  <div className="font-medium">{p.full_name}</div>
                  <div className="text-xs text-muted-foreground">{p.medical_record_number ?? "—"}</div>
                </button>
              ))}
            </div>
            <div className="rounded-lg border bg-card p-4">
              {!patientId ? (
                <p className="text-sm text-muted-foreground">Select a patient to view their digital vaccination card.</p>
              ) : (
                <>
                  <h2 className="font-medium">{patientName(patientId)} · digital vaccination card</h2>
                  <p className="text-xs text-muted-foreground">Lifelong immunization history</p>
                  <ol className="mt-4 space-y-3 border-l pl-4">
                    {patientHistory.length === 0 && <li className="text-sm text-muted-foreground">No vaccines recorded yet.</li>}
                    {patientHistory.map((i) => (
                      <li key={i.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                        <div className="text-sm font-medium">{i.vaccine_name} · dose {i.dose_number}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(i.administered_at).toLocaleString("en-GB")} · {i.route ?? "—"} · {i.site ?? "—"}
                          {i.batch_number ? ` · batch ${i.batch_number}` : ""}
                          {i.vaccinator_name ? ` · ${i.vaccinator_name}` : ""}
                        </div>
                        {i.immediate_reaction && (
                          <div className="text-xs text-rose-600">Reaction: {i.immediate_reaction}</div>
                        )}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-5">
                    <h3 className="text-sm font-medium">Due per KEPI schedule</h3>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {dueFor(patientId).length === 0 && <span className="text-xs text-muted-foreground">Up to date.</span>}
                      {dueFor(patientId).map((r) => (
                        <span key={r.id} className={`rounded border px-1.5 py-0.5 text-xs ${r.overdue ? "border-rose-500/40 bg-rose-500/10 text-rose-700" : "border-amber-500/40 bg-amber-500/10 text-amber-700"}`}>
                          {vaccineById(r.vaccine_id)?.name ?? "?"} · dose {r.dose_number} · {r.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "workspace" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-medium">Record a vaccination</h2>
            <div>
              <Label>Patient *</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger><SelectValue placeholder="Choose patient" /></SelectTrigger>
                <SelectContent>
                  {(patients.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}{p.medical_record_number ? ` · ${p.medical_record_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Vaccine *</Label>
                <Select value={form.vaccine_id ?? ""} onValueChange={(v) => setForm({ ...form, vaccine_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose vaccine" /></SelectTrigger>
                  <SelectContent>
                    {(vaccines.data ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name} ({v.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Antigen</Label>
                <Input value={selectedVaccine?.antigen ?? ""} readOnly />
              </div>
              <div>
                <Label>Dose number</Label>
                <Input type="number" min={1} value={form.dose_number ?? "1"} onChange={(e) => setForm({ ...form, dose_number: e.target.value })} />
              </div>
              <div>
                <Label>Route</Label>
                <Input value={form.route ?? selectedVaccine?.default_route ?? ""} onChange={(e) => setForm({ ...form, route: e.target.value })} />
              </div>
              <div>
                <Label>Site</Label>
                <Input value={form.site ?? selectedVaccine?.default_site ?? ""} onChange={(e) => setForm({ ...form, site: e.target.value })} />
              </div>
              <div>
                <Label>Date & time</Label>
                <Input type="datetime-local" value={form.administered_at ?? ""} onChange={(e) => setForm({ ...form, administered_at: e.target.value })} />
              </div>
              <div>
                <Label>Batch / lot number</Label>
                <Input value={form.batch_number ?? ""} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
              </div>
              <div>
                <Label>Expiry date</Label>
                <Input type="date" value={form.expiry_date ?? ""} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
              <div>
                <Label>Manufacturer</Label>
                <Input value={form.manufacturer ?? selectedVaccine?.manufacturer ?? ""} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
              </div>
              <div>
                <Label>Facility</Label>
                <Input value={form.facility ?? "Litu Vault Hospital"} onChange={(e) => setForm({ ...form, facility: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Immediate reaction</Label>
              <Input placeholder="None observed" value={form.immediate_reaction ?? ""} onChange={(e) => setForm({ ...form, immediate_reaction: e.target.value })} />
            </div>
            <div>
              <Label>Comments</Label>
              <Textarea rows={2} value={form.comments ?? ""} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
            </div>
            <div className="text-xs text-muted-foreground">Vaccinator: {profile?.full_name ?? "—"}</div>
            <Button onClick={() => record.mutate()} disabled={record.isPending}>
              {record.isPending ? "Saving…" : "Record vaccination"}
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-medium">Due per national schedule</h2>
            {!patientId ? (
              <p className="text-sm text-muted-foreground">Select a patient to see automatically calculated due vaccines.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {dueFor(patientId).length === 0 && <li className="text-muted-foreground">Up to date.</li>}
                {dueFor(patientId).map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded border px-3 py-2">
                    <span>
                      {vaccineById(r.vaccine_id)?.name} · dose {r.dose_number}
                      <span className="ml-2 text-xs text-muted-foreground">{r.label}</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, vaccine_id: r.vaccine_id, dose_number: String(r.dose_number) })}>
                      Select
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="pt-3 text-sm font-medium">Recent doses for this patient</h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {patientHistory.slice(0, 8).map((i) => (
                <li key={i.id}>{new Date(i.administered_at).toLocaleDateString("en-GB")} · {i.vaccine_name} d{i.dose_number}</li>
              ))}
              {patientHistory.length === 0 && <li>No history.</li>}
            </ul>
          </div>
        </div>
      )}

      {tab === "stock" && (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Vaccine</th>
                <th className="px-4 py-2 font-medium">Batch</th>
                <th className="px-4 py-2 font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">Expiry</th>
                <th className="px-4 py-2 font-medium">Storage</th>
                <th className="px-4 py-2 font-medium">Temp</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(stock.data ?? []).map((s) => {
                const expSoon = expiringSoon.some((e) => e.id === s.id);
                const low = s.quantity <= s.reorder_level;
                const cold = !s.cold_chain_ok || (s.storage_temp_c !== null && (s.storage_temp_c < 2 || s.storage_temp_c > 8));
                return (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2">{vaccineById(s.vaccine_id)?.name ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{s.batch_number}</td>
                    <td className="px-4 py-2">{s.quantity}</td>
                    <td className="px-4 py-2">{s.expiry_date ?? "—"}</td>
                    <td className="px-4 py-2">{s.storage_location ?? "—"}</td>
                    <td className="px-4 py-2">{s.storage_temp_c ?? "—"}°C</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1 text-xs">
                        {low && <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-700">low stock</span>}
                        {cold && <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-rose-700">cold chain</span>}
                        {expSoon && <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-rose-700">expiring</span>}
                        {!low && !cold && !expSoon && <span className="text-muted-foreground">OK</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(stock.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No vaccine stock recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "aefi" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-medium">Report an adverse event (AEFI)</h2>
            <div>
              <Label>Patient *</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger><SelectValue placeholder="Choose patient" /></SelectTrigger>
                <SelectContent>
                  {(patients.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={aefiForm.severity ?? "mild"} onValueChange={(v) => setAefiForm({ ...aefiForm, severity: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mild">Mild</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="severe">Severe</SelectItem>
                  <SelectItem value="serious">Serious (AESI)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea rows={3} value={aefiForm.description ?? ""} onChange={(e) => setAefiForm({ ...aefiForm, description: e.target.value })} />
            </div>
            <div>
              <Label>Outcome</Label>
              <Input value={aefiForm.outcome ?? ""} onChange={(e) => setAefiForm({ ...aefiForm, outcome: e.target.value })} />
            </div>
            <Button onClick={() => reportAefi.mutate()} disabled={reportAefi.isPending}>
              {reportAefi.isPending ? "Saving…" : "Report AEFI"}
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="border-b px-4 py-2 text-sm font-medium">Reported adverse events</div>
            <ul className="divide-y">
              {(aefi.data ?? []).map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{patientName(a.patient_id)}</span>
                    <span className="text-xs capitalize text-muted-foreground">{a.severity}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">{a.description}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.onset_at).toLocaleString("en-GB")}{a.outcome ? ` · ${a.outcome}` : ""}</div>
                </li>
              ))}
              {(aefi.data ?? []).length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No AEFI reports.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function coverage(patients: PatientOpt[], dueFor: (id: string) => unknown[]) {
  if (patients.length === 0) return 0;
  const upToDate = patients.filter((p) => dueFor(p.id).length === 0).length;
  return Math.round((upToDate / patients.length) * 100);
}

function Stat({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; tone: "amber"|"sky"|"emerald"|"rose"|"violet";
}) {
  const tones: Record<string,string> = {
    amber: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    sky: "bg-sky-500/10 text-sky-700 border-sky-500/30",
    emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    rose: "bg-rose-500/10 text-rose-700 border-rose-500/30",
    violet: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-2xl font-semibold"><Icon className="h-5 w-5" />{value}</div>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
    </div>
  );
}
