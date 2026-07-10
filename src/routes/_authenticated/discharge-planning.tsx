import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, CheckCircle2, Circle, Sparkles, FileText, ShieldCheck, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleGate } from "@/components/role-gate";
import { useActiveAdmissions } from "@/components/admission-picker";

export const Route = createFileRoute("/_authenticated/discharge-planning")({
  component: () => <RoleGate path="/discharge-planning"><DischargePage /></RoleGate>,
});

interface Invoice { id: string; visit_id: string | null; status: string; total_cents: number; paid_cents: number; patient_id: string }
interface WardRound { round_at: string; round_type: string | null; subjective: string | null; objective: string | null; assessment: string | null; plan: string | null }
interface CarePlan { id: string; plan_type: string; title: string; problem: string | null; status: string }
interface CarePlanGoal { care_plan_id: string; goal: string; intervention: string | null; status: string }
interface MedOrder { id: string; medication: string; dose: string | null; route: string | null; frequency: string | null; indication: string | null; status: string; stop_at: string | null }
interface MarRow { medication_order_id: string; administered_at: string; status: string; dose_given: string | null }

function DischargePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admissions = useActiveAdmissions();
  const [selected, setSelected] = useState("");
  const [expected, setExpected] = useState("");
  const [summary, setSummary] = useState({ diagnosis: "", course: "", medications: "", follow_up: "" });
  const [generating, setGenerating] = useState(false);

  const sel = admissions.data?.find((a) => a.id === selected);

  const pIds = (admissions.data ?? []).map((a) => a.patient_id);
  const invoices = useQuery({
    queryKey: ["disc-invoices", pIds.join(",")], enabled: pIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("invoices" as never).select("*").in("patient_id", pIds as never);
      return (data as unknown as Invoice[]) ?? [];
    },
  });

  const clinicalData = useQuery({
    queryKey: ["disc-clinical", selected], enabled: !!selected,
    queryFn: async () => {
      const [roundsR, plansR, medsR] = await Promise.all([
        supabase.from("ward_rounds" as never).select("*").eq("admission_id", selected).order("round_at", { ascending: true }),
        supabase.from("care_plans" as never).select("*").eq("admission_id", selected),
        supabase.from("medication_orders" as never).select("*").eq("admission_id", selected),
      ]);
      const plans = (plansR.data as unknown as CarePlan[] | null) ?? [];
      const meds = (medsR.data as unknown as MedOrder[] | null) ?? [];
      const goalsR = plans.length > 0
        ? await supabase.from("care_plan_goals" as never).select("*").in("care_plan_id", plans.map((p) => p.id) as never)
        : { data: [] };
      const marR = meds.length > 0
        ? await supabase.from("mar_administrations" as never).select("*").in("medication_order_id", meds.map((m) => m.id) as never)
        : { data: [] };
      return {
        rounds: (roundsR.data as unknown as WardRound[] | null) ?? [],
        plans,
        goals: (goalsR.data as unknown as CarePlanGoal[] | null) ?? [],
        meds,
        mar: (marR.data as unknown as MarRow[] | null) ?? [],
      };
    },
  });

  function generate() {
    if (!sel || !clinicalData.data) return;
    setGenerating(true);
    const { rounds, plans, goals, meds, mar } = clinicalData.data;

    const primary = sel.primary_diagnosis || rounds[rounds.length - 1]?.assessment || "";
    const admitDate = new Date(sel.admitted_at).toLocaleDateString();

    const courseLines: string[] = [
      `Patient admitted on ${admitDate} to ${sel.ward_name} bed ${sel.bed_code}.`,
      sel.admission_reason ? `Reason for admission: ${sel.admission_reason}.` : "",
    ].filter(Boolean);

    if (rounds.length > 0) {
      courseLines.push("", "Clinical course from ward rounds:");
      rounds.slice(-6).forEach((r) => {
        const d = new Date(r.round_at).toLocaleDateString();
        const parts = [r.assessment, r.plan].filter(Boolean).join(" — ");
        if (parts) courseLines.push(`• ${d}: ${parts}`);
      });
    }

    if (plans.length > 0) {
      const activeGoals = goals.filter((g) => plans.some((p) => p.id === g.care_plan_id));
      const met = activeGoals.filter((g) => g.status === "met" || g.status === "resolved").length;
      courseLines.push("", `Nursing care plans: ${plans.length} plan(s), ${met}/${activeGoals.length} goals resolved.`);
      plans.forEach((p) => courseLines.push(`• ${p.title}${p.problem ? ` (${p.problem})` : ""}`));
    }

    const givenIds = new Set(mar.filter((m) => m.status === "given").map((m) => m.medication_order_id));
    const activeMeds = meds.filter((m) => m.status === "active" && !m.stop_at);
    const medLines = activeMeds.map((m) => {
      const timesGiven = mar.filter((x) => x.medication_order_id === m.id && x.status === "given").length;
      return `• ${m.medication} ${m.dose ?? ""} ${m.route ?? ""} ${m.frequency ?? ""}${m.indication ? ` — for ${m.indication}` : ""} (${timesGiven} doses administered)`;
    }).join("\n");

    const reconciled = `Discharge medications (reconciled from active inpatient orders):\n${medLines || "None."}\n\nAdministered ${givenIds.size} distinct medications during admission.`;

    setSummary({
      diagnosis: primary,
      course: courseLines.join("\n"),
      medications: reconciled,
      follow_up: "Review in outpatient clinic in 2 weeks. Return earlier if worsening symptoms.",
    });
    setGenerating(false);
    toast.success("Draft generated from clinical records");
  }

  const setExpectedDate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("admissions" as never).update({ expected_discharge_date: expected || null } as never).eq("id", selected);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["haims-active-admissions"] }); },
  });

  const outstanding = sel ? (invoices.data ?? []).filter((i) => i.patient_id === sel.patient_id && !["paid", "void"].includes(i.status)) : [];

  const triggerBilling = useMutation({
    mutationFn: async () => {
      if (!sel) throw new Error("No admission");
      // Compile a discharge invoice covering the admission length of stay
      const days = Math.max(1, Math.ceil((Date.now() - new Date(sel.admitted_at).getTime()) / 86_400_000));
      const perDiem = 5000_00; // KES 5000 per day placeholder
      const total = days * perDiem;
      const { data, error } = await supabase.from("invoices" as never).insert({
        patient_id: sel.patient_id, visit_id: null,
        total_cents: total, paid_cents: 0, status: "issued",
        notes: `Inpatient discharge invoice — ${days} day(s) inpatient stay`,
        created_by: user?.id,
      } as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (id) => { toast.success(`Discharge invoice #${id.slice(0,8)} created`); qc.invalidateQueries({ queryKey: ["disc-invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerInsurance = useMutation({
    mutationFn: async () => {
      if (!sel) throw new Error("No admission");
      const { data, error } = await supabase.from("preauth_requests" as never).insert({
        patient_id: sel.patient_id,
        procedure_name: `Inpatient discharge clearance — ${sel.primary_diagnosis ?? "admission"}`,
        clinical_justification: `Inpatient admission from ${new Date(sel.admitted_at).toLocaleDateString()}. Awaiting insurer sign-off for discharge.`,
        status: "submitted",
        requested_by: user?.id,
      } as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (id) => toast.success(`Insurance clearance request #${id.slice(0,8)} submitted`),
    onError: (e: Error) => toast.error(e.message),
  });

  const discharge = useMutation({
    mutationFn: async () => {
      if (!sel) throw new Error("No admission");
      if (outstanding.length > 0) throw new Error(`${outstanding.length} invoice(s) not cleared. Complete billing first.`);
      const { error: sErr } = await supabase.from("discharge_summaries" as never).insert({
        visit_id: null, patient_id: sel.patient_id, admission_id: sel.id,
        diagnosis: summary.diagnosis, hospital_course: summary.course,
        discharge_medications: summary.medications, follow_up: summary.follow_up,
        summary: summary.course, treatment_plan: summary.medications,
        discharged_by: user?.id, discharged_at: new Date().toISOString(),
        clearance_status: "cleared",
        source_data: clinicalData.data as never,
      } as never);
      if (sErr) throw sErr;
      const { error } = await supabase.from("admissions" as never)
        .update({ status: "discharged", discharged_at: new Date().toISOString(), discharged_by: user?.id } as never)
        .eq("id", selected);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Discharged; bed released");
      setSelected(""); setSummary({ diagnosis: "", course: "", medications: "", follow_up: "" });
      qc.invalidateQueries({ queryKey: ["haims-active-admissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><LogOut className="h-6 w-6" /> Discharge planning</h1>
        <p className="text-sm text-muted-foreground">Auto-generate a discharge summary from ward rounds, care plans and MAR, then trigger billing &amp; insurance clearance.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Active inpatients</CardTitle></CardHeader>
          <CardContent className="space-y-1 max-h-[620px] overflow-auto text-sm">
            {(admissions.data ?? []).map((a) => (
              <button key={a.id} type="button"
                onClick={() => setSelected(a.id)}
                className={`block w-full rounded border p-2 text-left ${selected === a.id ? "bg-primary/10" : ""}`}>
                <div className="font-medium">{a.patient_name}</div>
                <div className="text-xs text-muted-foreground">{a.ward_name} {a.bed_code} · admitted {new Date(a.admitted_at).toLocaleDateString()}</div>
              </button>
            ))}
            {(admissions.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No active inpatients.</p>
            )}
          </CardContent>
        </Card>

        {sel && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">{sel.patient_name}</CardTitle>
              <Button size="sm" variant="secondary" onClick={generate} disabled={generating || !clinicalData.data}>
                <Sparkles className="mr-1 h-4 w-4" /> Auto-generate from clinical data
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label>Expected discharge</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
                    <Button variant="outline" onClick={() => setExpectedDate.mutate()}>Save</Button>
                  </div>
                </div>
                <div>
                  <Label>Source data available</Label>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    <Badge variant="outline">{clinicalData.data?.rounds.length ?? 0} rounds</Badge>
                    <Badge variant="outline">{clinicalData.data?.plans.length ?? 0} care plans</Badge>
                    <Badge variant="outline">{clinicalData.data?.meds.length ?? 0} meds</Badge>
                    <Badge variant="outline">{clinicalData.data?.mar.length ?? 0} MAR entries</Badge>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Clearance steps</div>
                <ul className="space-y-1.5">
                  <li className="flex items-center gap-2">
                    {outstanding.length === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-amber-500" />}
                    <span className="flex-1">Billing: {outstanding.length === 0 ? "cleared" : `${outstanding.length} outstanding`}</span>
                    <Button size="sm" variant="outline" onClick={() => triggerBilling.mutate()} disabled={triggerBilling.isPending}>
                      <Receipt className="mr-1 h-3.5 w-3.5" /> Generate invoice
                    </Button>
                  </li>
                  <li className="flex items-center gap-2">
                    <Circle className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">Insurance pre-authorisation</span>
                    <Button size="sm" variant="outline" onClick={() => triggerInsurance.mutate()} disabled={triggerInsurance.isPending}>
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Request clearance
                    </Button>
                  </li>
                  <li className="flex items-center gap-2"><Circle className="h-4 w-4 text-muted-foreground" /> Take-home medications dispensed (pharmacy)</li>
                  <li className="flex items-center gap-2"><Circle className="h-4 w-4 text-muted-foreground" /> Follow-up appointment booked</li>
                </ul>
                {outstanding.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {outstanding.map((i) => (
                      <div key={i.id} className="rounded bg-amber-50 px-2 py-1 text-xs">
                        Invoice #{i.id.slice(0, 8)} — <Badge variant="outline" className="capitalize">{i.status}</Badge> · KES {((i.total_cents - i.paid_cents) / 100).toFixed(2)} outstanding
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-3">
                <div className="font-medium mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Discharge summary</div>
                <div className="grid gap-2">
                  <Input placeholder="Diagnosis" value={summary.diagnosis} onChange={(e) => setSummary((s) => ({ ...s, diagnosis: e.target.value }))} />
                  <Textarea rows={6} placeholder="Hospital course" value={summary.course} onChange={(e) => setSummary((s) => ({ ...s, course: e.target.value }))} />
                  <Textarea rows={5} placeholder="Discharge medications" value={summary.medications} onChange={(e) => setSummary((s) => ({ ...s, medications: e.target.value }))} />
                  <Textarea rows={2} placeholder="Follow-up" value={summary.follow_up} onChange={(e) => setSummary((s) => ({ ...s, follow_up: e.target.value }))} />
                </div>
              </div>

              <Button className="w-full" disabled={!summary.diagnosis || discharge.isPending} onClick={() => discharge.mutate()}>
                <LogOut className="mr-2 h-4 w-4" />Complete discharge &amp; release bed
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
