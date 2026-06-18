import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, HeartPulse, Stethoscope, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface QueueEntry { id: string; visit_id: string; priority: number; entered_at: string; called_at: string | null }
interface Visit { id: string; patient_id: string; reason: string | null; chief_complaint: string | null; triage_level: string | null }
interface Patient { id: string; full_name: string; date_of_birth: string | null; gender: string | null; allergies: string | null; medical_record_number: string | null }
interface Doctor { id: string; full_name: string | null; role: string }

const PRIO_COLOR: Record<number, string> = {
  1: "bg-rose-500/15 text-rose-700 border-rose-500/40",
  2: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  3: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  4: "bg-muted text-muted-foreground border-border",
  5: "bg-muted text-muted-foreground border-border",
};
const PRIO_LABEL: Record<number, string> = { 1: "Emergency", 2: "Urgent", 3: "Normal", 4: "Low", 5: "Routine" };

function ageOf(dob: string | null) {
  if (!dob) return "—";
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${y}y`;
}

export function NurseStation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [selectedQid, setSelectedQid] = useState<string | null>(null);

  const queue = useQuery({
    queryKey: ["nurse-queue"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visit_queue" as never)
        .select("id, visit_id, priority, entered_at, called_at")
        .eq("queue_type", "triage").is("served_at", null)
        .order("priority").order("entered_at");
      if (error) throw error;
      return (data as unknown as QueueEntry[]) ?? [];
    },
  });

  const visitIds = (queue.data ?? []).map((q) => q.visit_id);
  const visits = useQuery({
    queryKey: ["nurse-visits", visitIds.join(",")],
    enabled: visitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never)
        .select("id, patient_id, reason, chief_complaint, triage_level").in("id", visitIds as never);
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });

  const patientIds = (visits.data ?? []).map((v) => v.patient_id);
  const patients = useQuery({
    queryKey: ["nurse-patients", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never)
        .select("id, full_name, date_of_birth, gender, allergies, medical_record_number")
        .in("id", patientIds as never);
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });

  const doctors = useQuery({
    queryKey: ["nurse-doctors"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_messageable_users" as never);
      if (error) throw error;
      return ((data as unknown as Doctor[]) ?? []).filter((u) => u.role === "doctor");
    },
  });

  useEffect(() => {
    const ch = supabase.channel("nurse-queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_queue" }, () => qc.invalidateQueries({ queryKey: ["nurse-queue"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Auto-select first queue entry
  useEffect(() => {
    if (!selectedQid && queue.data && queue.data.length > 0) setSelectedQid(queue.data[0].id);
  }, [queue.data, selectedQid]);

  const selectedEntry = queue.data?.find((q) => q.id === selectedQid) ?? null;
  const selectedVisit = visits.data?.find((v) => v.id === selectedEntry?.visit_id) ?? null;
  const selectedPatient = patients.data?.find((p) => p.id === selectedVisit?.patient_id) ?? null;

  const [v, setV] = useState({
    temperature_c: "", heart_rate: "", respiratory_rate: "",
    systolic_bp: "", diastolic_bp: "", oxygen_saturation: "",
    weight_kg: "", height_cm: "", pain_level: "",
    chief_complaint: "", allergies: "", pregnancy_status: "",
    notes: "", triage: "normal", doctor_id: "",
  });

  // Reset form when selection changes
  useEffect(() => {
    if (selectedVisit && selectedPatient) {
      setV((s) => ({
        ...s,
        chief_complaint: selectedVisit.chief_complaint ?? selectedVisit.reason ?? "",
        allergies: selectedPatient.allergies ?? "",
        triage: selectedVisit.triage_level === "emergent" ? "emergency" : selectedVisit.triage_level === "urgent" ? "urgent" : "normal",
      }));
    }
  }, [selectedQid, selectedVisit?.id, selectedPatient?.id]);

  const bmi = useMemo(() => {
    const w = Number(v.weight_kg), h = Number(v.height_cm) / 100;
    if (!w || !h) return null;
    return (w / (h * h)).toFixed(1);
  }, [v.weight_kg, v.height_cm]);

  const num = (s: string) => s === "" ? null : Number(s);

  const saveVitals = useMutation({
    mutationFn: async () => {
      if (!selectedVisit) throw new Error("No patient selected");
      const { error } = await supabase.from("vitals" as never).insert({
        visit_id: selectedVisit.id, patient_id: selectedVisit.patient_id, captured_by: user!.id,
        temperature_c: num(v.temperature_c), heart_rate: num(v.heart_rate), respiratory_rate: num(v.respiratory_rate),
        systolic_bp: num(v.systolic_bp), diastolic_bp: num(v.diastolic_bp),
        oxygen_saturation: num(v.oxygen_saturation),
        weight_kg: num(v.weight_kg), height_cm: num(v.height_cm), pain_level: num(v.pain_level),
        notes: v.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Vitals saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const triageMap: Record<string, string> = { emergency: "emergent", urgent: "urgent", normal: "routine" };

  const sendToDoctor = useMutation({
    mutationFn: async () => {
      if (!selectedVisit || !selectedEntry) throw new Error("No patient selected");
      if (!v.doctor_id) throw new Error("Assign a doctor first");
      // Save final vitals snapshot too
      if (v.systolic_bp || v.heart_rate || v.temperature_c) {
        await supabase.from("vitals" as never).insert({
          visit_id: selectedVisit.id, patient_id: selectedVisit.patient_id, captured_by: user!.id,
          temperature_c: num(v.temperature_c), heart_rate: num(v.heart_rate), respiratory_rate: num(v.respiratory_rate),
          systolic_bp: num(v.systolic_bp), diastolic_bp: num(v.diastolic_bp),
          oxygen_saturation: num(v.oxygen_saturation),
          weight_kg: num(v.weight_kg), height_cm: num(v.height_cm), pain_level: num(v.pain_level),
          notes: v.notes || null,
        } as never);
      }
      // Update visit: triage, assigned doctor, stage
      const triageLevel = triageMap[v.triage] ?? "routine";
      const stage = v.triage === "emergency" ? "emergency" : "waiting_for_doctor";
      const { error: ve } = await supabase.from("visits" as never).update({
        triage_level: triageLevel, assigned_doctor_id: v.doctor_id,
        assigned_nurse_id: user!.id, current_stage: stage, chief_complaint: v.chief_complaint || null,
        status: "in_progress",
      } as never).eq("id", selectedVisit.id);
      if (ve) throw ve;
      // Update patient allergies if changed
      if (v.allergies && v.allergies !== (selectedPatient?.allergies ?? "")) {
        await supabase.from("patients" as never).update({ allergies: v.allergies } as never).eq("id", selectedVisit.patient_id);
      }
      // Mark triage queue served
      const { error: qe } = await supabase.from("visit_queue" as never)
        .update({ served_at: new Date().toISOString(), served_by: user!.id } as never)
        .eq("id", selectedEntry.id);
      if (qe) throw qe;
      // Add to doctor queue
      const docPriority = v.triage === "emergency" ? 1 : v.triage === "urgent" ? 2 : 3;
      await supabase.from("visit_queue" as never).insert({
        visit_id: selectedVisit.id, queue_type: "doctor", priority: docPriority,
      } as never);
      // Stage marker
      await supabase.from("visit_stages" as never).insert({
        visit_id: selectedVisit.id, stage, by_user: user!.id,
      } as never).then(() => null, () => null);
    },
    onSuccess: () => {
      setSelectedQid(null);
      qc.invalidateQueries({ queryKey: ["nurse-queue"] });
      qc.invalidateQueries({ queryKey: ["nurse-visits"] });
      toast.success("Patient sent to doctor");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markEmergency = () => setV((s) => ({ ...s, triage: "emergency" }));

  const elapsed = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
  };

  return (
    <div className="grid h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[360px_1fr]">
      {/* LEFT: Queue */}
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <div className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-primary" />Triage queue</div>
            <div className="text-xs text-muted-foreground">{queue.data?.length ?? 0} waiting</div>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {(queue.data?.length ?? 0) === 0 && <div className="p-4 text-sm text-muted-foreground">Queue is empty.</div>}
          {queue.data?.map((q, idx) => {
            const vis = visits.data?.find((x) => x.id === q.visit_id);
            const pat = patients.data?.find((p) => p.id === vis?.patient_id);
            const active = q.id === selectedQid;
            return (
              <button
                key={q.id}
                onClick={() => setSelectedQid(q.id)}
                className={`flex w-full flex-col gap-1 border-l-4 border-b p-3 text-left text-sm transition ${
                  active ? "bg-accent border-l-primary" : "border-l-transparent hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">#{idx + 1}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${PRIO_COLOR[q.priority] ?? PRIO_COLOR[3]}`}>
                    {PRIO_LABEL[q.priority] ?? "Normal"}
                  </span>
                </div>
                <div className="font-medium">{pat?.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {ageOf(pat?.date_of_birth ?? null)} · {pat?.gender ?? "—"} · waited {elapsed(q.entered_at)}
                </div>
                {vis?.reason && <div className="line-clamp-1 text-xs">{vis.reason}</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* CENTER: Patient + vitals */}
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
        {!selectedPatient ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a patient from the queue to begin triage.
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-auto">
            {/* Patient header */}
            <div className="flex items-center gap-4 border-b bg-muted/30 p-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {selectedPatient.full_name.split(" ").map((n) => n[0]).slice(0,2).join("")}
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold">{selectedPatient.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  MRN {selectedPatient.medical_record_number ?? "—"} · {ageOf(selectedPatient.date_of_birth)} · {selectedPatient.gender ?? "—"}
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={markEmergency}>
                <AlertTriangle className="h-4 w-4" /> Mark Emergency
              </Button>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {/* Vitals */}
              <section className="space-y-3 rounded-lg border bg-background p-4">
                <div className="flex items-center gap-2 font-medium"><HeartPulse className="h-4 w-4 text-rose-500" />Vital signs</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Temperature (°C)" value={v.temperature_c} onChange={(x) => setV({ ...v, temperature_c: x })} />
                  <Field label="Pulse (bpm)" value={v.heart_rate} onChange={(x) => setV({ ...v, heart_rate: x })} />
                  <Field label="Resp. rate" value={v.respiratory_rate} onChange={(x) => setV({ ...v, respiratory_rate: x })} />
                  <Field label="SpO₂ (%)" value={v.oxygen_saturation} onChange={(x) => setV({ ...v, oxygen_saturation: x })} />
                  <Field label="BP systolic" value={v.systolic_bp} onChange={(x) => setV({ ...v, systolic_bp: x })} />
                  <Field label="BP diastolic" value={v.diastolic_bp} onChange={(x) => setV({ ...v, diastolic_bp: x })} />
                  <Field label="Weight (kg)" value={v.weight_kg} onChange={(x) => setV({ ...v, weight_kg: x })} />
                  <Field label="Height (cm)" value={v.height_cm} onChange={(x) => setV({ ...v, height_cm: x })} />
                  <div>
                    <Label className="text-xs">BMI</Label>
                    <div className="mt-1 flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-mono">{bmi ?? "—"}</div>
                  </div>
                </div>
              </section>

              {/* Symptoms */}
              <section className="space-y-3 rounded-lg border bg-background p-4">
                <div className="font-medium">Symptoms & history</div>
                <div className="space-y-2 text-sm">
                  <div>
                    <Label className="text-xs">Chief complaint</Label>
                    <Textarea rows={2} value={v.chief_complaint} onChange={(e) => setV({ ...v, chief_complaint: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Pain score (0–10)" value={v.pain_level} onChange={(x) => setV({ ...v, pain_level: x })} />
                    <div>
                      <Label className="text-xs">Pregnancy</Label>
                      <Select value={v.pregnancy_status} onValueChange={(x) => setV({ ...v, pregnancy_status: x })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="N/A" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="na">N/A</SelectItem>
                          <SelectItem value="not_pregnant">Not pregnant</SelectItem>
                          <SelectItem value="pregnant">Pregnant</SelectItem>
                          <SelectItem value="unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Allergies</Label>
                    <Input value={v.allergies} onChange={(e) => setV({ ...v, allergies: e.target.value })} placeholder="e.g. penicillin" />
                  </div>
                  <div>
                    <Label className="text-xs">Triage notes</Label>
                    <Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
                  </div>
                </div>
              </section>

              {/* Triage + assign */}
              <section className="space-y-3 rounded-lg border bg-background p-4 lg:col-span-2">
                <div className="flex items-center gap-2 font-medium"><Stethoscope className="h-4 w-4 text-primary" />Triage & assignment</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Priority</Label>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      {(["emergency","urgent","normal"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setV({ ...v, triage: t })}
                          className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition ${
                            v.triage === t
                              ? t === "emergency" ? "border-rose-500 bg-rose-500/10 text-rose-700"
                                : t === "urgent" ? "border-amber-500 bg-amber-500/10 text-amber-700"
                                : "border-sky-500 bg-sky-500/10 text-sky-700"
                              : "border-border bg-background hover:bg-accent"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Assign to doctor</Label>
                    <Select value={v.doctor_id} onValueChange={(x) => setV({ ...v, doctor_id: x })}>
                      <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                      <SelectContent>
                        {doctors.data?.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.full_name ?? "Doctor"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => saveVitals.mutate()} disabled={saveVitals.isPending}>
                    Save vitals
                  </Button>
                  <Button onClick={() => sendToDoctor.mutate()} disabled={sendToDoctor.isPending || !v.doctor_id}>
                    Send to Doctor →
                  </Button>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step="0.1" value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
    </div>
  );
}
