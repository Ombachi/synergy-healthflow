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
import { WorkflowChip } from "@/components/workflow-chip";
import { useEncounterMap, encounterCounts, type EncounterFilter } from "@/hooks/use-encounter";
import { EncounterTabs } from "@/components/encounter-tabs";

export const Route = createFileRoute("/_authenticated/lab")({ component: () => <RoleGate path="/lab"><LabPortal /></RoleGate> });

interface Test { id: string; code: string; name: string; specimen: string | null; container: string | null; units: string | null; reference_range: string | null }
interface Order { id: string; visit_id: string | null; patient_id: string; test_id: string; status: string; priority: string; clinical_notes: string | null; created_at: string }
interface Patient { id: string; full_name: string }
interface Sample { id: string; order_id: string; sample_code: string | null; condition: string | null; collected_at: string | null }
interface Tmpl { id: string; test_id: string; parameter_name: string; units: string | null; reference_range: string | null; reference_low: number | null; reference_high: number | null; input_type: string; select_options: string | null; display_order: number; gender: string | null; age_group: string | null; auto_formula: string | null }
interface ValueRow { id: string; order_id: string; template_id: string | null; parameter_name: string; value_text: string | null; value_numeric: number | null; units: string | null; reference_range: string | null; abnormal_flag: string | null }

function LabPortal() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canWork = hasAnyRole(["lab_tech", "admin"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "collected" | "resulted">("pending");
  const [encFilter, setEncFilter] = useState<EncounterFilter>("outpatient");
  const [search, setSearch] = useState("");
  const encMap = useEncounterMap();

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
  const allValues = useQuery({ queryKey: ["lab-values-all"], queryFn: async () => {
    const { data, error } = await supabase.from("lab_result_values" as never).select("*");
    if (error) throw error; return (data as unknown as ValueRow[]) ?? [];
  }});

  const testName = (id: string) => tests.data?.find((t) => t.id === id)?.name ?? "—";
  const testInfo = (id: string) => tests.data?.find((t) => t.id === id);
  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";

  const encCounts = useMemo(
    () => encounterCounts(orders.data ?? [], encMap.data?.inpatientVisitIds),
    [orders.data, encMap.data?.inpatientVisitIds],
  );

  const filtered = useMemo(() => {
    const inp = encMap.data?.inpatientVisitIds;
    return (orders.data ?? []).filter((o) => {
      if (filter !== "all") {
        if (filter === "pending") {
          if (o.status !== "pending" && o.status !== "ordered") return false;
        } else if (o.status !== filter) return false;
      }
      if (encFilter !== "all") {
        const isInp = !!(o.visit_id && inp?.has(o.visit_id));
        if (encFilter === "inpatient" && !isInp) return false;
        if (encFilter === "outpatient" && isInp) return false;
      }
      if (search) {
        const t = testName(o.test_id).toLowerCase();
        const p = patientName(o.patient_id).toLowerCase();
        if (!t.includes(search.toLowerCase()) && !p.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [orders.data, filter, encFilter, search, tests.data, patients.data, encMap.data?.inpatientVisitIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = filtered.find((o) => o.id === selectedId) ?? filtered[0] ?? null;
  const selSample = selected && samples.data?.find((s) => s.order_id === selected.id);
  const selTest = selected && testInfo(selected.test_id);
  const selValues = (allValues.data ?? []).filter((v) => v.order_id === selected?.id);

  // Per-test template
  const template = useQuery({
    queryKey: ["lab-tpl", selected?.test_id],
    enabled: !!selected?.test_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_result_templates" as never)
        .select("*").eq("test_id", selected!.test_id).order("display_order");
      if (error) throw error; return (data as unknown as Tmpl[]) ?? [];
    },
  });

  // Patient of selected order (for gender/age-dependent reference ranges)
  const selPatient = useQuery({
    queryKey: ["lab-patient-full", selected?.patient_id],
    enabled: !!selected?.patient_id,
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never)
        .select("id, gender, date_of_birth").eq("id", selected!.patient_id).maybeSingle();
      return data as unknown as { id: string; gender: string | null; date_of_birth: string | null } | null;
    },
  });

  // Filter template rows to the patient's dimensions (gender + adult/child).
  // A template row with gender=null/age_group=null applies to any patient.
  const filteredTemplate = useMemo(() => {
    const rows = template.data ?? [];
    if (rows.length === 0) return rows;
    const pg = (selPatient.data?.gender ?? "").toLowerCase();
    const dob = selPatient.data?.date_of_birth;
    const ageYears = dob ? (Date.now() - new Date(dob).getTime()) / (365.25 * 86400000) : null;
    const ageGroup = ageYears == null ? null : (ageYears < 12 ? "child" : "adult");
    // Group by parameter_name — pick the best-fitting variant.
    const byName = new Map<string, Tmpl[]>();
    for (const r of rows) {
      const arr = byName.get(r.parameter_name) ?? [];
      arr.push(r); byName.set(r.parameter_name, arr);
    }
    const score = (t: Tmpl) => {
      let s = 0;
      if (t.gender && t.gender.toLowerCase() === pg) s += 2;
      else if (t.gender) s -= 5;
      if (t.age_group && t.age_group === ageGroup) s += 2;
      else if (t.age_group) s -= 5;
      return s;
    };
    const out: Tmpl[] = [];
    for (const [, arr] of byName) {
      arr.sort((a, b) => score(b) - score(a));
      out.push(arr[0]);
    }
    return out.sort((a, b) => a.display_order - b.display_order);
  }, [template.data, selPatient.data]);


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

  // Template-driven result entry
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryValues, setEntryValues] = useState<Record<string, string>>({});
  const [entryComments, setEntryComments] = useState("");

  function openEntry() {
    if (!selected) return;
    const init: Record<string, string> = {};
    template.data?.forEach((t) => { init[t.id] = ""; });
    setEntryValues(init);
    setEntryComments("");
    setEntryOpen(true);
  }

  const submitTemplate = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const rows = (template.data ?? [])
        .filter((t) => (entryValues[t.id] ?? "").trim() !== "")
        .map((t) => {
          const raw = entryValues[t.id].trim();
          const num = t.input_type === "numeric" ? Number(raw) : null;
          return {
            order_id: selected.id,
            template_id: t.id,
            parameter_name: t.parameter_name,
            value_text: raw,
            value_numeric: Number.isFinite(num) ? num : null,
            units: t.units,
            reference_range: t.reference_range,
            performed_by: user!.id,
          };
        });
      if (rows.length === 0) throw new Error("Enter at least one parameter value");
      const { error: e1 } = await supabase.from("lab_result_values" as never).insert(rows as never);
      if (e1) throw e1;
      // also keep a one-line summary in lab_results for compatibility
      const summary = rows.map((r) => `${r.parameter_name}: ${r.value_text}${r.units ? " "+r.units : ""}`).join("; ");
      await supabase.from("lab_results" as never).insert({
        order_id: selected.id, result_value: summary, comments: entryComments || null, performed_by: user!.id,
      } as never);
      const { error: e3 } = await supabase.from("lab_orders" as never).update({ status: "resulted" } as never).eq("id", selected.id);
      if (e3) throw e3;
    },
    onSuccess: () => {
      setEntryOpen(false);
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
      qc.invalidateQueries({ queryKey: ["lab-values-all"] });
      toast.success("Results saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[360px_1fr]">
      <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="border-b p-3">
            <div className="flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-emerald-600" /> Lab queue</div>
            <div className="mt-2 relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search test or patient..." value={search} onChange={(e)=>setSearch(e.target.value)} className="h-8 pl-7 text-xs" />
            </div>
            <div className="mt-2">
              <EncounterTabs value={encFilter} onChange={setEncFilter} counts={encCounts} />
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
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a lab order.</div>
        ) : (
          <div className="flex flex-1 flex-col overflow-auto">
            <div className="flex items-center justify-between border-b bg-muted/30 p-4">
              <div>
                <div className="text-lg font-semibold">{testName(selected.test_id)}</div>
                <div className="text-xs text-muted-foreground">Patient: {patientName(selected.patient_id)} · {new Date(selected.created_at).toLocaleString("en-GB")}</div>
              </div>
              <WorkflowChip status={selected.status} />
            </div>

            <div className="space-y-4 p-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Specimen" value={selTest?.specimen ?? "—"} />
                <Detail label="Container" value={selTest?.container ?? "—"} />
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

              {/* Template-loaded parameter table */}
              <div className="rounded border">
                <div className="border-b p-2 text-xs font-medium">Parameters {template.data ? `(${template.data.length})` : ""}</div>
                {(template.data?.length ?? 0) === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">
                    No template defined for this test. Ask an administrator to set parameters at <span className="font-mono">/lab-templates</span>.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30">
                      <tr><th className="p-2 text-left">Parameter</th><th className="p-2 text-left">Result</th><th className="p-2 text-left">Units</th><th className="p-2 text-left">Reference</th><th className="p-2 text-left">Flag</th></tr>
                    </thead>
                    <tbody>
                      {filteredTemplate.map((t) => {
                        const v = selValues.find((x) => x.template_id === t.id);
                        return (
                          <tr key={t.id} className="border-t">
                            <td className="p-2 font-medium">{t.parameter_name}</td>
                            <td className="p-2">{v?.value_text ?? "—"}</td>
                            <td className="p-2">{t.units ?? "—"}</td>
                            <td className="p-2 text-muted-foreground">{t.reference_range ?? (t.reference_low != null || t.reference_high != null ? `${t.reference_low ?? ""}–${t.reference_high ?? ""}` : "—")}</td>
                            <td className="p-2">{v?.abnormal_flag && <span className={v.abnormal_flag === "normal" ? "text-emerald-600" : "text-destructive"}>{v.abnormal_flag}</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {canWork && (
                <div className="flex gap-2">
                  {!selSample && <Button onClick={() => collect.mutate(selected.id)}>Collect sample</Button>}
                  {selSample && selValues.length === 0 && (template.data?.length ?? 0) > 0 && (
                    <Button onClick={openEntry}>Enter results</Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Enter results — {selected && testName(selected.test_id)}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {filteredTemplate.map((t) => {
              const isAuto = !!t.auto_formula;
              function handleChange(val: string) {
                const next = { ...entryValues, [t.id]: val };
                // Auto-calc IFCC / eAG when HbA1c% is entered
                if (t.parameter_name === "HbA1c") {
                  const n = Number(val);
                  if (Number.isFinite(n)) {
                    for (const other of filteredTemplate) {
                      if (other.auto_formula === "ifcc_from_hba1c") {
                        next[other.id] = ((n - 2.15) * 10.929).toFixed(1);
                      } else if (other.auto_formula === "eag_from_hba1c") {
                        next[other.id] = (28.7 * n - 46.7).toFixed(0);
                      }
                    }
                  }
                }
                setEntryValues(next);
              }
              return (
                <div key={t.id} className="grid grid-cols-12 items-center gap-2">
                  <Label className="col-span-4 text-xs">
                    {t.parameter_name}{t.units ? ` (${t.units})` : ""}
                    {isAuto && <span className="ml-1 rounded bg-primary/10 px-1 text-[9px] text-primary">auto</span>}
                  </Label>
                  {t.input_type === "select" ? (
                    <select className="col-span-5 h-9 rounded border bg-background px-2 text-sm"
                      value={entryValues[t.id] ?? ""}
                      onChange={(e) => handleChange(e.target.value)}>
                      <option value="">—</option>
                      {(t.select_options ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <Input className="col-span-5" type={t.input_type === "numeric" ? "number" : "text"}
                      value={entryValues[t.id] ?? ""} readOnly={isAuto}
                      onChange={(e) => handleChange(e.target.value)} />
                  )}
                  <span className="col-span-3 text-[10px] text-muted-foreground">
                    Ref {t.reference_range ?? `${t.reference_low ?? ""}–${t.reference_high ?? ""}`}
                  </span>
                </div>
              );
            })}

            <div className="pt-2">
              <Label className="text-xs">Comments</Label>
              <Textarea rows={2} value={entryComments} onChange={(e) => setEntryComments(e.target.value)} />
            </div>
          </div>
          <DialogFooter><Button onClick={() => submitTemplate.mutate()} disabled={submitTemplate.isPending}>Save results</Button></DialogFooter>
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
