import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PatientContext } from "@/components/patient-context";
import { RoleGate } from "@/components/role-gate";
import { StockRequestForm } from "@/components/stock-request-form";
import { WorkflowChip } from "@/components/workflow-chip";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "collected" | "resulted">("pending");
  const [search, setSearch] = useState("");

  const orders = useQuery({ queryKey: ["lab-orders"], queryFn: async () => {
    const { data, error } = await supabase.from("lab_orders" as never).select("*").order("created_at", { ascending: false });
    if (error) throw error; return (data as unknown as Order[]) ?? [];
  }});
  const tests = useQuery({ queryKey: ["lab-tests"], queryFn: async () => {
    const { data, error } = await supabase.from("lab_tests_catalog" as never).select("*").order("name");
    if (error) throw error; return (data as unknown as Test[]) ?? [];
  }});
  const patients = useQuery({ queryKey: ["lab-patients"], queryFn: async () => {
    const { data, error } = await supabase.from("patients" as never).select("id, full_name").order("full_name");
    if (error) throw error; return (data as unknown as Patient[]) ?? [];
  }});
  const samples = useQuery({ queryKey: ["lab-samples-all"], queryFn: async () => {
    const { data, error } = await supabase.from("lab_samples" as never).select("*");
    if (error) throw error; return (data as unknown as Sample[]) ?? [];
  }});
  const results = useQuery({ queryKey: ["lab-results-all"], queryFn: async () => {
    const { data, error } = await supabase.from("lab_results" as never).select("*");
    if (error) throw error; return (data as unknown as Result[]) ?? [];
  }});

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
        result_value: resForm.result_value || null, units: resForm.units || null,
        reference_range: resForm.reference_range || null, abnormal_flag: resForm.abnormal_flag || null,
        comments: resForm.comments || null, performed_by: user!.id,
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
  const testInfo = (id: string) => tests.data?.find((t) => t.id === id);
  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";

  const filtered = useMemo(() => {
    return (orders.data ?? []).filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (search) {
        const t = testName(o.test_id).toLowerCase();
        const p = patientName(o.patient_id).toLowerCase();
        if (!t.includes(search.toLowerCase()) && !p.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [orders.data, filter, search, tests.data, patients.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = filtered.find((o) => o.id === selectedId) ?? filtered[0] ?? null;
  const selSample = selected && samples.data?.find((s) => s.order_id === selected.id);
  const selResult = selected && results.data?.find((r) => r.order_id === selected.id);
  const selTest = selected && testInfo(selected.test_id);

  return (
    <div className="grid h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[360px_1fr]">
      {/* LEFT PANEL: queue + filters + stock requests */}
      <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="border-b p-3">
            <div className="flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-emerald-600" /> Lab queue</div>
            <div className="mt-2 relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search test or patient..." value={search} onChange={(e)=>setSearch(e.target.value)} className="h-8 pl-7 text-xs" />
            </div>
            <div className="mt-2 flex gap-1 text-xs">
              {(["pending","collected","resulted","all"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 rounded px-2 py-1 capitalize transition ${filter===f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.length === 0 && <div className="p-4 text-xs text-muted-foreground">No orders.</div>}
            {filtered.map((o) => {
              const active = o.id === selected?.id;
              return (
                <button key={o.id} onClick={() => setSelectedId(o.id)}
                  className={`flex w-full flex-col gap-0.5 border-l-4 border-b p-3 text-left text-xs transition ${
                    active ? "bg-accent border-l-primary" : "border-l-transparent hover:bg-accent/40"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{testName(o.test_id)}</span>
                    <WorkflowChip status={o.status} />
                  </div>
                  <span className="text-muted-foreground">{patientName(o.patient_id)} · {o.priority}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="max-h-[40%] overflow-auto">
          <StockRequestForm department="lab" categoryHint="lab" />
        </div>
      </div>

      {/* RIGHT: selected order details */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a lab order.</div>
        ) : (
          <div className="flex flex-1 flex-col overflow-auto">
            <div className="flex items-center justify-between border-b bg-muted/30 p-4">
              <div>
                <div className="text-lg font-semibold">{testName(selected.test_id)}</div>
                <div className="text-xs text-muted-foreground">Patient: {patientName(selected.patient_id)} · {new Date(selected.created_at).toLocaleString()}</div>
              </div>
              <WorkflowChip status={selected.status} />
            </div>

            <div className="space-y-4 p-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Specimen" value={selTest?.specimen ?? "—"} />
                <Detail label="Container" value={selTest?.container ?? "—"} />
                <Detail label="Reference range" value={selTest?.reference_range ?? "—"} />
                <Detail label="Units" value={selTest?.units ?? "—"} />
              </div>

              {selected.clinical_notes && (
                <div className="rounded border bg-muted/30 p-3 text-xs">
                  <div className="font-medium">Clinical notes</div>
                  <div className="text-muted-foreground">{selected.clinical_notes}</div>
                </div>
              )}

              <PatientContext patientId={selected.patient_id} visitId={selected.visit_id} />

              {selSample && (
                <div className="rounded border p-3 text-xs">
                  <div className="font-medium">Sample</div>
                  <div className="text-muted-foreground">{selSample.sample_code} · {selSample.condition}</div>
                </div>
              )}
              {selResult && (
                <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
                  <div className="font-medium">Result</div>
                  <div>{selResult.result_value} {selResult.units} {selResult.abnormal_flag && <span className="text-destructive">{selResult.abnormal_flag}</span>}</div>
                  {selResult.comments && <div className="text-muted-foreground">{selResult.comments}</div>}
                </div>
              )}

              {canWork && (
                <div className="flex gap-2">
                  {!selSample && <Button onClick={() => collect.mutate(selected.id)}>Collect sample</Button>}
                  {selSample && !selResult && (
                    <Button onClick={() => { setResOpen(selected.id); setResForm({ result_value: "", units: selTest?.units ?? "", reference_range: selTest?.reference_range ?? "", abnormal_flag: "", comments: "" }); }}>
                      Enter result
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
