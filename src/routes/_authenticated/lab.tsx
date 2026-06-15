import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PatientContext } from "@/components/patient-context";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/lab")({ component: () => <RoleGate path="/lab"><LabPortal /></RoleGate> });

interface Test { id: string; code: string; name: string; specimen: string | null; container: string | null; units: string | null; reference_range: string | null }
interface Order { id: string; visit_id: string | null; patient_id: string; test_id: string; status: string; priority: string; clinical_notes: string | null; created_at: string }
interface Patient { id: string; full_name: string }
interface Sample { id: string; order_id: string; sample_code: string | null; condition: string | null; collected_at: string | null }
interface Result { id: string; order_id: string; result_value: string | null; units: string | null; reference_range: string | null; abnormal_flag: string | null; performed_at: string | null; comments: string | null }

function LabPortal() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canWork = hasAnyRole(["lab_tech", "admin"]);

  const orders = useQuery({
    queryKey: ["lab-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_orders" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Order[]) ?? [];
    },
  });
  const tests = useQuery({
    queryKey: ["lab-tests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_tests_catalog" as never).select("*").order("name");
      if (error) throw error;
      return (data as unknown as Test[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["lab-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name").order("full_name");
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });
  const samples = useQuery({
    queryKey: ["lab-samples-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_samples" as never).select("*");
      if (error) throw error;
      return (data as unknown as Sample[]) ?? [];
    },
  });
  const results = useQuery({
    queryKey: ["lab-results-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_results" as never).select("*");
      if (error) throw error;
      return (data as unknown as Result[]) ?? [];
    },
  });

  const collect = useMutation({
    mutationFn: async (orderId: string) => {
      const { error: e1 } = await supabase.from("lab_samples" as never).insert({
        order_id: orderId, sample_code: `S-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
        collected_by: user!.id, condition: "good",
      } as never);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("lab_orders" as never).update({ status: "collected" } as never).eq("id", orderId);
      if (e2) throw e2;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lab-orders"] }); qc.invalidateQueries({ queryKey: ["lab-samples-all"] }); toast.success("Sample collected"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [resOpen, setResOpen] = useState<string | null>(null);
  const [resForm, setResForm] = useState({ result_value: "", units: "", reference_range: "", abnormal_flag: "", comments: "" });

  const submitResult = useMutation({
    mutationFn: async () => {
      if (!resOpen) return;
      const { error: e1 } = await supabase.from("lab_results" as never).insert({
        order_id: resOpen,
        result_value: resForm.result_value || null,
        units: resForm.units || null,
        reference_range: resForm.reference_range || null,
        abnormal_flag: resForm.abnormal_flag || null,
        comments: resForm.comments || null,
        performed_by: user!.id,
      } as never);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("lab_orders" as never).update({ status: "resulted" } as never).eq("id", resOpen);
      if (e2) throw e2;
    },
    onSuccess: () => {
      setResOpen(null); setResForm({ result_value: "", units: "", reference_range: "", abnormal_flag: "", comments: "" });
      qc.invalidateQueries({ queryKey: ["lab-orders"] }); qc.invalidateQueries({ queryKey: ["lab-results-all"] });
      toast.success("Result recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testName = (id: string) => tests.data?.find((t) => t.id === id)?.name ?? "—";
  const testSpecimen = (id: string) => tests.data?.find((t) => t.id === id);
  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><FlaskConical className="h-6 w-6 text-primary" /> Laboratory portal</h1>
          <p className="text-sm text-muted-foreground">Manage lab orders, samples, and results.</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b p-3 font-medium">Active orders</div>
        <div className="divide-y">
          {orders.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No lab orders.</div>}
          {orders.data?.map((o) => {
            const t = testSpecimen(o.test_id);
            const sample = samples.data?.find((s) => s.order_id === o.id);
            const result = results.data?.find((r) => r.order_id === o.id);
            return (
              <div key={o.id} className="p-3 text-sm">
                <div className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-3">
                    <div className="font-medium">{testName(o.test_id)}</div>
                    <div className="text-xs text-muted-foreground">Patient: {patientName(o.patient_id)}</div>
                  </div>
                  <div className="col-span-3 text-xs">
                    <div>Specimen: <span className="font-medium">{t?.specimen ?? "—"}</span></div>
                    <div>Container: <span className="font-medium">{t?.container ?? "—"}</span></div>
                  </div>
                  <div className="col-span-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${o.status === "resulted" ? "bg-green-500/10 text-green-700" : o.status === "collected" ? "bg-blue-500/10 text-blue-700" : "bg-amber-500/10 text-amber-700"}`}>{o.status}</span>
                    <div className="mt-1 text-xs text-muted-foreground capitalize">{o.priority}</div>
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    {sample && <div>Sample: {sample.sample_code}</div>}
                    {result && <div>Result: {result.result_value} {result.abnormal_flag && <span className="text-destructive">{result.abnormal_flag}</span>}</div>}
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    {canWork && !sample && <Button size="sm" variant="outline" onClick={() => collect.mutate(o.id)}>Collect</Button>}
                    {canWork && sample && !result && (
                      <Button size="sm" onClick={() => { setResOpen(o.id); setResForm({ result_value: "", units: t?.units ?? "", reference_range: t?.reference_range ?? "", abnormal_flag: "", comments: "" }); }}>Enter result</Button>
                    )}
                  </div>
                </div>
                <PatientContext patientId={o.patient_id} visitId={o.visit_id} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b p-3 font-medium">Test catalog ({tests.data?.length ?? 0})</div>
        <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3">
          {tests.data?.map((t) => (
            <div key={t.id} className="rounded border p-2 text-xs">
              <div className="font-mono text-primary">{t.code}</div>
              <div className="font-medium">{t.name}</div>
              <div className="text-muted-foreground">{t.specimen} · {t.container}</div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!resOpen} onOpenChange={(v) => !v && setResOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enter result</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Result</Label><Input value={resForm.result_value} onChange={(e) => setResForm({ ...resForm, result_value: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Units</Label><Input value={resForm.units} onChange={(e) => setResForm({ ...resForm, units: e.target.value })} /></div>
              <div><Label>Reference range</Label><Input value={resForm.reference_range} onChange={(e) => setResForm({ ...resForm, reference_range: e.target.value })} /></div>
            </div>
            <div><Label>Flag (H/L/Critical)</Label><Input value={resForm.abnormal_flag} onChange={(e) => setResForm({ ...resForm, abnormal_flag: e.target.value })} /></div>
            <div><Label>Comments</Label><Textarea rows={2} value={resForm.comments} onChange={(e) => setResForm({ ...resForm, comments: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => submitResult.mutate()} disabled={submitResult.isPending}>Save result</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
