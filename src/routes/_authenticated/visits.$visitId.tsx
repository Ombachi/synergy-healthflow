import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/visits/$visitId")({
  component: VisitDetail,
});

interface Visit {
  id: string;
  patient_id: string;
  status: string;
  reason: string | null;
  chief_complaint: string | null;
  triage_level: string | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
}

interface Patient {
  id: string;
  full_name: string;
  medical_record_number: string | null;
  date_of_birth: string | null;
  blood_type: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

interface Vital {
  id: string;
  visit_id: string;
  captured_at: string;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  temperature_c: number | null;
  oxygen_saturation: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  pain_level: number | null;
  glucose_mg_dl: number | null;
  notes: string | null;
}

function VisitDetail() {
  const { visitId } = Route.useParams();
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canCapture = hasAnyRole(["nurse", "doctor", "admin"]);
  const canEditVisit = hasAnyRole(["doctor", "nurse", "admin"]);

  const visit = useQuery({
    queryKey: ["visit", visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits" as never)
        .select("*")
        .eq("id", visitId)
        .maybeSingle();
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
        .eq("id", visit.data!.patient_id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Patient | null;
    },
  });

  const vitals = useQuery({
    queryKey: ["vitals", visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vitals" as never)
        .select("*")
        .eq("visit_id", visitId)
        .order("captured_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Vital[]) ?? [];
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

  const captureVitals = useMutation({
    mutationFn: async () => {
      if (!visit.data) throw new Error("Visit not loaded");
      const payload = {
        visit_id: visit.data.id,
        patient_id: visit.data.patient_id,
        captured_by: user!.id,
        systolic_bp: num(form.systolic_bp),
        diastolic_bp: num(form.diastolic_bp),
        heart_rate: num(form.heart_rate),
        respiratory_rate: num(form.respiratory_rate),
        temperature_c: num(form.temperature_c),
        oxygen_saturation: num(form.oxygen_saturation),
        weight_kg: num(form.weight_kg),
        height_cm: num(form.height_cm),
        pain_level: num(form.pain_level),
        glucose_mg_dl: num(form.glucose_mg_dl),
        notes: form.notes || null,
      };
      const { error } = await supabase.from("vitals" as never).insert(payload as never);
      if (error) throw error;
      // bump visit to in_progress
      if (visit.data.status === "open") {
        await supabase
          .from("visits" as never)
          .update({ status: "in_progress" } as never)
          .eq("id", visit.data.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vitals", visitId] });
      qc.invalidateQueries({ queryKey: ["visit", visitId] });
      setForm({});
      toast.success("Vitals recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotesAndClose = useMutation({
    mutationFn: async (close: boolean) => {
      const update: Record<string, unknown> = { notes: form.visit_notes ?? visit.data?.notes ?? null };
      if (close) {
        update.status = "closed";
        update.closed_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("visits" as never)
        .update(update as never)
        .eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: (_d, close) => {
      qc.invalidateQueries({ queryKey: ["visit", visitId] });
      qc.invalidateQueries({ queryKey: ["visits"] });
      toast.success(close ? "Visit closed" : "Notes saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (visit.isLoading) return <div className="text-muted-foreground">Loading visit...</div>;
  if (!visit.data) return <div className="text-muted-foreground">Visit not found.</div>;

  const v = visit.data;
  const p = patient.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/visits"><ArrowLeft className="h-4 w-4" /> All visits</Link>
          </Button>
          <h1 className="mt-1 text-2xl font-semibold">
            Visit · {p?.full_name ?? "…"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Opened {new Date(v.opened_at).toLocaleString()} · Status: <span className="capitalize">{v.status.replace("_", " ")}</span>
          </p>
        </div>
        {canEditVisit && v.status !== "closed" && (
          <Button
            variant="outline"
            onClick={() => saveNotesAndClose.mutate(true)}
            disabled={saveNotesAndClose.isPending}
          >
            <CheckCircle2 className="h-4 w-4" /> Close visit
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Visit summary */}
          <div className="rounded-lg border bg-card p-5">
            <h2 className="font-medium">Visit summary</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Reason</dt><dd>{v.reason ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Triage</dt><dd className="capitalize">{v.triage_level ?? "routine"}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Chief complaint</dt><dd>{v.chief_complaint ?? "—"}</dd></div>
            </dl>
            {canEditVisit && (
              <div className="mt-4 space-y-2">
                <Label>Clinical notes</Label>
                <Textarea
                  rows={4}
                  defaultValue={v.notes ?? ""}
                  onChange={(e) => setField("visit_notes", e.target.value)}
                />
                <div className="flex justify-end">
                  <Button size="sm" variant="secondary" onClick={() => saveNotesAndClose.mutate(false)} disabled={saveNotesAndClose.isPending}>
                    Save notes
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Capture vitals */}
          {canCapture && v.status !== "closed" && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="flex items-center gap-2 font-medium">
                <HeartPulse className="h-4 w-4 text-primary" /> Capture vitals
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Systolic BP" suffix="mmHg" k="systolic_bp" form={form} setField={setField} />
                <Field label="Diastolic BP" suffix="mmHg" k="diastolic_bp" form={form} setField={setField} />
                <Field label="Heart rate" suffix="bpm" k="heart_rate" form={form} setField={setField} />
                <Field label="Resp rate" suffix="/min" k="respiratory_rate" form={form} setField={setField} />
                <Field label="Temperature" suffix="°C" k="temperature_c" form={form} setField={setField} step="0.1" />
                <Field label="SpO₂" suffix="%" k="oxygen_saturation" form={form} setField={setField} />
                <Field label="Weight" suffix="kg" k="weight_kg" form={form} setField={setField} step="0.1" />
                <Field label="Height" suffix="cm" k="height_cm" form={form} setField={setField} step="0.1" />
                <Field label="Pain (0–10)" k="pain_level" form={form} setField={setField} />
                <Field label="Glucose" suffix="mg/dL" k="glucose_mg_dl" form={form} setField={setField} />
              </div>
              <div className="mt-3">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} />
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={() => captureVitals.mutate()} disabled={captureVitals.isPending}>
                  {captureVitals.isPending ? "Saving..." : "Record vitals"}
                </Button>
              </div>
            </div>
          )}

          {/* Vitals history */}
          <div className="rounded-lg border bg-card p-5">
            <h2 className="font-medium">Vitals history</h2>
            {vitals.isLoading && <p className="mt-2 text-sm text-muted-foreground">Loading...</p>}
            {vitals.data?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No vitals captured yet.</p>}
            <div className="mt-3 space-y-2">
              {vitals.data?.map((vt) => (
                <div key={vt.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="mb-2 text-xs text-muted-foreground">
                    {new Date(vt.captured_at).toLocaleString()}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {vt.systolic_bp != null && vt.diastolic_bp != null && (
                      <span>BP: <strong>{vt.systolic_bp}/{vt.diastolic_bp}</strong></span>
                    )}
                    {vt.heart_rate != null && <span>HR: <strong>{vt.heart_rate}</strong> bpm</span>}
                    {vt.respiratory_rate != null && <span>RR: <strong>{vt.respiratory_rate}</strong></span>}
                    {vt.temperature_c != null && <span>Temp: <strong>{vt.temperature_c}°C</strong></span>}
                    {vt.oxygen_saturation != null && <span>SpO₂: <strong>{vt.oxygen_saturation}%</strong></span>}
                    {vt.weight_kg != null && <span>Wt: <strong>{vt.weight_kg}kg</strong></span>}
                    {vt.height_cm != null && <span>Ht: <strong>{vt.height_cm}cm</strong></span>}
                    {vt.pain_level != null && <span>Pain: <strong>{vt.pain_level}/10</strong></span>}
                    {vt.glucose_mg_dl != null && <span>Glucose: <strong>{vt.glucose_mg_dl}</strong></span>}
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
                {p.medical_record_number && <div><dt className="text-muted-foreground">MRN</dt><dd>{p.medical_record_number}</dd></div>}
                {p.date_of_birth && <div><dt className="text-muted-foreground">DOB</dt><dd>{p.date_of_birth}</dd></div>}
                {p.blood_type && <div><dt className="text-muted-foreground">Blood type</dt><dd>{p.blood_type}</dd></div>}
                {p.allergies && <div><dt className="text-muted-foreground">Allergies</dt><dd>{p.allergies}</dd></div>}
                {p.chronic_conditions && <div><dt className="text-muted-foreground">Conditions</dt><dd>{p.chronic_conditions}</dd></div>}
                {p.emergency_contact_name && (
                  <div>
                    <dt className="text-muted-foreground">Emergency contact</dt>
                    <dd>{p.emergency_contact_name}{p.emergency_contact_phone ? ` · ${p.emergency_contact_phone}` : ""}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Loading patient...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  suffix,
  k,
  form,
  setField,
  step,
}: {
  label: string;
  suffix?: string;
  k: string;
  form: Record<string, string>;
  setField: (k: string, v: string) => void;
  step?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}{suffix ? ` (${suffix})` : ""}</Label>
      <Input
        type="number"
        step={step}
        value={form[k] ?? ""}
        onChange={(e) => setField(k, e.target.value)}
      />
    </div>
  );
}
