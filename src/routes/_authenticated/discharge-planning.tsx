import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, CheckCircle2, Circle } from "lucide-react";
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

function DischargePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admissions = useActiveAdmissions();
  const [selected, setSelected] = useState("");
  const [expected, setExpected] = useState("");
  const [summary, setSummary] = useState({ diagnosis: "", course: "", medications: "", follow_up: "" });

  const pIds = (admissions.data ?? []).map((a) => a.patient_id);
  const invoices = useQuery({
    queryKey: ["disc-invoices", pIds.join(",")], enabled: pIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("invoices" as never).select("*").in("patient_id", pIds as never);
      return (data as unknown as Invoice[]) ?? [];
    },
  });

  const setExpectedDate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("admissions" as never).update({ expected_discharge_date: expected || null } as never).eq("id", selected);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["haims-active-admissions"] }); },
  });

  const discharge = useMutation({
    mutationFn: async () => {
      const adm = admissions.data?.find((a) => a.id === selected);
      if (!adm) throw new Error("No admission");
      // Guard: outstanding invoices
      const outstanding = (invoices.data ?? []).filter((i) => i.patient_id === adm.patient_id && !["paid", "void"].includes(i.status));
      if (outstanding.length > 0) throw new Error(`${outstanding.length} invoice(s) not cleared. Complete billing first.`);
      // Record discharge summary
      const { error: sErr } = await supabase.from("discharge_summaries" as never).insert({
        visit_id: null, patient_id: adm.patient_id,
        diagnosis: summary.diagnosis, hospital_course: summary.course,
        discharge_medications: summary.medications, follow_up: summary.follow_up,
        discharged_by: user?.id, discharged_at: new Date().toISOString(),
      } as never);
      if (sErr) throw sErr;
      // Discharge admission (trigger sync_bed_status will free the bed)
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

  const sel = admissions.data?.find((a) => a.id === selected);
  const outstanding = sel ? (invoices.data ?? []).filter((i) => i.patient_id === sel.patient_id && !["paid", "void"].includes(i.status)) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><LogOut className="h-6 w-6" /> Discharge planning</h1>
        <p className="text-sm text-muted-foreground">Set expected discharge dates, ensure billing/pharmacy clearance, complete final discharge and release the bed.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Active inpatients</CardTitle></CardHeader>
          <CardContent className="space-y-1 max-h-[520px] overflow-auto text-sm">
            {(admissions.data ?? []).map((a) => (
              <button key={a.id} type="button"
                onClick={() => setSelected(a.id)}
                className={`block w-full rounded border p-2 text-left ${selected === a.id ? "bg-primary/10" : ""}`}>
                <div className="font-medium">{a.patient_name}</div>
                <div className="text-xs text-muted-foreground">{a.ward_name} {a.bed_code} · admitted {new Date(a.admitted_at).toLocaleDateString()}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {sel && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{sel.patient_name}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label>Expected discharge</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
                    <Button variant="outline" onClick={() => setExpectedDate.mutate()}>Save</Button>
                  </div>
                </div>
              </div>

              <div>
                <div className="font-medium mb-1">Clearance checklist</div>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2">
                    {outstanding.length === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-amber-500" />}
                    Billing: {outstanding.length === 0 ? "cleared" : `${outstanding.length} outstanding`}
                  </li>
                  <li className="flex items-center gap-2"><Circle className="h-4 w-4 text-muted-foreground" /> Pharmacy clearance (manual verification)</li>
                  <li className="flex items-center gap-2"><Circle className="h-4 w-4 text-muted-foreground" /> Take-home medications dispensed</li>
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
                <div className="font-medium mb-2">Discharge summary</div>
                <div className="grid gap-2">
                  <Input placeholder="Diagnosis" value={summary.diagnosis} onChange={(e) => setSummary((s) => ({ ...s, diagnosis: e.target.value }))} />
                  <Textarea placeholder="Hospital course" value={summary.course} onChange={(e) => setSummary((s) => ({ ...s, course: e.target.value }))} />
                  <Textarea placeholder="Discharge medications" value={summary.medications} onChange={(e) => setSummary((s) => ({ ...s, medications: e.target.value }))} />
                  <Textarea placeholder="Follow-up" value={summary.follow_up} onChange={(e) => setSummary((s) => ({ ...s, follow_up: e.target.value }))} />
                </div>
              </div>

              <Button className="w-full" disabled={!summary.diagnosis || discharge.isPending} onClick={() => discharge.mutate()}>
                <LogOut className="mr-2 h-4 w-4" />Complete discharge & release bed
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
