import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, HeartPulse, Pill, Stethoscope, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RANGES, REQUIRED_KEYS, validateVitals, type VitalKey, type VitalWarning } from "@/lib/vitals-ranges";

export const Route = createFileRoute("/_authenticated/visits/$visitId")({
  component: VisitDetail,
});

interface Visit {
  id: string; patient_id: string; status: string; reason: string | null;
  chief_complaint: string | null; triage_level: string | null; notes: string | null;
  opened_at: string; closed_at: string | null;
}
interface Patient {
  id: string; full_name: string; medical_record_number: string | null;
  date_of_birth: string | null; blood_type: string | null; allergies: string | null;
  chronic_conditions: string | null; emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}
interface Vital {
  id: string; visit_id: string; captured_at: string;
  systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null;
  respiratory_rate: number | null; temperature_c: number | null; oxygen_saturation: number | null;
  weight_kg: number | null; height_cm: number | null; pain_level: number | null;
  glucose_mg_dl: number | null; notes: string | null;
}
interface Diagnosis { id: string; visit_id: string; diagnosis: string; icd_code: string | null; notes: string | null; is_primary: boolean }
interface Rx { id: string; visit_id: string; medication: string; dose: string | null; frequency: string | null; duration: string | null; instructions: string | null }
interface Discharge { id: string; visit_id: string; summary: string; treatment_plan: string | null; follow_up: string | null; finalized: boolean }

function VisitDetail() {
  const { visitId } = Route.useParams();
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canCapture = hasAnyRole(["nurse", "doctor", "admin"]);
  const canEditVisit = hasAnyRole(["doctor", "nurse", "admin"]);
  const canClose = hasAnyRole(["doctor", "admin"]);

  const visit = useQuery({
    queryKey: ["visit", visitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never).select("*").eq("id", visitId).maybeSingle();
      if (error) throw error;
      return data as unknown as Visit | null;
    },
  });

  const patient = useQuery({
    queryKey: ["patient", visit.data?.patient_id],
    enabled: !!visit.data?.patient_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("id, full_name, medical_record_number, date_of_birth, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone")
        .eq("id", visit.data!.patient_id).maybeSingle();
      if (error) throw error;
      return data as unknown as Patient | null;
    },
  });

  const vitals = useQuery({
    queryKey: ["vitals", visitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("vitals" as never).select("*").eq("visit_id", visitId).order("captured_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Vital[]) ?? [];
    },
  });

  const diagnoses = useQuery({
    queryKey: ["diagnoses", visitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("visit_diagnoses" as never).select("*").eq("visit_id", visitId).order("created_at");
      if (error) throw error;
      return (data as unknown as Diagnosis[]) ?? [];
    },
  });

  const prescriptions = useQuery({
    queryKey: ["prescriptions", visitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("prescriptions" as never).select("*").eq("visit_id", visitId).order("created_at");
      if (error) throw error;
      return (data as unknown as Rx[]) ?? [];
    },
  });

  const discharge = useQuery({
    queryKey: ["discharge", visitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("discharge_summaries" as never).select("*").eq("visit_id", visitId).maybeSingle();
      if (error) throw error;
      return data as unknown as Discharge | null;
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

  const vitalValues = useMemo(() => {
    const obj: Partial<Record<VitalKey, number | null>> = {};
    (Object.keys(RANGES) as VitalKey[]).forEach((k) => { obj[k] = num(form[k]); });
    return obj;
  }, [form]);

  const warnings = useMemo(() => validateVitals(vitalValues), [vitalValues]);
  const missing = warnings.filter((w) => w.severity === "missing");
  const outOfRange = warnings.filter((w) => w.severity !== "missing");

  const [confirmOpen, setConfirmOpen] = useState(false);

  const persistVitals = useMutation({
    mutationFn: async () => {
      if (!visit.data) throw new Error("Visit not loaded");
      const payload = {
        visit_id: visit.data.id, patient_id: visit.data.patient_id, captured_by: user!.id,
        ...Object.fromEntries((Object.keys(RANGES) as VitalKey[]).map((k) => [k, num(form[k])])),
        notes: form.notes || null,
      };
      const { error } = await supabase.from("vitals" as never).insert(payload as never);
      if (error) throw error;
      if (visit.data.status === "open") {
        await supabase.from("visits" as never).update({ status: "in_progress" } as never).eq("id", visit.data.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vitals", visitId] });
      qc.invalidateQueries({ queryKey: ["visit", visitId] });
      setForm({});
      setConfirmOpen(false);
      toast.success("Vitals recorded");
    },
    onError: (e: Error) => { setConfirmOpen(false); toast.error(e.message); },
  });

  function handleSaveVitals() {
    if (missing.length > 0) {
      toast.error(`Missing required vitals: ${missing.map((m) => RANGES[m.key].label).join(", ")}`);
      return;
    }
    if (outOfRange.length > 0) { setConfirmOpen(true); return; }
    persistVitals.mutate();
  }

  // ===== Diagnosis & Rx local forms =====
  const [diagForm, setDiagForm] = useState<{ diagnosis: string; icd_code: string; is_primary: boolean }>({ diagnosis: "", icd_code: "", is_primary: false });
  const addDiagnosis = useMutation({
    mutationFn: async () => {
      if (!diagForm.diagnosis.trim()) throw new Error("Diagnosis required");
      const { error } = await supabase.from("visit_diagnoses" as never).insert({
        visit_id: visitId, diagnosis: diagForm.diagnosis.trim(), icd_code: diagForm.icd_code || null,
        is_primary: diagForm.is_primary, created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { setDiagForm({ diagnosis: "", icd_code: "", is_primary: false }); qc.invalidateQueries({ queryKey: ["diagnoses", visitId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeDiagnosis = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("visit_diagnoses" as never).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["diagnoses", visitId] }),
  });

  const [rxForm, setRxForm] = useState<{ medication: string; dose: string; frequency: string; duration: string; instructions: string }>({ medication: "", dose: "", frequency: "", duration: "", instructions: "" });
  const addRx = useMutation({
    mutationFn: async () => {
      if (!rxForm.medication.trim()) throw new Error("Medication required");
      const { error } = await supabase.from("prescriptions" as never).insert({
        visit_id: visitId, medication: rxForm.medication.trim(), dose: rxForm.dose || null,
        frequency: rxForm.frequency || null, duration: rxForm.duration || null,
        instructions: rxForm.instructions || null, created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { setRxForm({ medication: "", dose: "", frequency: "", duration: "", instructions: "" }); qc.invalidateQueries({ queryKey: ["prescriptions", visitId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeRx = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("prescriptions" as never).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions", visitId] }),
  });

  // ===== Discharge =====
  const [ds, setDs] = useState<{ summary: string; treatment_plan: string; follow_up: string }>({ summary: "", treatment_plan: "", follow_up: "" });
  const dischargeLoaded = discharge.data;
  useEffect(() => {
    if (dischargeLoaded) {
      setDs({ summary: dischargeLoaded.summary ?? "", treatment_plan: dischargeLoaded.treatment_plan ?? "", follow_up: dischargeLoaded.follow_up ?? "" });
    }
  }, [dischargeLoaded]);

  const saveDischarge = useMutation({
    mutationFn: async (finalize: boolean) => {
      if (finalize && !ds.summary.trim()) throw new Error("Discharge summary is required to complete the visit");
      if (finalize && diagnoses.data?.length === 0) throw new Error("Add at least one diagnosis before completing the visit");
      const payload: Record<string, unknown> = {
        visit_id: visitId, summary: ds.summary, treatment_plan: ds.treatment_plan || null,
        follow_up: ds.follow_up || null, finalized: finalize,
      };
      if (finalize) { payload.finalized_at = new Date().toISOString(); payload.finalized_by = user!.id; }
      if (!discharge.data) payload.created_by = user!.id;
      const { error } = await supabase
        .from("discharge_summaries" as never)
        .upsert(payload as never, { onConflict: "visit_id" } as never);
      if (error) throw error;
      if (finalize) {
        const { error: vErr } = await supabase.from("visits" as never).update({
          status: "completed", closed_at: new Date().toISOString(),
        } as never).eq("id", visitId);
        if (vErr) throw vErr;
      }
    },
    onSuccess: (_d, finalize) => {
      qc.invalidateQueries({ queryKey: ["discharge", visitId] });
      qc.invalidateQueries({ queryKey: ["visit", visitId] });
      qc.invalidateQueries({ queryKey: ["visits"] });
      toast.success(finalize ? "Visit completed" : "Discharge saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Clinical notes
  const saveNotes = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase.from("visits" as never).update({ notes } as never).eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visit", visitId] }); toast.success("Notes saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (visit.isLoading) return <div className="text-muted-foreground">Loading visit...</div>;
  if (!visit.data) return <div className="text-muted-foreground">Visit not found.</div>;
  const v = visit.data;
  const p = patient.data;
  const finalized = v.status === "completed" || v.status === "closed" || discharge.data?.finalized;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/visits"><ArrowLeft className="h-4 w-4" /> All visits</Link>
          </Button>
          <h1 className="mt-1 text-2xl font-semibold">Visit · {p?.full_name ?? "…"}</h1>
          <p className="text-sm text-muted-foreground">
            Opened {new Date(v.opened_at).toLocaleString()} · Status: <span className="capitalize">{v.status.replace("_", " ")}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Summary */}
          <div className="rounded-lg border bg-card p-5">
            <h2 className="font-medium">Visit summary</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Reason</dt><dd>{v.reason ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Triage</dt><dd className="capitalize">{v.triage_level ?? "routine"}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Chief complaint</dt><dd>{v.chief_complaint ?? "—"}</dd></div>
            </dl>
            {canEditVisit && !finalized && (
              <NotesEditor initial={v.notes ?? ""} onSave={(t) => saveNotes.mutate(t)} disabled={saveNotes.isPending} />
            )}
          </div>

          {/* Vitals capture */}
          {canCapture && !finalized && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="flex items-center gap-2 font-medium"><HeartPulse className="h-4 w-4 text-primary" /> Capture vitals</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Required: BP, heart rate, temperature, SpO₂. Values outside normal range require confirmation.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(Object.keys(RANGES) as VitalKey[]).map((k) => (
                  <VitalField key={k} k={k} form={form} setField={setField} warnings={warnings} />
                ))}
              </div>
              <div className="mt-3"><Label>Notes</Label>
                <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} />
              </div>
              {outOfRange.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                  <div className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Out-of-range values</div>
                  <ul className="list-disc pl-5">{outOfRange.map((w) => <li key={w.key}>{w.message}</li>)}</ul>
                </div>
              )}
              <div className="mt-3 flex justify-end">
                <Button onClick={handleSaveVitals} disabled={persistVitals.isPending}>
                  {persistVitals.isPending ? "Saving..." : "Record vitals"}
                </Button>
              </div>
            </div>
          )}

          {/* Diagnoses */}
          {(canClose || diagnoses.data?.length) && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="flex items-center gap-2 font-medium"><Stethoscope className="h-4 w-4 text-primary" /> Diagnoses</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {diagnoses.data?.length === 0 && <li className="text-muted-foreground">None recorded.</li>}
                {diagnoses.data?.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded border p-2">
                    <div>
                      <div className="font-medium">{d.diagnosis} {d.is_primary && <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">primary</span>}</div>
                      {d.icd_code && <div className="text-xs text-muted-foreground">ICD: {d.icd_code}</div>}
                    </div>
                    {canClose && !finalized && (
                      <Button size="icon" variant="ghost" onClick={() => removeDiagnosis.mutate(d.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </li>
                ))}
              </ul>
              {canClose && !finalized && (
                <div className="mt-3 grid grid-cols-12 gap-2">
                  <Input className="col-span-6" placeholder="Diagnosis" value={diagForm.diagnosis} onChange={(e) => setDiagForm({ ...diagForm, diagnosis: e.target.value })} />
                  <Input className="col-span-3" placeholder="ICD code" value={diagForm.icd_code} onChange={(e) => setDiagForm({ ...diagForm, icd_code: e.target.value })} />
                  <label className="col-span-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={diagForm.is_primary} onChange={(e) => setDiagForm({ ...diagForm, is_primary: e.target.checked })} /> Primary</label>
                  <Button className="col-span-1" size="sm" onClick={() => addDiagnosis.mutate()}>Add</Button>
                </div>
              )}
            </div>
          )}

          {/* Prescriptions */}
          {(canClose || prescriptions.data?.length) && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="flex items-center gap-2 font-medium"><Pill className="h-4 w-4 text-primary" /> Prescriptions</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {prescriptions.data?.length === 0 && <li className="text-muted-foreground">None.</li>}
                {prescriptions.data?.map((r) => (
                  <li key={r.id} className="flex items-start justify-between rounded border p-2">
                    <div>
                      <div className="font-medium">{r.medication}</div>
                      <div className="text-xs text-muted-foreground">{[r.dose, r.frequency, r.duration].filter(Boolean).join(" · ") || "—"}</div>
                      {r.instructions && <div className="mt-1 text-xs">{r.instructions}</div>}
                    </div>
                    {canClose && !finalized && (
                      <Button size="icon" variant="ghost" onClick={() => removeRx.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </li>
                ))}
              </ul>
              {canClose && !finalized && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Input placeholder="Medication" value={rxForm.medication} onChange={(e) => setRxForm({ ...rxForm, medication: e.target.value })} />
                  <Input placeholder="Dose (e.g. 500mg)" value={rxForm.dose} onChange={(e) => setRxForm({ ...rxForm, dose: e.target.value })} />
                  <Input placeholder="Frequency (e.g. 2x/day)" value={rxForm.frequency} onChange={(e) => setRxForm({ ...rxForm, frequency: e.target.value })} />
                  <Input placeholder="Duration (e.g. 7 days)" value={rxForm.duration} onChange={(e) => setRxForm({ ...rxForm, duration: e.target.value })} />
                  <Textarea className="col-span-2" rows={2} placeholder="Instructions" value={rxForm.instructions} onChange={(e) => setRxForm({ ...rxForm, instructions: e.target.value })} />
                  <Button className="col-span-2" onClick={() => addRx.mutate()} disabled={addRx.isPending}>Add prescription</Button>
                </div>
              )}
            </div>
          )}

          {/* Discharge */}
          {canClose && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-primary" /> Discharge & complete</h2>
              <p className="mt-1 text-xs text-muted-foreground">Capture discharge summary, treatment plan, and follow-up before completing the visit.</p>
              <div className="mt-3 space-y-3">
                <div><Label>Discharge summary *</Label><Textarea rows={4} value={ds.summary} onChange={(e) => setDs({ ...ds, summary: e.target.value })} disabled={finalized} /></div>
                <div><Label>Treatment plan</Label><Textarea rows={3} value={ds.treatment_plan} onChange={(e) => setDs({ ...ds, treatment_plan: e.target.value })} disabled={finalized} /></div>
                <div><Label>Follow-up</Label><Textarea rows={2} value={ds.follow_up} onChange={(e) => setDs({ ...ds, follow_up: e.target.value })} disabled={finalized} /></div>
              </div>
              {!finalized && (
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => saveDischarge.mutate(false)} disabled={saveDischarge.isPending}>Save draft</Button>
                  <Button onClick={() => saveDischarge.mutate(true)} disabled={saveDischarge.isPending}>Complete visit</Button>
                </div>
              )}
              {finalized && <p className="mt-3 text-xs text-muted-foreground">Visit completed. Records are read-only.</p>}
            </div>
          )}

          {/* Vitals history */}
          <div className="rounded-lg border bg-card p-5">
            <h2 className="font-medium">Vitals history</h2>
            {vitals.data?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No vitals captured yet.</p>}
            <div className="mt-3 space-y-2">
              {vitals.data?.map((vt) => (
                <div key={vt.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="mb-2 text-xs text-muted-foreground">{new Date(vt.captured_at).toLocaleString()}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {vt.systolic_bp != null && vt.diastolic_bp != null && <span>BP: <strong>{vt.systolic_bp}/{vt.diastolic_bp}</strong></span>}
                    {vt.heart_rate != null && <span>HR: <strong>{vt.heart_rate}</strong> bpm</span>}
                    {vt.temperature_c != null && <span>Temp: <strong>{vt.temperature_c}°C</strong></span>}
                    {vt.oxygen_saturation != null && <span>SpO₂: <strong>{vt.oxygen_saturation}%</strong></span>}
                  </div>
                  {vt.notes && <div className="mt-2 text-muted-foreground">{vt.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Patient sidebar */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-5">
            <h2 className="font-medium">Patient</h2>
            {p ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div><dt className="text-muted-foreground">Name</dt><dd>{p.full_name}</dd></div>
                {p.date_of_birth && <div><dt className="text-muted-foreground">DOB</dt><dd>{p.date_of_birth}</dd></div>}
                {p.blood_type && <div><dt className="text-muted-foreground">Blood type</dt><dd>{p.blood_type}</dd></div>}
                {p.allergies && <div><dt className="text-muted-foreground">Allergies</dt><dd className="text-amber-700 dark:text-amber-300">{p.allergies}</dd></div>}
                {p.chronic_conditions && <div><dt className="text-muted-foreground">Conditions</dt><dd>{p.chronic_conditions}</dd></div>}
                {p.emergency_contact_name && (
                  <div><dt className="text-muted-foreground">Emergency contact</dt>
                    <dd>{p.emergency_contact_name}{p.emergency_contact_phone ? ` · ${p.emergency_contact_phone}` : ""}</dd></div>
                )}
              </dl>
            ) : <p className="mt-2 text-sm text-muted-foreground">Loading patient...</p>}
          </div>
        </div>
      </div>

      {/* Confirm dialog for out-of-range */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Confirm out-of-range vitals</DialogTitle></DialogHeader>
          <ul className="space-y-1 text-sm">
            {outOfRange.map((w) => (
              <li key={w.key} className={w.severity === "critical" ? "text-destructive" : ""}>• {w.message}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Please double-check the readings before saving.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Re-check</Button>
            <Button onClick={() => persistVitals.mutate()} disabled={persistVitals.isPending}>Confirm & save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VitalField({ k, form, setField, warnings }: { k: VitalKey; form: Record<string, string>; setField: (k: string, v: string) => void; warnings: VitalWarning[] }) {
  const r = RANGES[k];
  const w = warnings.find((x) => x.key === k);
  const tone = w?.severity === "critical" ? "border-destructive" : w?.severity === "out_of_range" ? "border-amber-500" : "";
  return (
    <div>
      <Label className="text-xs">{r.label} ({r.unit}){REQUIRED_KEYS.includes(k) && " *"}</Label>
      <Input type="number" step="0.1" value={form[k] ?? ""} onChange={(e) => setField(k, e.target.value)} className={tone} />
    </div>
  );
}

function NotesEditor({ initial, onSave, disabled }: { initial: string; onSave: (t: string) => void; disabled: boolean }) {
  const [text, setText] = useState(initial);
  return (
    <div className="mt-4 space-y-2">
      <Label>Clinical notes</Label>
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={() => onSave(text)} disabled={disabled}>Save notes</Button></div>
    </div>
  );
}

// hydrate discharge form once when query loads
function useMemoSetDischarge(d: Discharge | null | undefined, setDs: (s: { summary: string; treatment_plan: string; follow_up: string }) => void) {
  const [hydrated, setHydrated] = useState(false);
  if (d && !hydrated) {
    setHydrated(true);
    setDs({ summary: d.summary ?? "", treatment_plan: d.treatment_plan ?? "", follow_up: d.follow_up ?? "" });
  }
}
