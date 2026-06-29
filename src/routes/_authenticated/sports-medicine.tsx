import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Beaker, AlertTriangle, TrendingUp, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/sports-medicine")({
  component: SportsMedicinePage,
});

interface Athlete { id: string; full_name: string; sport: string | null }
interface Sample { id: string; athlete_id: string; sample_type: string; collected_at: string; in_competition: boolean; lab_reference: string | null }
interface Biomarker { id: string; sample_id: string; athlete_id: string; marker: string; value: number; units: string | null; reference_low: number | null; reference_high: number | null; flag: string | null; measured_at: string }
interface Alert { id: string; athlete_id: string; severity: string; marker: string | null; message: string; resolved: boolean; created_at: string }
interface Phys { id: string; athlete_id: string; measured_at: string; vo2_max: number | null; lactate_threshold: number | null; hrv_rmssd: number | null; resting_hr: number | null; body_fat_pct: number | null; wellness_score: number | null; recovery_score: number | null; weight_kg: number | null; grip_strength_kg: number | null; vertical_jump_cm: number | null }

// Standard ABP markers with WADA-style reference bands
const HEMA_MARKERS = [
  { key: "HGB", label: "Hemoglobin (g/dL)", low: 13, high: 18 },
  { key: "HCT", label: "Hematocrit (%)", low: 38, high: 52 },
  { key: "RET%", label: "Reticulocytes (%)", low: 0.4, high: 2.5 },
  { key: "OFF-score", label: "OFF-score", low: 60, high: 130 },
  { key: "ABPS", label: "ABPS (abnormal blood profile)", low: 0, high: 1 },
];
const STEROID_MARKERS = [
  { key: "T/E", label: "Testosterone/Epitestosterone", low: 0.1, high: 4 },
  { key: "A/T", label: "Androsterone/Testosterone", low: 20, high: 80 },
  { key: "Etio/T", label: "Etiocholanolone/Testosterone", low: 15, high: 80 },
  { key: "5aAdiol/5bAdiol", label: "5α/5β-Androstanediol", low: 0.2, high: 2.5 },
];

function SportsMedicinePage() {
  const { hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canWrite = hasAnyRole(["admin","doctor","physio","lab_tech","coach"]);
  const [athleteId, setAthleteId] = useState<string>("");

  const athletes = useQuery({
    queryKey: ["sm-athletes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("athletes").select("id, full_name, sport").order("full_name");
      if (error) throw error; return (data as Athlete[]) ?? [];
    },
  });

  const samples = useQuery({
    queryKey: ["abp-samples", athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abp_samples" as never).select("*").eq("athlete_id", athleteId).order("collected_at", { ascending: false });
      if (error) throw error; return (data as unknown as Sample[]) ?? [];
    },
  });

  const biomarkers = useQuery({
    queryKey: ["abp-biomarkers", athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abp_biomarkers" as never).select("*").eq("athlete_id", athleteId).order("measured_at");
      if (error) throw error; return (data as unknown as Biomarker[]) ?? [];
    },
  });

  const alerts = useQuery({
    queryKey: ["abp-alerts", athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abp_alerts" as never).select("*").eq("athlete_id", athleteId).order("created_at", { ascending: false });
      if (error) throw error; return (data as unknown as Alert[]) ?? [];
    },
  });

  const phys = useQuery({
    queryKey: ["sm-phys", athleteId],
    enabled: !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sports_physiology" as never).select("*").eq("athlete_id", athleteId).order("measured_at");
      if (error) throw error; return (data as unknown as Phys[]) ?? [];
    },
  });

  // New sample state
  const [sampleType, setSampleType] = useState<"hematological"|"steroidal"|"endocrine">("hematological");
  const [inComp, setInComp] = useState(false);
  const [labRef, setLabRef] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  const createSample = useMutation({
    mutationFn: async () => {
      if (!athleteId) throw new Error("Select athlete");
      const { data: s, error: e1 } = await supabase.from("abp_samples" as never).insert({
        athlete_id: athleteId, sample_type: sampleType, in_competition: inComp, lab_reference: labRef || null,
      } as never).select("id").single();
      if (e1) throw e1;
      const sid = (s as { id: string }).id;
      const markers = sampleType === "hematological" ? HEMA_MARKERS : sampleType === "steroidal" ? STEROID_MARKERS : [];
      const rows = markers
        .filter((m) => values[m.key] && values[m.key].trim() !== "")
        .map((m) => ({
          sample_id: sid, athlete_id: athleteId, marker: m.key,
          value: Number(values[m.key]), units: "", reference_low: m.low, reference_high: m.high,
        }));
      if (rows.length) {
        const { error: e2 } = await supabase.from("abp_biomarkers" as never).insert(rows as never);
        if (e2) throw e2;
      }
      // Generate alerts for out-of-range
      const out = rows.filter((r) => r.value < (r.reference_low ?? -Infinity) || r.value > (r.reference_high ?? Infinity));
      if (out.length) {
        await supabase.from("abp_alerts" as never).insert(out.map((r) => ({
          athlete_id: athleteId,
          severity: "warning",
          marker: r.marker,
          message: `${r.marker} = ${r.value} outside reference (${r.reference_low}–${r.reference_high})`,
        })) as never);
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

  // Physiology entry
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

  const trendFor = (marker: string) =>
    (biomarkers.data ?? []).filter((b) => b.marker === marker)
      .map((b) => ({ t: new Date(b.measured_at).toLocaleDateString(), v: Number(b.value) }));

  const currentMarkers = sampleType === "hematological" ? HEMA_MARKERS : sampleType === "steroidal" ? STEROID_MARKERS : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Activity className="h-6 w-6 text-primary" /> Sports Medicine & Athlete Biological Passport
        </h1>
        <p className="text-sm text-muted-foreground">Hematological & steroidal modules, longitudinal biomarker monitoring, physiology testing, and doping-suspicion alerts.</p>
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
          <TabsList>
            <TabsTrigger value="passport"><Beaker className="mr-1 h-4 w-4" /> Passport</TabsTrigger>
            <TabsTrigger value="trends"><TrendingUp className="mr-1 h-4 w-4" /> Trends</TabsTrigger>
            <TabsTrigger value="physiology">Physiology</TabsTrigger>
            <TabsTrigger value="alerts"><AlertTriangle className="mr-1 h-4 w-4" /> Alerts {alerts.data?.filter(a => !a.resolved).length ? `(${alerts.data.filter(a=>!a.resolved).length})` : ""}</TabsTrigger>
          </TabsList>

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
                        <span className="text-xs text-muted-foreground">{new Date(s.collected_at).toLocaleString()} {s.in_competition ? "· in-competition" : ""}{s.lab_reference ? ` · ${s.lab_reference}` : ""}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                        {sb.map((b) => (
                          <div key={b.id} className={`rounded border p-2 text-xs ${b.flag === "high" || b.flag === "low" ? "border-amber-500 bg-amber-500/10" : ""}`}>
                            <div className="font-semibold">{b.marker}</div>
                            <div>{b.value} {b.units ?? ""} <span className="text-muted-foreground">({b.reference_low}–{b.reference_high})</span></div>
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

          <TabsContent value="trends" className="space-y-4">
            {[...HEMA_MARKERS, ...STEROID_MARKERS].map((m) => {
              const data = trendFor(m.key);
              if (data.length < 2) return null;
              return (
                <div key={m.key} className="rounded-lg border bg-card p-3">
                  <div className="mb-2 text-sm font-medium">{m.label}</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" />
                      <YAxis domain={[Math.min(m.low * 0.8, ...data.map(d=>d.v)), Math.max(m.high * 1.2, ...data.map(d=>d.v))]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
            {(biomarkers.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Collect 2+ samples to see trends.</p>}
          </TabsContent>

          <TabsContent value="physiology" className="space-y-4">
            {canWrite && (
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 text-sm font-medium">Record physiology test</div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    ["vo2_max","VO₂ max (ml/kg/min)"],
                    ["lactate_threshold","Lactate threshold (mmol/L)"],
                    ["hrv_rmssd","HRV RMSSD (ms)"],
                    ["resting_hr","Resting HR (bpm)"],
                    ["grip_strength_kg","Grip strength (kg)"],
                    ["vertical_jump_cm","Vertical jump (cm)"],
                    ["body_fat_pct","Body fat (%)"],
                    ["weight_kg","Weight (kg)"],
                    ["wellness_score","Wellness (0-100)"],
                    ["recovery_score","Recovery (0-100)"],
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
                      <td className="p-2 text-left">{new Date(p.measured_at).toLocaleDateString()}</td>
                      <td>{p.vo2_max ?? "—"}</td><td>{p.hrv_rmssd ?? "—"}</td><td>{p.resting_hr ?? "—"}</td>
                      <td>{p.body_fat_pct ?? "—"}</td><td>{p.wellness_score ?? "—"}</td><td>{p.recovery_score ?? "—"}</td>
                    </tr>
                  ))}
                  {(phys.data ?? []).length === 0 && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">No measurements yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-2">
            {(alerts.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No alerts.</p>}
            {alerts.data?.map((a) => (
              <div key={a.id} className={`rounded border p-3 text-sm ${a.severity === "doping_suspicion" || a.severity === "critical" ? "border-rose-500 bg-rose-500/10" : a.severity === "warning" ? "border-amber-500 bg-amber-500/10" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium uppercase text-xs">{a.severity}{a.marker ? ` · ${a.marker}` : ""}</span>
                  <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
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
