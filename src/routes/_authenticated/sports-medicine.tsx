import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Beaker, AlertTriangle, TrendingUp, Plus, Upload, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";

export const Route = createFileRoute("/_authenticated/sports-medicine")({
  component: SportsMedicinePage,
});

interface Athlete { id: string; full_name: string; sport: string | null }
interface Sample { id: string; athlete_id: string; sample_type: string; collected_at: string; in_competition: boolean; lab_reference: string | null }
interface Biomarker { id: string; sample_id: string; athlete_id: string; marker: string; value: number; units: string | null; reference_low: number | null; reference_high: number | null; flag: string | null; measured_at: string }
interface Alert { id: string; athlete_id: string; severity: string; marker: string | null; message: string; resolved: boolean; created_at: string }
interface Phys { id: string; athlete_id: string; measured_at: string; vo2_max: number | null; lactate_threshold: number | null; hrv_rmssd: number | null; resting_hr: number | null; body_fat_pct: number | null; wellness_score: number | null; recovery_score: number | null; weight_kg: number | null; grip_strength_kg: number | null; vertical_jump_cm: number | null }
interface Baseline { id: string; athlete_id: string; marker: string; units: string | null; n_samples: number; mean_value: number | null; sd_value: number | null; personal_low: number | null; personal_high: number | null; population_low: number | null; population_high: number | null; status: string; approved_by: string | null; approved_at: string | null; notes: string | null }

const HEMA_MARKERS = [
  { key: "HGB", label: "Hemoglobin (g/dL)", low: 13, high: 18 },
  { key: "HCT", label: "Hematocrit (%)", low: 38, high: 52 },
  { key: "RET%", label: "Reticulocytes (%)", low: 0.4, high: 2.5 },
  { key: "OFF-score", label: "OFF-score", low: 60, high: 130 },
  { key: "ABPS", label: "ABPS", low: 0, high: 1 },
];
const STEROID_MARKERS = [
  { key: "T/E", label: "Testosterone/Epitestosterone", low: 0.1, high: 4 },
  { key: "A/T", label: "Androsterone/Testosterone", low: 20, high: 80 },
  { key: "Etio/T", label: "Etiocholanolone/Testosterone", low: 15, high: 80 },
  { key: "5aAdiol/5bAdiol", label: "5α/5β-Androstanediol", low: 0.2, high: 2.5 },
];
const ALL_MARKERS = [...HEMA_MARKERS, ...STEROID_MARKERS];

// Lab panel templates → ABP marker mapping (key = panel marker name in CSV/lab)
const PANEL_TEMPLATES: Record<string, { sample_type: "hematological" | "steroidal" | "endocrine"; markers: { in: string; out: string; units?: string }[] }> = {
  CBC: { sample_type: "hematological", markers: [
    { in: "HGB", out: "HGB", units: "g/dL" },
    { in: "Hemoglobin", out: "HGB", units: "g/dL" },
    { in: "HCT", out: "HCT", units: "%" },
    { in: "Hematocrit", out: "HCT", units: "%" },
    { in: "RET", out: "RET%", units: "%" },
    { in: "Reticulocytes", out: "RET%", units: "%" },
  ]},
  UECS: { sample_type: "endocrine", markers: [
    { in: "Urea", out: "Urea", units: "mmol/L" },
    { in: "Creatinine", out: "Creatinine", units: "umol/L" },
    { in: "Sodium", out: "Na", units: "mmol/L" },
    { in: "Potassium", out: "K", units: "mmol/L" },
  ]},
  LFT: { sample_type: "endocrine", markers: [
    { in: "ALT", out: "ALT", units: "U/L" },
    { in: "AST", out: "AST", units: "U/L" },
    { in: "ALP", out: "ALP", units: "U/L" },
    { in: "Bilirubin", out: "Bilirubin", units: "umol/L" },
  ]},
  Hormonal: { sample_type: "steroidal", markers: [
    { in: "Testosterone", out: "T", units: "ng/dL" },
    { in: "Epitestosterone", out: "E", units: "ng/dL" },
    { in: "T/E", out: "T/E" },
    { in: "LH", out: "LH", units: "IU/L" },
    { in: "FSH", out: "FSH", units: "IU/L" },
  ]},
  Urinalysis: { sample_type: "steroidal", markers: [
    { in: "SG", out: "SG" },
    { in: "pH", out: "pH" },
    { in: "Protein", out: "Protein" },
  ]},
  Nutritional: { sample_type: "endocrine", markers: [
    { in: "Ferritin", out: "Ferritin", units: "ng/mL" },
    { in: "VitD", out: "VitD", units: "ng/mL" },
    { in: "B12", out: "B12", units: "pg/mL" },
    { in: "Iron", out: "Iron", units: "ug/dL" },
  ]},
};

function SportsMedicinePage() {
  const { hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canWrite = hasAnyRole(["admin", "doctor", "physio", "lab_tech"]);
  const canBaseline = hasAnyRole(["admin", "doctor", "physio", "lab_tech"]);
  const [athleteId, setAthleteId] = useState<string>("");

  const athletes = useQuery({
    queryKey: ["sm-athletes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("athletes").select("id, full_name, sport").order("full_name");
      if (error) throw error;
      return (data as Athlete[]) ?? [];
    },
  });

  const samples = useQuery({
    queryKey: ["abp-samples", athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abp_samples" as never).select("*").eq("athlete_id", athleteId).order("collected_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Sample[]) ?? [];
    },
  });

  const biomarkers = useQuery({
    queryKey: ["abp-biomarkers", athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abp_biomarkers" as never).select("*").eq("athlete_id", athleteId).order("measured_at");
      if (error) throw error;
      return (data as unknown as Biomarker[]) ?? [];
    },
  });

  const alerts = useQuery({
    queryKey: ["abp-alerts", athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abp_alerts" as never).select("*").eq("athlete_id", athleteId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Alert[]) ?? [];
    },
  });

  const phys = useQuery({
    queryKey: ["sm-phys", athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sports_physiology" as never).select("*").eq("athlete_id", athleteId).order("measured_at");
      if (error) throw error;
      return (data as unknown as Phys[]) ?? [];
    },
  });

  const baselines = useQuery({
    queryKey: ["abp-baselines", athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abp_baselines" as never).select("*").eq("athlete_id", athleteId);
      if (error) throw error;
      return (data as unknown as Baseline[]) ?? [];
    },
  });

  // ----- New sample -----
  const [sampleType, setSampleType] = useState<"hematological" | "steroidal" | "endocrine">("hematological");
  const [inComp, setInComp] = useState(false);
  const [labRef, setLabRef] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const currentMarkers = sampleType === "hematological" ? HEMA_MARKERS : sampleType === "steroidal" ? STEROID_MARKERS : [];

  const createSample = useMutation({
    mutationFn: async () => {
      if (!athleteId) throw new Error("Select athlete");
      const { data: s, error: e1 } = await supabase.from("abp_samples" as never).insert({
        athlete_id: athleteId, sample_type: sampleType, in_competition: inComp, lab_reference: labRef || null,
      } as never).select("id").single();
      if (e1) throw e1;
      const sid = (s as { id: string }).id;
      const rows = currentMarkers
        .filter((m) => values[m.key] && values[m.key].trim() !== "")
        .map((m) => ({
          sample_id: sid, athlete_id: athleteId, marker: m.key,
          value: Number(values[m.key]), units: "", reference_low: m.low, reference_high: m.high,
        }));
      if (rows.length) {
        const { error: e2 } = await supabase.from("abp_biomarkers" as never).insert(rows as never);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      setValues({}); setLabRef("");
      qc.invalidateQueries({ queryKey: ["abp-samples", athleteId] });
      qc.invalidateQueries({ queryKey: ["abp-biomarkers", athleteId] });
      qc.invalidateQueries({ queryKey: ["abp-alerts", athleteId] });
      toast.success("Sample recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ----- Physiology -----
  const [physForm, setPhysForm] = useState<Partial<Phys>>({});
  const savePhys = useMutation({
    mutationFn: async () => {
      if (!athleteId) throw new Error("Select athlete");
      const { error } = await supabase.from("sports_physiology" as never).insert({ ...physForm, athlete_id: athleteId } as never);
      if (error) throw error;
    },
    onSuccess: () => { setPhysForm({}); qc.invalidateQueries({ queryKey: ["sm-phys", athleteId] }); toast.success("Physiology recorded"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ----- Baselines -----
  const recompute = useMutation({
    mutationFn: async ({ marker, n }: { marker: string; n: number }) => {
      const { error } = await supabase.rpc("recompute_abp_baseline" as never, { _athlete: athleteId, _marker: marker, _n: n } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["abp-baselines", athleteId] }); toast.success("Baseline recomputed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveBaseline = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("abp_baselines" as never).update({ status: "approved", approved_at: new Date().toISOString() } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["abp-baselines", athleteId] }); toast.success("Baseline approved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetBaseline = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Reset this baseline? It will be marked reset and re-drafted on next recompute.")) return;
      const { error } = await supabase.from("abp_baselines" as never).update({ status: "reset" } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["abp-baselines", athleteId] }); toast.success("Baseline reset"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ----- Lab import (CSV/paste) -----
  const [importPanel, setImportPanel] = useState<keyof typeof PANEL_TEMPLATES>("CBC");
  const [importText, setImportText] = useState("");
  const [importInComp, setImportInComp] = useState(false);
  const [importLabRef, setImportLabRef] = useState("");

  const importLab = useMutation({
    mutationFn: async () => {
      if (!athleteId) throw new Error("Select athlete");
      const tpl = PANEL_TEMPLATES[importPanel];
      const lines = importText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const parsed: { marker: string; value: number; units?: string }[] = [];
      for (const line of lines) {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        if (parts.length < 2) continue;
        const [name, valueRaw, unitsRaw] = parts;
        const map = tpl.markers.find((m) => m.in.toLowerCase() === name.toLowerCase());
        if (!map) continue;
        const num = Number(valueRaw.replace(/[^0-9.\-]/g, ""));
        if (Number.isNaN(num)) continue;
        parsed.push({ marker: map.out, value: num, units: unitsRaw || map.units });
      }
      if (!parsed.length) throw new Error("No mappable rows. Format: marker,value[,units] one per line.");

      const { data: s, error: e1 } = await supabase.from("abp_samples" as never).insert({
        athlete_id: athleteId, sample_type: tpl.sample_type, in_competition: importInComp,
        lab_reference: importLabRef || `${importPanel}-import`,
        notes: `Imported from ${importPanel} panel`,
      } as never).select("id").single();
      if (e1) throw e1;
      const sid = (s as { id: string }).id;
      const rows = parsed.map((p) => ({
        sample_id: sid, athlete_id: athleteId, marker: p.marker, value: p.value, units: p.units ?? "",
      }));
      const { error: e2 } = await supabase.from("abp_biomarkers" as never).insert(rows as never);
      if (e2) throw e2;
      return parsed.length;
    },
    onSuccess: (n) => {
      setImportText("");
      qc.invalidateQueries({ queryKey: ["abp-samples", athleteId] });
      qc.invalidateQueries({ queryKey: ["abp-biomarkers", athleteId] });
      qc.invalidateQueries({ queryKey: ["abp-alerts", athleteId] });
      toast.success(`Imported ${n} biomarker rows`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ----- Trend computation (client-side) -----
  const distinctMarkers = useMemo(() => {
    const s = new Set<string>();
    (biomarkers.data ?? []).forEach((b) => s.add(b.marker));
    return Array.from(s);
  }, [biomarkers.data]);

  const trendStats = (marker: string) => {
    const series = (biomarkers.data ?? []).filter((b) => b.marker === marker)
      .sort((a, b) => +new Date(a.measured_at) - +new Date(b.measured_at));
    if (series.length === 0) return null;
    const first = series[0].value, last = series[series.length - 1].value;
    const mean = series.reduce((a, b) => a + b.value, 0) / series.length;
    const r3 = series.slice(-3);
    const rolling3 = r3.reduce((a, b) => a + b.value, 0) / r3.length;
    const t0 = +new Date(series[0].measured_at) / 86400000;
    let num = 0, den = 0;
    const xMean = series.reduce((a, b) => a + (+new Date(b.measured_at) / 86400000 - t0), 0) / series.length;
    const yMean = mean;
    for (const p of series) {
      const x = +new Date(p.measured_at) / 86400000 - t0;
      num += (x - xMean) * (p.value - yMean);
      den += (x - xMean) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const pct = first === 0 ? null : ((last - first) / first) * 100;
    return { series, first, last, mean, rolling3, slope, pct, n: series.length };
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Activity className="h-6 w-6 text-primary" /> Sports Medicine & Athlete Biological Passport
        </h1>
        <p className="text-sm text-muted-foreground">Baselines, longitudinal trends, lab import, physiology and doping-suspicion alerts.</p>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <Label>Athlete</Label>
        <select className="mt-1 h-9 w-full max-w-md rounded border bg-background px-2 text-sm"
          value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
          <option value="">— Select athlete —</option>
          {athletes.data?.map((a) => (
            <option key={a.id} value={a.id}>{a.full_name}{a.sport ? ` · ${a.sport}` : ""}</option>
          ))}
        </select>
      </div>

      {!athleteId ? (
        <p className="text-sm text-muted-foreground">Pick an athlete to view their biological passport.</p>
      ) : (
        <Tabs defaultValue="passport" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="passport"><Beaker className="mr-1 h-4 w-4" /> Passport</TabsTrigger>
            <TabsTrigger value="baselines"><ShieldCheck className="mr-1 h-4 w-4" /> Baselines</TabsTrigger>
            <TabsTrigger value="trends"><TrendingUp className="mr-1 h-4 w-4" /> Trends</TabsTrigger>
            <TabsTrigger value="import"><Upload className="mr-1 h-4 w-4" /> Lab import</TabsTrigger>
            <TabsTrigger value="physiology">Physiology</TabsTrigger>
            <TabsTrigger value="alerts">
              <AlertTriangle className="mr-1 h-4 w-4" /> Alerts
              {alerts.data?.filter((a) => !a.resolved).length ? ` (${alerts.data.filter((a) => !a.resolved).length})` : ""}
            </TabsTrigger>
          </TabsList>

          {/* PASSPORT */}
          <TabsContent value="passport" className="space-y-4">
            {canWrite && (
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 text-sm font-medium">New sample</div>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-4">
                    <Label className="text-xs">Module</Label>
                    <select className="h-9 w-full rounded border bg-background px-2 text-sm"
                      value={sampleType} onChange={(e) => { setSampleType(e.target.value as never); setValues({}); }}>
                      <option value="hematological">Hematological</option>
                      <option value="steroidal">Steroidal</option>
                      <option value="endocrine">Endocrine</option>
                    </select>
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">Lab reference</Label>
                    <Input value={labRef} onChange={(e) => setLabRef(e.target.value)} placeholder="WADA-accredited lab code" />
                  </div>
                  <div className="col-span-4 flex items-end gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={inComp} onChange={(e) => setInComp(e.target.checked)} /> In-competition
                    </label>
                  </div>
                  {currentMarkers.map((m) => (
                    <div key={m.key} className="col-span-3">
                      <Label className="text-xs">{m.label}</Label>
                      <Input type="number" step="0.01" value={values[m.key] ?? ""} onChange={(e) => setValues({ ...values, [m.key]: e.target.value })} placeholder={`${m.low}–${m.high}`} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button onClick={() => createSample.mutate()} disabled={createSample.isPending}><Plus className="h-4 w-4" /> Save sample</Button>
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-card">
              <div className="border-b p-3 text-sm font-medium">Sample history</div>
              <div className="divide-y">
                {(samples.data ?? []).length === 0 && <div className="p-4 text-sm text-muted-foreground">No samples yet.</div>}
                {samples.data?.map((s) => {
                  const sb = (biomarkers.data ?? []).filter((b) => b.sample_id === s.id);
                  return (
                    <div key={s.id} className="p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{s.sample_type}</span>
                        <span className="text-xs text-muted-foreground">{new Date(s.collected_at).toLocaleString("en-GB")} {s.in_competition ? "· in-competition" : ""}{s.lab_reference ? ` · ${s.lab_reference}` : ""}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                        {sb.map((b) => (
                          <div key={b.id} className={`rounded border p-2 text-xs ${b.flag === "high" || b.flag === "low" ? "border-amber-500 bg-amber-500/10" : ""}`}>
                            <div className="font-semibold">{b.marker}</div>
                            <div>{b.value} {b.units ?? ""} <span className="text-muted-foreground">({b.reference_low ?? "—"}–{b.reference_high ?? "—"})</span></div>
                            {b.flag && <div className="mt-0.5 uppercase text-[10px]">{b.flag}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* BASELINES */}
          <TabsContent value="baselines" className="space-y-3">
            <div className="rounded-lg border bg-card p-3 text-sm">
              <div className="font-medium">Baseline policy</div>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                <li>Established from the athlete's first 3 samples per marker (per WADA ABP guidance).</li>
                <li>Personal range = mean ± 2·SD. Population range carried over from WADA reference bands.</li>
                <li>Drafts must be reviewed and <b>approved</b> by clinical staff before they trigger personalized alerts.</li>
                <li>Reset re-drafts the baseline and clears approval — used after injury, altitude, or training-block changes.</li>
              </ul>
            </div>

            {canBaseline && (
              <div className="rounded-lg border bg-card p-3">
                <div className="mb-2 text-sm font-medium">Establish / recompute baselines</div>
                <div className="flex flex-wrap gap-2">
                  {distinctMarkers.length === 0 && <span className="text-xs text-muted-foreground">No biomarkers collected yet.</span>}
                  {distinctMarkers.map((m) => (
                    <Button key={m} size="sm" variant="outline"
                      onClick={() => recompute.mutate({ marker: m, n: 3 })}
                      disabled={recompute.isPending}>
                      Recompute {m}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs">
                  <tr>
                    <th className="p-2 text-left">Marker</th>
                    <th>n</th><th>Mean</th><th>SD</th>
                    <th>Personal range</th><th>Population range</th>
                    <th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {(baselines.data ?? []).map((b) => (
                    <tr key={b.id} className="border-t text-center">
                      <td className="p-2 text-left font-medium">{b.marker}</td>
                      <td>{b.n_samples}</td>
                      <td>{b.mean_value?.toFixed?.(2) ?? "—"}</td>
                      <td>{b.sd_value?.toFixed?.(2) ?? "—"}</td>
                      <td>{b.personal_low?.toFixed?.(2) ?? "—"} – {b.personal_high?.toFixed?.(2) ?? "—"}</td>
                      <td>{b.population_low ?? "—"} – {b.population_high ?? "—"}</td>
                      <td>
                        <span className={`rounded px-2 py-0.5 text-xs ${b.status === "approved" ? "bg-emerald-100 text-emerald-800" : b.status === "reset" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{b.status}</span>
                      </td>
                      <td className="p-2 text-right">
                        {canBaseline && b.status !== "approved" && (
                          <Button size="sm" onClick={() => approveBaseline.mutate(b.id)}>Approve</Button>
                        )}
                        {canBaseline && b.status === "approved" && (
                          <Button size="sm" variant="outline" onClick={() => resetBaseline.mutate(b.id)}>Reset</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(baselines.data ?? []).length === 0 && (
                    <tr><td colSpan={8} className="p-3 text-center text-muted-foreground">No baselines yet. Collect ≥3 samples per marker, then recompute.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* TRENDS */}
          <TabsContent value="trends" className="space-y-4">
            {distinctMarkers.length === 0 && <p className="text-sm text-muted-foreground">No biomarkers collected.</p>}
            {distinctMarkers.map((m) => {
              const stats = trendStats(m);
              if (!stats) return null;
              const base = (baselines.data ?? []).find((b) => b.marker === m && b.status === "approved");
              const popRef = ALL_MARKERS.find((x) => x.key === m);
              const data = stats.series.map((p) => ({ t: new Date(p.measured_at).toLocaleDateString("en-GB"), v: Number(p.value) }));
              const lows = [popRef?.low, base?.personal_low ?? undefined].filter((x) => x != null) as number[];
              const highs = [popRef?.high, base?.personal_high ?? undefined].filter((x) => x != null) as number[];
              const yMin = Math.min(...data.map((d) => d.v), ...lows) * 0.9;
              const yMax = Math.max(...data.map((d) => d.v), ...highs) * 1.1;
              return (
                <div key={m} className="rounded-lg border bg-card p-3">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium">{m}</div>
                    <div className="text-xs text-muted-foreground">
                      n={stats.n} · last {stats.last.toFixed(2)} · mean {stats.mean.toFixed(2)} · rolling-3 {stats.rolling3.toFixed(2)}
                      {stats.pct !== null && <> · Δ {stats.pct.toFixed(1)}%</>} · slope {stats.slope.toFixed(3)}/day
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" />
                      <YAxis domain={[yMin, yMax]} />
                      <Tooltip />
                      {base?.personal_low != null && base?.personal_high != null && (
                        <ReferenceArea y1={base.personal_low} y2={base.personal_high} fill="hsl(var(--primary))" fillOpacity={0.08} />
                      )}
                      <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                  {base && (
                    <div className="mt-1 text-xs text-emerald-700">
                      Personal baseline: {base.personal_low?.toFixed(2)} – {base.personal_high?.toFixed(2)} (approved)
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>

          {/* LAB IMPORT */}
          <TabsContent value="import" className="space-y-3">
            <div className="rounded-lg border bg-card p-3 text-sm">
              <div className="font-medium">Lab panel import</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Paste rows from CBC, UECS, LFT, hormonal, urinalysis or nutritional panels. The system maps named parameters
                into ABP biomarkers and creates a new sample. Format per line: <code>parameter,value[,units]</code>.
              </p>
            </div>
            {canWrite && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-4">
                    <Label className="text-xs">Panel</Label>
                    <select className="h-9 w-full rounded border bg-background px-2 text-sm"
                      value={importPanel} onChange={(e) => setImportPanel(e.target.value as keyof typeof PANEL_TEMPLATES)}>
                      {Object.keys(PANEL_TEMPLATES).map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">Lab reference</Label>
                    <Input value={importLabRef} onChange={(e) => setImportLabRef(e.target.value)} placeholder="External lab ID" />
                  </div>
                  <div className="col-span-4 flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={importInComp} onChange={(e) => setImportInComp(e.target.checked)} /> In-competition
                    </label>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Rows ({PANEL_TEMPLATES[importPanel].markers.map((m) => m.in).join(", ")})</Label>
                  <Textarea rows={8} value={importText} onChange={(e) => setImportText(e.target.value)}
                    placeholder={`Hemoglobin,15.2,g/dL\nHematocrit,46,%\nReticulocytes,1.2,%`} />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => importLab.mutate()} disabled={importLab.isPending || !importText.trim()}>
                    <Upload className="h-4 w-4" /> Import
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* PHYSIOLOGY */}
          <TabsContent value="physiology" className="space-y-4">
            {canWrite && (
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 text-sm font-medium">Record physiology test</div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    ["vo2_max", "VO₂ max (ml/kg/min)"],
                    ["lactate_threshold", "Lactate threshold (mmol/L)"],
                    ["hrv_rmssd", "HRV RMSSD (ms)"],
                    ["resting_hr", "Resting HR (bpm)"],
                    ["grip_strength_kg", "Grip strength (kg)"],
                    ["vertical_jump_cm", "Vertical jump (cm)"],
                    ["body_fat_pct", "Body fat (%)"],
                    ["weight_kg", "Weight (kg)"],
                    ["wellness_score", "Wellness (0-100)"],
                    ["recovery_score", "Recovery (0-100)"],
                  ].map(([k, label]) => (
                    <div key={k}>
                      <Label className="text-xs">{label}</Label>
                      <Input type="number" step="0.01" value={(physForm as Record<string, unknown>)[k] as string ?? ""} onChange={(e) => setPhysForm({ ...physForm, [k]: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button onClick={() => savePhys.mutate()} disabled={savePhys.isPending}>Save measurement</Button>
                </div>
              </div>
            )}
            <div className="rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs"><tr>
                  <th className="p-2 text-left">Date</th><th>VO₂</th><th>HRV</th><th>RHR</th><th>Body fat</th><th>Wellness</th><th>Recovery</th>
                </tr></thead>
                <tbody>
                  {(phys.data ?? []).slice().reverse().map((p) => (
                    <tr key={p.id} className="border-t text-center">
                      <td className="p-2 text-left">{new Date(p.measured_at).toLocaleDateString("en-GB")}</td>
                      <td>{p.vo2_max ?? "—"}</td><td>{p.hrv_rmssd ?? "—"}</td><td>{p.resting_hr ?? "—"}</td>
                      <td>{p.body_fat_pct ?? "—"}</td><td>{p.wellness_score ?? "—"}</td><td>{p.recovery_score ?? "—"}</td>
                    </tr>
                  ))}
                  {(phys.data ?? []).length === 0 && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">No measurements yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ALERTS */}
          <TabsContent value="alerts" className="space-y-2">
            {(alerts.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No alerts.</p>}
            {alerts.data?.map((a) => (
              <div key={a.id} className={`rounded border p-3 text-sm ${a.severity === "doping_suspicion" || a.severity === "critical" ? "border-rose-500 bg-rose-500/10" : a.severity === "warning" ? "border-amber-500 bg-amber-500/10" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium uppercase text-xs">{a.severity}{a.marker ? ` · ${a.marker}` : ""}</span>
                  <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("en-GB")}</span>
                </div>
                <div className="mt-1">{a.message}</div>
                {!a.resolved && canWrite && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
                    await supabase.from("abp_alerts" as never).update({ resolved: true } as never).eq("id", a.id);
                    qc.invalidateQueries({ queryKey: ["abp-alerts", athleteId] });
                  }}>Mark resolved</Button>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
