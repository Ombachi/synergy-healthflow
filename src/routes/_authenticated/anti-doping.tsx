import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, FilePlus, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportWadaReportPDF, type WadaTrend } from "@/lib/wada-report-pdf";

export const Route = createFileRoute("/_authenticated/anti-doping")({
  component: AntiDopingPage,
});

interface Athlete { id: string; full_name: string; sport?: string | null; date_of_birth?: string | null }
interface Test { id: string; athlete_id: string; test_type: string; in_competition: boolean; tested_at: string; wada_code: string | null; collecting_authority: string | null; result: string; substances_detected: string | null; notes: string | null }
interface TUE { id: string; athlete_id: string; substance: string; diagnosis: string | null; status: string; decision_reference: string | null; valid_from: string | null; valid_to: string | null; created_at: string }
interface Biomarker { athlete_id: string; marker: string; value: number; units: string | null; measured_at: string; flag: string | null }
interface Baseline { athlete_id: string; marker: string; personal_low: number | null; personal_high: number | null; mean_value: number | null; status: string }

function AntiDopingPage() {
  const { hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canWrite = hasAnyRole(["admin","doctor","physio","lab_tech"]);

  const athletes = useQuery({
    queryKey: ["ad-athletes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("athletes").select("id, full_name, sport, date_of_birth").order("full_name");
      if (error) throw error; return (data as Athlete[]) ?? [];
    },
  });

  // WADA report export
  const [reportAthlete, setReportAthlete] = useState<string>("");
  const exportReport = async () => {
    if (!reportAthlete) { toast.error("Pick an athlete"); return; }
    const a = (athletes.data ?? []).find((x) => x.id === reportAthlete);
    if (!a) return;
    const [tt, uu, bm, bl] = await Promise.all([
      supabase.from("doping_tests" as never).select("*").eq("athlete_id", reportAthlete).order("tested_at", { ascending: false }),
      supabase.from("tue_requests" as never).select("*").eq("athlete_id", reportAthlete).order("created_at", { ascending: false }),
      supabase.from("abp_biomarkers" as never).select("athlete_id,marker,value,units,measured_at,flag").eq("athlete_id", reportAthlete).order("measured_at"),
      supabase.from("abp_baselines" as never).select("athlete_id,marker,personal_low,personal_high,mean_value,status").eq("athlete_id", reportAthlete),
    ]);
    if (tt.error || uu.error || bm.error || bl.error) { toast.error("Failed to gather data"); return; }
    const markers = Array.from(new Set(((bm.data ?? []) as unknown as Biomarker[]).map((b) => b.marker)));
    const trends: WadaTrend[] = markers.map((m) => {
      const pts = ((bm.data ?? []) as unknown as Biomarker[])
        .filter((b) => b.marker === m)
        .map((b) => ({ measured_at: b.measured_at, value: Number(b.value), flag: b.flag }));
      const base = ((bl.data ?? []) as unknown as Baseline[]).find((x) => x.marker === m && x.status === "approved");
      return {
        marker: m,
        units: pts[0]?.flag !== undefined ? (((bm.data ?? []) as unknown as Biomarker[]).find((b) => b.marker === m)?.units ?? null) : null,
        points: pts,
        baseline: base ? { personal_low: base.personal_low, personal_high: base.personal_high, mean: base.mean_value } : null,
      };
    });
    exportWadaReportPDF({
      athlete_name: a.full_name,
      athlete_sport: a.sport ?? null,
      dob: a.date_of_birth ?? null,
      passport_id: a.id.slice(0, 8).toUpperCase(),
      tests: ((tt.data ?? []) as unknown as Test[]),
      tues: ((uu.data ?? []) as unknown as TUE[]),
      trends,
      passport_url: `${window.location.origin}/sports-medicine`,
    });
    toast.success("WADA report generated");
  };

  const tests = useQuery({
    queryKey: ["doping-tests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doping_tests" as never).select("*").order("tested_at", { ascending: false }).limit(200);
      if (error) throw error; return (data as unknown as Test[]) ?? [];
    },
  });

  const tues = useQuery({
    queryKey: ["tues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tue_requests" as never).select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error; return (data as unknown as TUE[]) ?? [];
    },
  });

  // New test
  const [t, setT] = useState({ athlete_id: "", test_type: "urine", in_competition: false, wada_code: "", collecting_authority: "", result: "pending", substances_detected: "", notes: "" });
  const saveTest = useMutation({
    mutationFn: async () => {
      if (!t.athlete_id) throw new Error("Select athlete");
      const { error } = await supabase.from("doping_tests" as never).insert({ ...t, wada_code: t.wada_code || null, collecting_authority: t.collecting_authority || null, substances_detected: t.substances_detected || null, notes: t.notes || null } as never);
      if (error) throw error;
    },
    onSuccess: () => { setT({ ...t, wada_code: "", substances_detected: "", notes: "" }); qc.invalidateQueries({ queryKey: ["doping-tests"] }); toast.success("Test recorded"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // New TUE
  const [u, setU] = useState({ athlete_id: "", substance: "", diagnosis: "", justification: "", valid_from: "", valid_to: "" });
  const saveTUE = useMutation({
    mutationFn: async () => {
      if (!u.athlete_id || !u.substance) throw new Error("Athlete and substance required");
      const { error } = await supabase.from("tue_requests" as never).insert({
        athlete_id: u.athlete_id, substance: u.substance, diagnosis: u.diagnosis || null, justification: u.justification || null,
        valid_from: u.valid_from || null, valid_to: u.valid_to || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { setU({ athlete_id: "", substance: "", diagnosis: "", justification: "", valid_from: "", valid_to: "" }); qc.invalidateQueries({ queryKey: ["tues"] }); toast.success("TUE submitted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, status, ref }: { id: string; status: string; ref: string }) => {
      const { error } = await supabase.from("tue_requests" as never).update({ status, decision_reference: ref || null, decided_at: new Date().toISOString() } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tues"] }); toast.success("Decision recorded"); },
  });

  const aMap = Object.fromEntries((athletes.data ?? []).map((a) => [a.id, a.full_name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Shield className="h-6 w-6 text-primary" /> Anti-Doping</h1>
          <p className="text-sm text-muted-foreground">WADA-compliant testing register, Therapeutic Use Exemptions and longitudinal monitoring.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">WADA report</Label>
            <select className="h-9 w-56 rounded border bg-background px-2 text-sm"
              value={reportAthlete} onChange={(e) => setReportAthlete(e.target.value)}>
              <option value="">— Select athlete —</option>
              {athletes.data?.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <Button variant="outline" onClick={exportReport} disabled={!reportAthlete}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="tests" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tests">Testing history</TabsTrigger>
          <TabsTrigger value="tue">TUE register</TabsTrigger>
        </TabsList>

        <TabsContent value="tests" className="space-y-4">
          {canWrite && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><FilePlus className="h-4 w-4" /> New test</div>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-4">
                  <Label className="text-xs">Athlete</Label>
                  <select className="h-9 w-full rounded border bg-background px-2 text-sm" value={t.athlete_id} onChange={(e) => setT({ ...t, athlete_id: e.target.value })}>
                    <option value="">—</option>
                    {athletes.data?.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><Label className="text-xs">Type</Label>
                  <select className="h-9 w-full rounded border bg-background px-2 text-sm" value={t.test_type} onChange={(e) => setT({ ...t, test_type: e.target.value })}>
                    <option value="urine">Urine</option><option value="blood">Blood</option><option value="dried_blood_spot">DBS</option>
                  </select>
                </div>
                <div className="col-span-2"><Label className="text-xs">WADA code</Label><Input value={t.wada_code} onChange={(e) => setT({ ...t, wada_code: e.target.value })} /></div>
                <div className="col-span-2"><Label className="text-xs">Authority</Label><Input value={t.collecting_authority} onChange={(e) => setT({ ...t, collecting_authority: e.target.value })} /></div>
                <div className="col-span-2 flex items-end">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t.in_competition} onChange={(e) => setT({ ...t, in_competition: e.target.checked })} /> In-competition</label>
                </div>
                <div className="col-span-3"><Label className="text-xs">Result</Label>
                  <select className="h-9 w-full rounded border bg-background px-2 text-sm" value={t.result} onChange={(e) => setT({ ...t, result: e.target.value })}>
                    <option value="pending">Pending</option><option value="negative">Negative</option>
                    <option value="atypical">Atypical</option><option value="adverse">Adverse</option><option value="positive">Positive</option>
                  </select>
                </div>
                <div className="col-span-9"><Label className="text-xs">Substances detected</Label><Input value={t.substances_detected} onChange={(e) => setT({ ...t, substances_detected: e.target.value })} placeholder="e.g. Stanozolol, EPO" /></div>
                <div className="col-span-12"><Label className="text-xs">Notes</Label><Textarea rows={2} value={t.notes} onChange={(e) => setT({ ...t, notes: e.target.value })} /></div>
              </div>
              <div className="mt-3 flex justify-end"><Button onClick={() => saveTest.mutate()} disabled={saveTest.isPending}>Save test</Button></div>
            </div>
          )}

          <div className="rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs"><tr>
                <th className="p-2 text-left">Date</th><th className="text-left">Athlete</th><th>Type</th><th>IC</th><th>Result</th><th className="text-left">Substances</th><th className="text-left">WADA</th>
              </tr></thead>
              <tbody>
                {tests.data?.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">{new Date(row.tested_at).toLocaleDateString()}</td>
                    <td>{aMap[row.athlete_id] ?? row.athlete_id.slice(0,6)}</td>
                    <td className="text-center">{row.test_type}</td>
                    <td className="text-center">{row.in_competition ? "✓" : ""}</td>
                    <td className={`text-center font-medium ${["adverse","positive"].includes(row.result) ? "text-rose-600" : row.result === "atypical" ? "text-amber-600" : ""}`}>{row.result}</td>
                    <td>{row.substances_detected ?? "—"}</td>
                    <td>{row.wada_code ?? "—"}</td>
                  </tr>
                ))}
                {(tests.data ?? []).length === 0 && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">No tests recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="tue" className="space-y-4">
          {canWrite && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3 text-sm font-medium">Request Therapeutic Use Exemption</div>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-4"><Label className="text-xs">Athlete</Label>
                  <select className="h-9 w-full rounded border bg-background px-2 text-sm" value={u.athlete_id} onChange={(e) => setU({ ...u, athlete_id: e.target.value })}>
                    <option value="">—</option>
                    {athletes.data?.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </select>
                </div>
                <div className="col-span-4"><Label className="text-xs">Substance</Label><Input value={u.substance} onChange={(e) => setU({ ...u, substance: e.target.value })} /></div>
                <div className="col-span-4"><Label className="text-xs">Diagnosis</Label><Input value={u.diagnosis} onChange={(e) => setU({ ...u, diagnosis: e.target.value })} /></div>
                <div className="col-span-3"><Label className="text-xs">Valid from</Label><Input type="date" value={u.valid_from} onChange={(e) => setU({ ...u, valid_from: e.target.value })} /></div>
                <div className="col-span-3"><Label className="text-xs">Valid to</Label><Input type="date" value={u.valid_to} onChange={(e) => setU({ ...u, valid_to: e.target.value })} /></div>
                <div className="col-span-12"><Label className="text-xs">Justification</Label><Textarea rows={2} value={u.justification} onChange={(e) => setU({ ...u, justification: e.target.value })} /></div>
              </div>
              <div className="mt-3 flex justify-end"><Button onClick={() => saveTUE.mutate()} disabled={saveTUE.isPending}>Submit TUE</Button></div>
            </div>
          )}

          <div className="rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs"><tr>
                <th className="p-2 text-left">Submitted</th><th className="text-left">Athlete</th><th className="text-left">Substance</th><th className="text-left">Diagnosis</th><th>Valid</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {tues.data?.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td>{aMap[row.athlete_id] ?? row.athlete_id.slice(0,6)}</td>
                    <td>{row.substance}</td>
                    <td>{row.diagnosis ?? "—"}</td>
                    <td className="text-center text-xs">{row.valid_from ?? "—"} → {row.valid_to ?? "—"}</td>
                    <td className={`text-center font-medium ${row.status === "approved" ? "text-emerald-600" : row.status === "denied" ? "text-rose-600" : "text-amber-600"}`}>{row.status}</td>
                    <td className="p-2 text-right">
                      {canWrite && row.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: row.id, status: "approved", ref: prompt("Decision reference") ?? "" })}>Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: row.id, status: "denied", ref: "" })}>Deny</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {(tues.data ?? []).length === 0 && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">No TUE requests.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
