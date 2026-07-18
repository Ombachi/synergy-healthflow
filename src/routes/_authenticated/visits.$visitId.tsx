import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Activity, BedDouble, CheckCircle2, Clipboard, Download, FileText, FlaskConical, HeartPulse, Pill, ScanLine, Stethoscope, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { exportVisitPDF } from "@/lib/visit-pdf";
import { exportSickOffPDF } from "@/lib/sick-off-pdf";
import { IcdPicker } from "@/components/icd-picker";
import { AssignVisit } from "@/components/assign-visit";
import { AdmitPatientButton } from "@/components/admit-patient";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ProcedurePickerInline } from "@/components/procedure-picker";
import { LabResultsViewer } from "@/components/lab-results-viewer";
import { ImagingViewer } from "@/components/imaging-viewer";
import { CatalogSearch } from "@/components/catalog-search";
import { DrugPickerInline } from "@/components/drug-picker";


export const Route = createFileRoute("/_authenticated/visits/$visitId")({ component: VisitDetail });

interface Visit { id: string; patient_id: string; status: string; reason: string | null; chief_complaint: string | null; triage_level: string | null; notes: string | null; opened_at: string; closed_at: string | null; assigned_doctor_id: string | null; assigned_nurse_id: string | null; current_stage: string | null }
interface Patient { id: string; full_name: string; medical_record_number: string | null; date_of_birth: string | null; blood_type: string | null; allergies: string | null; chronic_conditions: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null }
interface Vital { id: string; visit_id: string; captured_at: string; systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null; respiratory_rate: number | null; temperature_c: number | null; oxygen_saturation: number | null; weight_kg: number | null; height_cm: number | null; pain_level: number | null; glucose_mg_dl: number | null; notes: string | null }
interface Diagnosis { id: string; visit_id: string; diagnosis: string; icd_code: string | null; notes: string | null; is_primary: boolean }
interface Rx { id: string; visit_id: string; medication: string; dose: string | null; frequency: string | null; duration: string | null; instructions: string | null }
interface Drug { id: string; drug_name: string; default_dose: string | null; default_frequency: string | null; default_duration: string | null; medication_class: string | null; contraindications: string | null; instructions: string | null }
interface Discharge { id: string; visit_id: string; summary: string; treatment_plan: string | null; follow_up: string | null; finalized: boolean }
interface LabTest { id: string; code: string; name: string }
interface LabOrder { id: string; test_id: string; status: string; priority: string; clinical_notes: string | null }
interface LabResult { id: string; order_id: string; result_value: string | null; units: string | null; reference_range: string | null; abnormal_flag: string | null; performed_at: string | null; comments: string | null }
interface ImgOrder { id: string; modality: string; body_part: string | null; clinical_question: string | null; status: string; findings: string | null; report: string | null; image_path: string | null; performed_at: string | null }
interface ProcedureOrder { id: string; procedure_name: string; status: string; notes: string | null; performed_at: string | null }

function VisitDetail() {
  const { visitId } = Route.useParams();
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canEditVisit = hasAnyRole(["doctor", "nurse", "admin"]);
  const canClose = hasAnyRole(["doctor", "admin"]);
  const canOrder = hasAnyRole(["doctor", "admin"]);

  const visit = useQuery({ queryKey: ["visit", visitId], queryFn: async () => {
    const { data, error } = await supabase.from("visits" as never).select("*").eq("id", visitId).maybeSingle();
    if (error) throw error; return data as unknown as Visit | null;
  }});
  const patient = useQuery({ queryKey: ["patient", visit.data?.patient_id], enabled: !!visit.data?.patient_id, queryFn: async () => {
    const { data, error } = await supabase.from("patients" as never).select("id, full_name, medical_record_number, date_of_birth, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone").eq("id", visit.data!.patient_id).maybeSingle();
    if (error) throw error; return data as unknown as Patient | null;
  }});
  const vitals = useQuery({ queryKey: ["vitals", visitId], queryFn: async () => {
    const { data, error } = await supabase.from("vitals" as never).select("*").eq("visit_id", visitId).order("captured_at", { ascending: false });
    if (error) throw error; return (data as unknown as Vital[]) ?? [];
  }});
  const diagnoses = useQuery({ queryKey: ["diagnoses", visitId], queryFn: async () => {
    const { data, error } = await supabase.from("visit_diagnoses" as never).select("*").eq("visit_id", visitId).order("created_at");
    if (error) throw error; return (data as unknown as Diagnosis[]) ?? [];
  }});
  const prescriptions = useQuery({ queryKey: ["prescriptions", visitId], queryFn: async () => {
    const { data, error } = await supabase.from("prescriptions" as never).select("*").eq("visit_id", visitId).order("created_at");
    if (error) throw error; return (data as unknown as Rx[]) ?? [];
  }});
  const drugs = useQuery({ queryKey: ["drug-catalog"], queryFn: async () => {
    const { data, error } = await supabase.from("drug_catalog" as never).select("*").eq("active", true).order("drug_name");
    if (error) throw error; return (data as unknown as Drug[]) ?? [];
  }});
  const discharge = useQuery({ queryKey: ["discharge", visitId], queryFn: async () => {
    const { data, error } = await supabase.from("discharge_summaries" as never).select("*").eq("visit_id", visitId).maybeSingle();
    if (error) throw error; return data as unknown as Discharge | null;
  }});
  const labTests = useQuery({ queryKey: ["lab-tests-min"], queryFn: async () => {
    const { data, error } = await supabase.from("lab_tests_catalog" as never).select("id, code, name").order("name");
    if (error) throw error; return (data as unknown as LabTest[]) ?? [];
  }});
  const labOrders = useQuery({ queryKey: ["lab-orders-v", visitId], queryFn: async () => {
    const { data, error } = await supabase.from("lab_orders" as never).select("*").eq("visit_id", visitId);
    if (error) throw error; return (data as unknown as LabOrder[]) ?? [];
  }});
  const labResults = useQuery({ queryKey: ["lab-results-v", visitId], enabled: (labOrders.data?.length ?? 0) > 0, queryFn: async () => {
    const ids = labOrders.data!.map((o) => o.id);
    const { data, error } = await supabase.from("lab_results" as never).select("*").in("order_id", ids as never);
    if (error) throw error; return (data as unknown as LabResult[]) ?? [];
  }});
  const imgOrders = useQuery({ queryKey: ["img-orders-v", visitId], queryFn: async () => {
    const { data, error } = await supabase.from("imaging_orders" as never).select("*").eq("visit_id", visitId);
    if (error) throw error; return (data as unknown as ImgOrder[]) ?? [];
  }});
  const imageUrls = useQuery({
    queryKey: ["img-order-files", (imgOrders.data ?? []).map((o) => o.image_path).filter(Boolean).join(",")],
    enabled: (imgOrders.data ?? []).some((o) => !!o.image_path),
    queryFn: async () => {
      const entries = await Promise.all((imgOrders.data ?? []).filter((o) => o.image_path).map(async (o) => {
        const { data } = await supabase.storage.from("imaging-files").createSignedUrl(o.image_path!, 60 * 10);
        return [o.id, data?.signedUrl ?? ""] as const;
      }));
      return Object.fromEntries(entries) as Record<string, string>;
    },
  });
  const procedureOrders = useQuery({ queryKey: ["procedure-orders-v", visitId], queryFn: async () => {
    const { data, error } = await supabase.from("procedure_orders" as never).select("*").eq("visit_id", visitId).order("created_at");
    if (error) throw error; return (data as unknown as ProcedureOrder[]) ?? [];
  }});

  // All encounters for this patient, for the horizontal timeline
  const encounters = useQuery({
    queryKey: ["patient-encounters", visit.data?.patient_id],
    enabled: !!visit.data?.patient_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never)
        .select("id, opened_at, closed_at, status, reason, chief_complaint, current_stage")
        .eq("patient_id", visit.data!.patient_id)
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as { id: string; opened_at: string; closed_at: string | null; status: string; reason: string | null; chief_complaint: string | null; current_stage: string | null }[]) ?? [];
    },
  });
  const activeAdmission = useQuery({
    queryKey: ["visit-admission", visitId],
    enabled: !!visit.data,
    queryFn: async () => {
      const { data } = await supabase.from("admissions" as never)
        .select("id, admitted_at, discharged_at, status, bed_id")
        .eq("visit_id", visitId).order("admitted_at", { ascending: false }).limit(1).maybeSingle();
      return data as { id: string; admitted_at: string; discharged_at: string | null; status: string; bed_id: string | null } | null;
    },
  });

  useEffect(() => {
    if (!visit.data || !user || !hasAnyRole(["doctor"])) return;
    if (visit.data.current_stage === "waiting_for_doctor" || visit.data.current_stage === "doctor" || visit.data.status === "open") {
      supabase.from("visits" as never).update({ current_stage: "in_consultation", status: "in_progress" } as never).eq("id", visitId).then(() => {
        qc.invalidateQueries({ queryKey: ["visit", visitId] });
      });
    }
  }, [visit.data?.id, visit.data?.current_stage, visit.data?.status, user?.id, hasAnyRole, qc, visitId]);

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

  const [rxForm, setRxForm] = useState({ medication: "", dose: "", frequency: "", duration: "", instructions: "" });
  function pickDrug(id: string) {
    const d = drugs.data?.find((x) => x.id === id);
    if (!d) return;
    setRxForm({
      medication: d.drug_name,
      dose: d.default_dose ?? "",
      frequency: d.default_frequency ?? "",
      duration: d.default_duration ?? "",
      instructions: d.instructions ?? "",
    });
  }
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
    onSuccess: async () => {
      await supabase.from("visits" as never).update({ current_stage: "awaiting_pharmacy" } as never).eq("id", visitId);
      setRxForm({ medication: "", dose: "", frequency: "", duration: "", instructions: "" }); qc.invalidateQueries({ queryKey: ["prescriptions", visitId] }); qc.invalidateQueries({ queryKey: ["visit", visitId] }); toast.success("Prescription routed to pharmacy");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeRx = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("prescriptions" as never).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions", visitId] }),
  });

  // Lab order
  const [labForm, setLabForm] = useState({ test_id: "", priority: "routine", clinical_notes: "" });
  const addLab = useMutation({
    mutationFn: async () => {
      if (!labForm.test_id) throw new Error("Pick a test");
      if (!visit.data) throw new Error("No visit");
      const { error } = await supabase.from("lab_orders" as never).insert({
        visit_id: visitId, patient_id: visit.data.patient_id, test_id: labForm.test_id,
        priority: labForm.priority, clinical_notes: labForm.clinical_notes || null, ordered_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      await supabase.from("visits" as never).update({ current_stage: "lab_ordered" } as never).eq("id", visitId);
      setLabForm({ test_id: "", priority: "routine", clinical_notes: "" }); qc.invalidateQueries({ queryKey: ["lab-orders-v", visitId] }); qc.invalidateQueries({ queryKey: ["visit", visitId] }); toast.success("Lab ordered and routed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Imaging order
  const [imgForm, setImgForm] = useState({ modality: "X-ray", body_part: "", clinical_question: "", priority: "routine" });
  const addImg = useMutation({
    mutationFn: async () => {
      if (!visit.data) throw new Error("No visit");
      const { error } = await supabase.from("imaging_orders" as never).insert({
        visit_id: visitId, patient_id: visit.data.patient_id,
        modality: imgForm.modality, body_part: imgForm.body_part || null,
        clinical_question: imgForm.clinical_question || null, priority: imgForm.priority,
        ordered_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      await supabase.from("visits" as never).update({ current_stage: "imaging_ordered" } as never).eq("id", visitId);
      setImgForm({ modality: "X-ray", body_part: "", clinical_question: "", priority: "routine" }); qc.invalidateQueries({ queryKey: ["img-orders-v", visitId] }); qc.invalidateQueries({ queryKey: ["visit", visitId] }); toast.success("Imaging ordered and routed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [procForm, setProcForm] = useState({ procedure_name: "", notes: "" });
  const addProcedure = useMutation({
    mutationFn: async () => {
      if (!procForm.procedure_name.trim()) throw new Error("Procedure required");
      const { error } = await supabase.from("procedure_orders" as never).insert({
        visit_id: visitId, procedure_name: procForm.procedure_name.trim(), notes: procForm.notes || null, ordered_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      await supabase.from("visits" as never).update({ current_stage: "procedure_ordered" } as never).eq("id", visitId);
      setProcForm({ procedure_name: "", notes: "" }); qc.invalidateQueries({ queryKey: ["procedure-orders-v", visitId] }); qc.invalidateQueries({ queryKey: ["visit", visitId] }); toast.success("Procedure routed to nursing");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [ds, setDs] = useState({ summary: "", treatment_plan: "", follow_up: "" });
  const dischargeLoaded = discharge.data;
  useEffect(() => {
    if (dischargeLoaded) setDs({ summary: dischargeLoaded.summary ?? "", treatment_plan: dischargeLoaded.treatment_plan ?? "", follow_up: dischargeLoaded.follow_up ?? "" });
  }, [dischargeLoaded]);

  const saveDischarge = useMutation({
    mutationFn: async (finalize: boolean) => {
      if (finalize && !ds.summary.trim()) throw new Error("Discharge summary required");
      if (finalize && diagnoses.data?.length === 0) throw new Error("Add at least one diagnosis");
      const keepFinalized = Boolean(discharge.data?.finalized && !finalize);
      const payload: Record<string, unknown> = {
        visit_id: visitId, summary: ds.summary, treatment_plan: ds.treatment_plan || null,
        follow_up: ds.follow_up || null, finalized: keepFinalized || finalize,
      };
      if (finalize) { payload.finalized_at = new Date().toISOString(); payload.finalized_by = user!.id; }
      if (!discharge.data) payload.created_by = user!.id;
      const { error } = await supabase.from("discharge_summaries" as never).upsert(payload as never, { onConflict: "visit_id" } as never);
      if (error) throw error;
      if (finalize) {
        await supabase.from("visits" as never).update({ status: "completed", closed_at: new Date().toISOString() } as never).eq("id", visitId);
      }
    },
    onSuccess: (_d, finalize) => {
      qc.invalidateQueries({ queryKey: ["discharge", visitId] }); qc.invalidateQueries({ queryKey: ["visit", visitId] }); qc.invalidateQueries({ queryKey: ["visits"] });
      toast.success(finalize ? "Visit completed" : "Report saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotes = useMutation({
    mutationFn: async (notes: string) => { const { error } = await supabase.from("visits" as never).update({ notes } as never).eq("id", visitId); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visit", visitId] }); toast.success("Notes saved"); },
  });

  function handleExport() {
    if (!visit.data || !patient.data) return;
    const labRows = (labOrders.data ?? []).map((o) => {
      const t = labTests.data?.find((x) => x.id === o.test_id);
      const r = labResults.data?.find((x) => x.order_id === o.id);
      return { test: t?.name ?? o.test_id, result: r?.result_value ?? null, units: r?.units ?? null, flag: r?.abnormal_flag ?? null, performed_at: r?.performed_at ?? null };
    });
    exportVisitPDF({
      visit: visit.data,
      patient: { full_name: patient.data.full_name, medical_record_number: patient.data.medical_record_number, date_of_birth: patient.data.date_of_birth, blood_type: patient.data.blood_type, allergies: patient.data.allergies },
      vitals: (vitals.data ?? []).slice().reverse(),
      diagnoses: diagnoses.data ?? [],
      prescriptions: prescriptions.data ?? [],
      labs: labRows,
      imaging: (imgOrders.data ?? []).map((i) => ({ modality: i.modality, body_part: i.body_part, report: i.report, performed_at: i.performed_at })),
      discharge: discharge.data ? { summary: discharge.data.summary, treatment_plan: discharge.data.treatment_plan, follow_up: discharge.data.follow_up } : null,
    });
  }

  if (visit.isLoading) return <div className="text-muted-foreground">Loading visit...</div>;
  if (!visit.data) return <div className="text-muted-foreground">Visit not found.</div>;
  const v = visit.data; const p = patient.data;
  const finalized = v.status === "completed" || v.status === "closed" || discharge.data?.finalized;

  const patientAge = useMemo(() => {
    if (!p?.date_of_birth) return null;
    const dob = new Date(p.date_of_birth); if (isNaN(+dob)) return null;
    const now = new Date(); let a = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) a--;
    return a;
  }, [p?.date_of_birth]);

  const tabs = [
    { key: "overview", label: "Overview", icon: Clipboard },
    { key: "vitals", label: "Vitals", icon: HeartPulse },
    { key: "notes", label: "Notes & Dx", icon: Stethoscope },
    { key: "orders", label: "Orders", icon: Activity },
    { key: "results", label: "Results", icon: FlaskConical },
    { key: "meds", label: "Meds", icon: Pill },
    { key: "discharge", label: "Discharge", icon: CheckCircle2 },
  ] as const;
  type TabKey = typeof tabs[number]["key"];
  const [tab, setTab] = useState<TabKey>("overview");

  const encList = encounters.data ?? [];
  const admissionActive = activeAdmission.data && !activeAdmission.data.discharged_at;

  return (
    <div className="space-y-4">
      {/* Sticky patient banner */}
      <div className="sticky top-0 z-30 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs text-muted-foreground">
              <Link to="/visits"><ArrowLeft className="h-3 w-3" /> All visits</Link>
            </Button>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold leading-tight">{p?.full_name ?? "…"}</h1>
              {p?.medical_record_number && <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">MRN {p.medical_record_number}</span>}
              {patientAge != null && <span className="text-sm text-muted-foreground">{patientAge}y</span>}
              {p?.blood_type && <span className="rounded bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">{p.blood_type}</span>}
              {admissionActive && <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><BedDouble className="h-3 w-3" /> Inpatient</span>}
              <span className="text-xs text-muted-foreground">· Opened {new Date(v.opened_at).toLocaleString()}</span>
              <span className="text-xs capitalize text-muted-foreground">· {v.status.replace("_"," ")}</span>
            </div>
            {(p?.allergies || p?.chronic_conditions) && (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {p?.allergies && <span className="text-amber-700 dark:text-amber-300"><strong>Allergies:</strong> {p.allergies}</span>}
                {p?.chronic_conditions && <span className="text-muted-foreground"><strong>Chronic:</strong> {p.chronic_conditions}</span>}
              </div>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            <AssignVisit visitId={v.id} assignedDoctorId={v.assigned_doctor_id} assignedNurseId={v.assigned_nurse_id} />
            {canOrder && p && !admissionActive && <AdmitPatientButton visitId={v.id} patientName={p.full_name} disabled={finalized} />}
            {canClose && p && <SickOffButton visitId={v.id} patientId={v.patient_id} patientName={p.full_name} mrn={p.medical_record_number} primaryDx={diagnoses.data?.find((d)=>d.is_primary)?.diagnosis ?? diagnoses.data?.[0]?.diagnosis ?? null} userId={user?.id ?? null} />}
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4" /> PDF</Button>
          </div>
        </div>

        {/* Horizontal encounter timeline */}
        {encList.length > 0 && (
          <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto pb-1">
            {encList.map((enc) => {
              const active = enc.id === visitId;
              const label = new Date(enc.opened_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
              return (
                <Link
                  key={enc.id}
                  to="/visits/$visitId"
                  params={{ visitId: enc.id }}
                  preload="intent"
                  className={`group inline-flex min-w-[140px] shrink-0 flex-col rounded-md border px-3 py-2 text-left text-xs transition ${
                    active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/50 hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{label}</span>
                    <span className={`rounded px-1 text-[10px] capitalize ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {enc.status.replace("_"," ")}
                    </span>
                  </div>
                  <span className="mt-0.5 truncate text-muted-foreground">{enc.reason ?? enc.chief_complaint ?? "—"}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <div className="mt-3 flex gap-1 overflow-x-auto border-b -mb-3">
          {tabs.map((t) => {
            const Icon = t.icon; const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
                  active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {tab === "overview" && (
            <>
              <div className="rounded-lg border bg-card p-5">
                <h2 className="font-medium">Visit summary</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Reason</dt><dd>{v.reason ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Triage</dt><dd className="capitalize">{v.triage_level ?? "routine"}</dd></div>
                  <div className="col-span-2"><dt className="text-muted-foreground">Chief complaint</dt><dd>{v.chief_complaint ?? "—"}</dd></div>
                  {v.current_stage && <div><dt className="text-muted-foreground">Stage</dt><dd className="capitalize">{v.current_stage.replace("_"," ")}</dd></div>}
                </dl>
              </div>
              <div className="rounded-lg border bg-card p-5">
                <h2 className="font-medium">Latest vitals</h2>
                {vitals.data?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No vitals captured yet.</p>}
                <div className="mt-3">
                  {vitals.data?.slice(0, 1).map((vt) => (
                    <div key={vt.id} className="rounded-md border bg-background p-3 text-sm">
                      <div className="mb-2 text-xs text-muted-foreground">Captured {new Date(vt.captured_at).toLocaleString()}</div>
                      <div className="grid gap-2 sm:grid-cols-4">
                        <VitalReadout label="BP" value={vt.systolic_bp != null && vt.diastolic_bp != null ? `${vt.systolic_bp}/${vt.diastolic_bp}` : "—"} />
                        <VitalReadout label="HR" value={vt.heart_rate != null ? `${vt.heart_rate} bpm` : "—"} />
                        <VitalReadout label="Temp" value={vt.temperature_c != null ? `${vt.temperature_c} °C` : "—"} />
                        <VitalReadout label="SpO₂" value={vt.oxygen_saturation != null ? `${vt.oxygen_saturation}%` : "—"} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "vitals" && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="font-medium">Vitals history · this encounter</h2>
              {vitals.data?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No vitals captured yet.</p>}
              <div className="mt-3 space-y-2">
                {vitals.data?.map((vt) => (
                  <div key={vt.id} className="rounded-md border bg-background p-3 text-sm">
                    <div className="mb-2 text-xs text-muted-foreground">Captured {new Date(vt.captured_at).toLocaleString()}</div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <VitalReadout label="BP" value={vt.systolic_bp != null && vt.diastolic_bp != null ? `${vt.systolic_bp}/${vt.diastolic_bp}` : "—"} />
                      <VitalReadout label="HR" value={vt.heart_rate != null ? `${vt.heart_rate} bpm` : "—"} />
                      <VitalReadout label="Temp" value={vt.temperature_c != null ? `${vt.temperature_c} °C` : "—"} />
                      <VitalReadout label="SpO₂" value={vt.oxygen_saturation != null ? `${vt.oxygen_saturation}%` : "—"} />
                    </div>
                    {vt.notes && <div className="mt-2 text-muted-foreground">{vt.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "notes" && (
            <>
              <div className="rounded-lg border bg-card p-5">
                <h2 className="font-medium">Clinical notes</h2>
                {canEditVisit && <NotesEditor initial={v.notes ?? ""} onSave={(t) => saveNotes.mutate(t)} disabled={saveNotes.isPending} />}
              </div>
              {(canClose || (diagnoses.data?.length ?? 0) > 0) && (
                <div className="rounded-lg border bg-card p-5">
                  <h2 className="flex items-center gap-2 font-medium"><Stethoscope className="h-4 w-4 text-primary" /> Diagnoses (ICD-11)</h2>
                  <ul className="mt-3 space-y-2 text-sm">
                    {diagnoses.data?.length === 0 && <li className="text-muted-foreground">None recorded.</li>}
                    {diagnoses.data?.map((d) => (
                      <li key={d.id} className="flex items-center justify-between rounded border p-2">
                        <div>
                          <div className="font-medium">{d.diagnosis} {d.is_primary && <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">primary</span>}</div>
                          {d.icd_code && <div className="text-xs text-muted-foreground">ICD-11: {d.icd_code}</div>}
                        </div>
                        {canClose && !finalized && <Button size="icon" variant="ghost" onClick={() => removeDiagnosis.mutate(d.id)}><Trash2 className="h-4 w-4" /></Button>}
                      </li>
                    ))}
                  </ul>
                  {canClose && !finalized && (
                    <div className="mt-3 space-y-2">
                      <IcdPicker value="" onPick={(r) => setDiagForm({ ...diagForm, diagnosis: r.title, icd_code: r.code })} />
                      <div className="grid grid-cols-12 gap-2">
                        <Input className="col-span-6" placeholder="Diagnosis" value={diagForm.diagnosis} onChange={(e) => setDiagForm({ ...diagForm, diagnosis: e.target.value })} />
                        <Input className="col-span-3" placeholder="ICD-11" value={diagForm.icd_code} onChange={(e) => setDiagForm({ ...diagForm, icd_code: e.target.value })} />
                        <label className="col-span-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={diagForm.is_primary} onChange={(e) => setDiagForm({ ...diagForm, is_primary: e.target.checked })} /> Primary</label>
                        <Button className="col-span-1" size="sm" onClick={() => addDiagnosis.mutate()}>Add</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "orders" && (
            <>
              {(canOrder || (labOrders.data?.length ?? 0) > 0) && (
                <div className="rounded-lg border bg-card p-5">
                  <h2 className="flex items-center gap-2 font-medium"><FlaskConical className="h-4 w-4 text-primary" /> Lab investigations</h2>
                  {canOrder && !finalized && (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <LabTestSearchButton
                          tests={labTests.data ?? []}
                          selectedId={labForm.test_id}
                          onPick={(t) => setLabForm({ ...labForm, test_id: t.id })}
                        />
                        <span className="text-xs text-muted-foreground">
                          {labForm.test_id
                            ? labTests.data?.find((t) => t.id === labForm.test_id)?.name
                            : "No test selected"}
                        </span>
                      </div>
                      <div className="grid grid-cols-12 gap-2">
                        <select className="col-span-2 rounded border bg-background px-2 text-sm" value={labForm.priority} onChange={(e) => setLabForm({ ...labForm, priority: e.target.value })}>
                          <option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option>
                        </select>
                        <Input className="col-span-8" placeholder="Clinical notes" value={labForm.clinical_notes} onChange={(e) => setLabForm({ ...labForm, clinical_notes: e.target.value })} />
                        <Button className="col-span-2" size="sm" onClick={() => addLab.mutate()} disabled={!labForm.test_id || addLab.isPending}>Order</Button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">{labOrders.data?.length ?? 0} lab order(s) on this encounter — view results in the Results tab.</div>
                </div>
              )}

              {(canOrder || (imgOrders.data?.length ?? 0) > 0) && (
                <div className="rounded-lg border bg-card p-5">
                  <h2 className="flex items-center gap-2 font-medium"><ScanLine className="h-4 w-4 text-primary" /> Imaging</h2>
                  {canOrder && !finalized && (
                    <div className="mt-3 grid grid-cols-12 gap-2">
                      <select className="col-span-3 rounded border bg-background px-2 text-sm" value={imgForm.modality} onChange={(e) => setImgForm({ ...imgForm, modality: e.target.value })}>
                        {["X-ray","CT","MRI","Ultrasound","Mammogram","PET","Fluoroscopy"].map((m) => <option key={m}>{m}</option>)}
                      </select>
                      <Input className="col-span-3" placeholder="Body part" value={imgForm.body_part} onChange={(e) => setImgForm({ ...imgForm, body_part: e.target.value })} />
                      <Input className="col-span-4" placeholder="Clinical question" value={imgForm.clinical_question} onChange={(e) => setImgForm({ ...imgForm, clinical_question: e.target.value })} />
                      <select className="col-span-1 rounded border bg-background px-1 text-xs" value={imgForm.priority} onChange={(e) => setImgForm({ ...imgForm, priority: e.target.value })}>
                        <option value="routine">R</option><option value="urgent">U</option><option value="stat">S</option>
                      </select>
                      <Button className="col-span-1" size="sm" onClick={() => addImg.mutate()}>Order</Button>
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">{imgOrders.data?.length ?? 0} imaging order(s) — reports in the Results tab.</div>
                </div>
              )}

              {(canOrder || (procedureOrders.data?.length ?? 0) > 0) && (
                <div className="rounded-lg border bg-card p-5">
                  <h2 className="flex items-center gap-2 font-medium"><Stethoscope className="h-4 w-4 text-primary" /> Nursing procedures</h2>
                  <ul className="mt-3 space-y-1 text-sm">
                    {procedureOrders.data?.length === 0 && <li className="text-muted-foreground">No procedures ordered.</li>}
                    {procedureOrders.data?.map((o) => (
                      <li key={o.id} className="flex justify-between rounded border p-2">
                        <div>
                          <div className="font-medium">{o.procedure_name}</div>
                          {o.notes && <div className="text-xs text-muted-foreground">{o.notes}</div>}
                        </div>
                        <span className="self-start rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">{o.status}</span>
                      </li>
                    ))}
                  </ul>
                  {canOrder && !finalized && (
                    <div className="mt-3 space-y-2">
                      <ProcedurePickerInline
                        value={procForm.procedure_name}
                        onChange={(name) => setProcForm({ ...procForm, procedure_name: name })}
                      />
                      <div className="grid grid-cols-12 gap-2">
                        <Input className="col-span-10" placeholder="Notes / instructions for nurse" value={procForm.notes} onChange={(e) => setProcForm({ ...procForm, notes: e.target.value })} />
                        <Button className="col-span-2" size="sm" onClick={() => addProcedure.mutate()} disabled={addProcedure.isPending || !procForm.procedure_name.trim()}>Route to nurse</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "results" && (
            <>
              <div className="rounded-lg border bg-card p-5">
                <h2 className="flex items-center gap-2 font-medium"><FlaskConical className="h-4 w-4 text-primary" /> Laboratory results</h2>
                <div className="mt-3">
                  <LabResultsViewer
                    patientId={v.patient_id}
                    patientName={p?.full_name ?? ""}
                    mrn={p?.medical_record_number ?? null}
                  />
                </div>
              </div>
              <div className="rounded-lg border bg-card p-5">
                <h2 className="flex items-center gap-2 font-medium"><ScanLine className="h-4 w-4 text-primary" /> Imaging reports</h2>
                <div className="mt-3">
                  <ImagingViewer
                    patientId={v.patient_id}
                    patientName={p?.full_name ?? ""}
                    mrn={p?.medical_record_number ?? null}
                  />
                </div>
              </div>
            </>
          )}

          {tab === "meds" && (canClose || (prescriptions.data?.length ?? 0) > 0) && (
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
                    {canClose && !finalized && <Button size="icon" variant="ghost" onClick={() => removeRx.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </li>
                ))}
              </ul>
              {canClose && !finalized && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <DrugPickerInline
                      onPick={(d) => setRxForm({
                        medication: d.drug_name,
                        dose: d.default_dose ?? "",
                        frequency: d.default_frequency ?? "",
                        duration: d.default_duration ?? "",
                        instructions: d.instructions ?? "",
                      })}
                    />
                  </div>
                  <Input placeholder="Medication" value={rxForm.medication} onChange={(e) => setRxForm({ ...rxForm, medication: e.target.value })} />
                  <Input placeholder="Dose" value={rxForm.dose} onChange={(e) => setRxForm({ ...rxForm, dose: e.target.value })} />
                  <Input placeholder="Frequency" value={rxForm.frequency} onChange={(e) => setRxForm({ ...rxForm, frequency: e.target.value })} />
                  <Input placeholder="Duration" value={rxForm.duration} onChange={(e) => setRxForm({ ...rxForm, duration: e.target.value })} />
                  <Textarea className="col-span-2" rows={2} placeholder="Instructions" value={rxForm.instructions} onChange={(e) => setRxForm({ ...rxForm, instructions: e.target.value })} />
                  <Button className="col-span-2" onClick={() => addRx.mutate()} disabled={addRx.isPending}>Add prescription</Button>
                </div>
              )}
            </div>
          )}

          {tab === "discharge" && canClose && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-primary" /> Discharge & complete</h2>
              <div className="mt-3 space-y-3">
                <div><Label>Discharge summary *</Label><Textarea rows={4} value={ds.summary} onChange={(e) => setDs({ ...ds, summary: e.target.value })} /></div>
                <div><Label>Treatment plan</Label><Textarea rows={3} value={ds.treatment_plan} onChange={(e) => setDs({ ...ds, treatment_plan: e.target.value })} /></div>
                <div><Label>Follow-up</Label><Textarea rows={2} value={ds.follow_up} onChange={(e) => setDs({ ...ds, follow_up: e.target.value })} /></div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => saveDischarge.mutate(false)} disabled={saveDischarge.isPending}>{finalized ? "Save report changes" : "Save draft"}</Button>
                {!finalized && <Button onClick={() => saveDischarge.mutate(true)} disabled={saveDischarge.isPending}>Complete visit</Button>}
              </div>
            </div>
          )}
        </div>

        {/* Right rail: patient snapshot */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-5">
            <h2 className="font-medium">Patient</h2>
            {p ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div><dt className="text-muted-foreground">Name</dt><dd>{p.full_name}</dd></div>
                {p.date_of_birth && <div><dt className="text-muted-foreground">DOB</dt><dd>{p.date_of_birth}{patientAge != null ? ` · ${patientAge}y` : ""}</dd></div>}
                {p.blood_type && <div><dt className="text-muted-foreground">Blood</dt><dd>{p.blood_type}</dd></div>}
                {p.allergies && <div><dt className="text-muted-foreground">Allergies</dt><dd className="text-amber-700 dark:text-amber-300">{p.allergies}</dd></div>}
                {p.chronic_conditions && <div><dt className="text-muted-foreground">Conditions</dt><dd>{p.chronic_conditions}</dd></div>}
                {p.emergency_contact_name && <div><dt className="text-muted-foreground">Emergency</dt><dd>{p.emergency_contact_name}{p.emergency_contact_phone ? ` · ${p.emergency_contact_phone}` : ""}</dd></div>}
              </dl>
            ) : <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
          </div>
          {encList.length > 1 && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="font-medium">Prior encounters</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {encList.filter((e) => e.id !== visitId).slice(0, 8).map((e) => (
                  <li key={e.id}>
                    <Link
                      to="/visits/$visitId"
                      params={{ visitId: e.id }}
                      preload="intent"
                      className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted"
                    >
                      <span>{new Date(e.opened_at).toLocaleDateString()} · {e.reason ?? e.chief_complaint ?? "—"}</span>
                      <span className="text-xs capitalize text-muted-foreground">{e.status.replace("_"," ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VitalReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-card p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold">{value}</div>
    </div>
  );
}

function LabTestSearchButton({ tests, selectedId, onPick }: {
  tests: LabTest[]; selectedId: string; onPick: (t: LabTest) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = tests.map((t) => ({ id: t.id, primary: t.name, secondary: t.code }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><FlaskConical className="h-4 w-4" /> Search test database</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Search laboratory tests</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-hidden">
          <CatalogSearch
            items={items}
            storageKey="rx-test-picker-recents"
            placeholder="Search by test name or code…"
            onPick={(it) => {
              const t = tests.find((x) => x.id === it.id);
              if (t) { onPick(t); setOpen(false); }
            }}
            renderAction={(it) => selectedId === it.id ? <span className="text-xs text-emerald-600">selected</span> : null}
          />
        </div>
      </DialogContent>
    </Dialog>
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

function SickOffButton({ visitId, patientId, patientName, mrn, primaryDx, userId }: {
  visitId: string; patientId: string; patientName: string; mrn: string | null; primaryDx: string | null; userId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    days: 3,
    start_date: new Date().toISOString().slice(0,10),
    diagnosis: primaryDx ?? "",
    recommendation: "Rest and review if symptoms persist.",
  });
  const endDate = (() => {
    const d = new Date(form.start_date);
    d.setDate(d.getDate() + Math.max(0, form.days - 1));
    return d.toISOString().slice(0,10);
  })();

  async function save(downloadAfter: boolean) {
    if (!form.diagnosis.trim()) return toast.error("Diagnosis required");
    if (form.days < 1) return toast.error("At least 1 day required");
    const { data, error } = await supabase.from("sick_off_notes" as never).insert({
      visit_id: visitId, patient_id: patientId, doctor_id: userId,
      diagnosis: form.diagnosis, recommendation: form.recommendation,
      days: form.days, start_date: form.start_date, end_date: endDate,
    } as never).select().single();
    if (error) return toast.error(error.message);
    toast.success("Sick-off sent to patient portal");
    setOpen(false);
    if (downloadAfter && data) {
      const s = data as { id: string; created_at: string };
      exportSickOffPDF({
        id: s.id, patient_name: patientName, mrn, diagnosis: form.diagnosis,
        recommendation: form.recommendation, days: form.days,
        start_date: form.start_date, end_date: endDate, created_at: s.created_at,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><FileText className="h-4 w-4" /> Sick-off</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Issue sick-off certificate</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><Label>Days</Label><Input type="number" min={1} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} /></div>
          </div>
          <div className="rounded border bg-muted/30 p-2 text-xs">End date: <span className="font-medium">{endDate}</span></div>
          <div><Label>Diagnosis</Label><Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} /></div>
          <div><Label>Recommendation</Label><Textarea rows={3} value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => save(false)}>Save & send to patient</Button>
          <Button onClick={() => save(true)}>Save & download PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
