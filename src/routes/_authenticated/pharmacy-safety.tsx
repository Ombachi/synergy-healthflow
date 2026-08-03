import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarX, ClipboardCheck, ShieldAlert, Pill, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { useSafetyLibrary, screenRegimen } from "@/lib/rx-safety";
import { RxSafetyAlerts } from "@/components/rx-safety-alerts";

export const Route = createFileRoute("/_authenticated/pharmacy-safety")({
  head: () => ({
    meta: [
      { title: "Pharmacy safety & stock control — Litu Vault" },
      { name: "description", content: "Drug interaction checker, expiry dashboard, counselling records and controlled-drug reconciliation." },
      { property: "og:title", content: "Pharmacy safety & stock control — Litu Vault" },
      { property: "og:description", content: "Drug interaction checker, expiry dashboard, counselling records and controlled-drug reconciliation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate path="/pharmacy-safety"><PharmacySafety /></RoleGate>,
});

const dmy = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB") : "—");
const money = (c: number | null) => `KES ${((c ?? 0) / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

const COUNSELLING_POINTS = [
  "Name and purpose of the medicine",
  "How much to take and when",
  "How long to continue the course",
  "How to take it (with/without food)",
  "Common side effects to expect",
  "Serious side effects — when to return",
  "What to do about a missed dose",
  "Storage instructions",
  "Interactions with other medicines/alcohol",
  "Complete the full antibiotic course",
];

// ---------------------------------------------------------------------------
function InteractionChecker() {
  const safety = useSafetyLibrary();
  const [query, setQuery] = useState("");
  const [regimen, setRegimen] = useState<string[]>([]);

  const drugs = useQuery({
    queryKey: ["drug-catalog-names"],
    queryFn: async () => {
      const { data } = await supabase.from("drug_catalog" as never)
        .select("id, drug_name").eq("active", true).order("drug_name").limit(2000);
      return ((data as unknown as { id: string; drug_name: string }[]) ?? []);
    },
  });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return (drugs.data ?? []).filter((d) => d.drug_name.toLowerCase().includes(q)).slice(0, 8);
  }, [drugs.data, query]);

  const warnings = useMemo(
    () => screenRegimen(regimen, safety.data?.interactions ?? []),
    [regimen, safety.data],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <Label>Add a medicine to the regimen</Label>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type at least 2 letters…" />
        </div>
        {matches.length > 0 && (
          <div className="divide-y rounded border">
            {matches.map((m) => (
              <button key={m.id} className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => { setRegimen(Array.from(new Set([...regimen, m.drug_name]))); setQuery(""); }}>
                {m.drug_name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {regimen.map((r) => (
            <span key={r} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
              {r}
              <button onClick={() => setRegimen(regimen.filter((x) => x !== r))}><X className="h-3 w-3" /></button>
            </span>
          ))}
          {regimen.length === 0 && <span className="text-xs text-muted-foreground">No medicines added yet.</span>}
        </div>
        {regimen.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setRegimen([])}>Clear regimen</Button>
        )}
      </div>
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <div className="text-sm font-medium">Screening result</div>
        {regimen.length < 2
          ? <div className="text-xs text-muted-foreground">Add at least two medicines to screen for interactions.</div>
          : <RxSafetyAlerts warnings={warnings} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
interface Batch {
  id: string; batch_no: string | null; expiry_date: string | null;
  qty_on_hand: number; cost_cents: number | null; status: string | null;
  inventory_items: { name: string; sku: string | null; category: string | null } | null;
}

function ExpiryDashboard() {
  const [horizon, setHorizon] = useState(90);
  const batches = useQuery({
    queryKey: ["expiry-batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_batches" as never)
        .select("id, batch_no, expiry_date, qty_on_hand, cost_cents, status, inventory_items(name, sku, category)")
        .not("expiry_date", "is", null).order("expiry_date").limit(1000);
      if (error) throw error;
      return (data as unknown as Batch[]) ?? [];
    },
  });

  const rows = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (batches.data ?? [])
      .map((b) => {
        const exp = b.expiry_date ? new Date(b.expiry_date) : null;
        const days = exp ? Math.round((exp.getTime() - today.getTime()) / 86400000) : 9999;
        return { ...b, days };
      })
      .filter((b) => Number(b.qty_on_hand) > 0 && b.days <= horizon)
      .sort((a, b) => a.days - b.days);
  }, [batches.data, horizon]);

  const expired = rows.filter((r) => r.days < 0);
  const critical = rows.filter((r) => r.days >= 0 && r.days <= 30);
  const soon = rows.filter((r) => r.days > 30);
  const atRiskValue = rows.reduce((s, r) => s + Number(r.qty_on_hand) * (r.cost_cents ?? 0), 0);

  const stat = (label: string, value: string, tone: string) => (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {stat("Expired", String(expired.length), "border-destructive/40 bg-destructive/10 text-destructive")}
        {stat("Expiring ≤30 days", String(critical.length), "border-amber-500/40 bg-amber-500/10 text-amber-700")}
        {stat(`Expiring ≤${horizon} days`, String(soon.length), "bg-card")}
        {stat("Stock value at risk", money(atRiskValue), "bg-card")}
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs">Horizon</Label>
        {[30, 60, 90, 180, 365].map((h) => (
          <button key={h} onClick={() => setHorizon(h)}
            className={`rounded-full px-2.5 py-0.5 text-xs ${horizon === h ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {h}d
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Item</th><th className="p-2">Batch</th><th className="p-2">Expiry</th>
              <th className="p-2">Days</th><th className="p-2">Qty</th><th className="p-2">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-muted-foreground">Nothing expiring within this horizon.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={r.days < 0 ? "bg-destructive/5" : r.days <= 30 ? "bg-amber-500/5" : ""}>
                <td className="p-2">
                  <div className="font-medium">{r.inventory_items?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.inventory_items?.category ?? ""}</div>
                </td>
                <td className="p-2">{r.batch_no ?? "—"}</td>
                <td className="p-2">{dmy(r.expiry_date)}</td>
                <td className="p-2 font-medium">{r.days < 0 ? `${Math.abs(r.days)}d ago` : `${r.days}d`}</td>
                <td className="p-2">{Number(r.qty_on_hand)}</td>
                <td className="p-2">{money(Number(r.qty_on_hand) * (r.cost_cents ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
interface CounsellingRow {
  id: string; medication: string; points: string[]; advice: string | null;
  understood: boolean; interpreter_used: boolean; counselled_at: string; patient_id: string | null;
}

function CounsellingRecords() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [patientId, setPatientId] = useState("");
  const [medication, setMedication] = useState("");
  const [points, setPoints] = useState<string[]>([]);
  const [advice, setAdvice] = useState("");
  const [understood, setUnderstood] = useState(true);
  const [interpreter, setInterpreter] = useState(false);

  const patients = useQuery({
    queryKey: ["counsel-patients"],
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never)
        .select("id, full_name, medical_record_number").is("deleted_at", null).order("full_name").limit(500);
      return ((data as unknown as { id: string; full_name: string; medical_record_number: string | null }[]) ?? []);
    },
  });

  const records = useQuery({
    queryKey: ["counselling"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dispense_counselling" as never)
        .select("*").order("counselled_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data as unknown as CounsellingRow[]) ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!medication.trim()) throw new Error("Medication is required");
      const { error } = await supabase.from("dispense_counselling" as never).insert({
        patient_id: patientId || null,
        medication: medication.trim(),
        points,
        advice: advice || null,
        understood,
        interpreter_used: interpreter,
        pharmacist_id: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Counselling recorded");
      setMedication(""); setPoints([]); setAdvice(""); setUnderstood(true); setInterpreter(false);
      qc.invalidateQueries({ queryKey: ["counselling"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patientName = (id: string | null) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <Label>Patient</Label>
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)}
            className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm">
            <option value="">— select patient —</option>
            {patients.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name} {p.medical_record_number ? `(${p.medical_record_number})` : ""}</option>)}
          </select>
        </div>
        <div><Label>Medication dispensed</Label><Input value={medication} onChange={(e) => setMedication(e.target.value)} placeholder="e.g. Amoxicillin 500mg capsules" /></div>
        <div>
          <Label>Counselling points covered</Label>
          <div className="mt-1 space-y-1">
            {COUNSELLING_POINTS.map((p) => (
              <label key={p} className="flex items-start gap-2 text-xs">
                <Checkbox checked={points.includes(p)}
                  onCheckedChange={(v) => setPoints(v ? [...points, p] : points.filter((x) => x !== p))} />
                <span>{p}</span>
              </label>
            ))}
          </div>
        </div>
        <div><Label>Additional advice</Label><Textarea rows={3} value={advice} onChange={(e) => setAdvice(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(!!v)} /> Patient teach-back confirmed understanding
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={interpreter} onCheckedChange={(v) => setInterpreter(!!v)} /> Interpreter used
        </label>
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
          <ClipboardCheck className="h-4 w-4" /> Record counselling
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-2">Date</th><th className="p-2">Patient</th><th className="p-2">Medication</th><th className="p-2">Points</th><th className="p-2">Teach-back</th></tr>
          </thead>
          <tbody className="divide-y">
            {(records.data ?? []).length === 0 && <tr><td colSpan={5} className="p-4 text-muted-foreground">No counselling records yet.</td></tr>}
            {(records.data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="p-2">{dmy(r.counselled_at)}</td>
                <td className="p-2">{patientName(r.patient_id)}</td>
                <td className="p-2">{r.medication}</td>
                <td className="p-2 text-xs text-muted-foreground">{(r.points ?? []).length} covered{r.interpreter_used ? " · interpreter" : ""}</td>
                <td className="p-2">{r.understood ? <span className="text-green-700">✓ confirmed</span> : <span className="text-amber-700">not confirmed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
interface ReconRow {
  drug_name: string; schedule: string | null; opening: number; received: number;
  dispensed: number; closing: number; register_balance: number; variance: number;
}

function CDReconciliation() {
  const first = new Date(); first.setDate(1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const recon = useQuery({
    queryKey: ["cd-recon", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("controlled_drug_reconciliation" as never, { _from: from, _to: to } as never);
      if (error) throw error;
      return (data as unknown as ReconRow[]) ?? [];
    },
  });

  function exportCsv() {
    const rows = recon.data ?? [];
    const head = ["Drug", "Schedule", "Opening", "Received", "Dispensed", "Expected closing", "Register balance", "Variance"];
    const csv = [head.join(","), ...rows.map((r) => [
      `"${r.drug_name}"`, r.schedule ?? "", r.opening, r.received, r.dispensed, r.closing, r.register_balance, r.variance,
    ].join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `controlled-drug-reconciliation-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const discrepancies = (recon.data ?? []).filter((r) => Math.abs(Number(r.variance)) > 0.001);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
        {discrepancies.length > 0 && (
          <span className="ml-auto rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {discrepancies.length} discrepanc{discrepancies.length === 1 ? "y" : "ies"} needing investigation
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Drug</th><th className="p-2">Schedule</th><th className="p-2">Opening</th>
              <th className="p-2">Received</th><th className="p-2">Dispensed</th><th className="p-2">Expected closing</th>
              <th className="p-2">Register</th><th className="p-2">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {recon.isLoading && <tr><td colSpan={8} className="p-4 text-muted-foreground">Loading…</td></tr>}
            {!recon.isLoading && (recon.data ?? []).length === 0 &&
              <tr><td colSpan={8} className="p-4 text-muted-foreground">No controlled-drug movements in this period.</td></tr>}
            {(recon.data ?? []).map((r) => (
              <tr key={r.drug_name} className={Math.abs(Number(r.variance)) > 0.001 ? "bg-destructive/5" : ""}>
                <td className="p-2 font-medium">{r.drug_name}</td>
                <td className="p-2">{r.schedule ?? "—"}</td>
                <td className="p-2">{Number(r.opening)}</td>
                <td className="p-2">{Number(r.received)}</td>
                <td className="p-2">{Number(r.dispensed)}</td>
                <td className="p-2">{Number(r.closing)}</td>
                <td className="p-2">{Number(r.register_balance)}</td>
                <td className={`p-2 font-semibold ${Math.abs(Number(r.variance)) > 0.001 ? "text-destructive" : "text-green-700"}`}>
                  {Number(r.variance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Expected closing = opening balance + received − dispensed. Any non-zero variance against the register balance must be
        investigated and witnessed before the register is signed off.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PharmacySafety() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Pill className="h-6 w-6 text-primary" /> Pharmacy safety & stock control
        </h1>
        <p className="text-sm text-muted-foreground">
          Interaction screening, expiry surveillance, counselling documentation and statutory controlled-drug reconciliation.
        </p>
      </div>

      <Tabs defaultValue="interactions">
        <TabsList className="flex-wrap">
          <TabsTrigger value="interactions"><ShieldAlert className="mr-1 h-4 w-4" /> Interaction checker</TabsTrigger>
          <TabsTrigger value="expiry"><CalendarX className="mr-1 h-4 w-4" /> Expiry dashboard</TabsTrigger>
          <TabsTrigger value="counselling"><ClipboardCheck className="mr-1 h-4 w-4" /> Counselling records</TabsTrigger>
          <TabsTrigger value="cd">Controlled-drug reconciliation</TabsTrigger>
        </TabsList>
        <TabsContent value="interactions" className="mt-4"><InteractionChecker /></TabsContent>
        <TabsContent value="expiry" className="mt-4"><ExpiryDashboard /></TabsContent>
        <TabsContent value="counselling" className="mt-4"><CounsellingRecords /></TabsContent>
        <TabsContent value="cd" className="mt-4"><CDReconciliation /></TabsContent>
      </Tabs>
    </div>
  );
}
