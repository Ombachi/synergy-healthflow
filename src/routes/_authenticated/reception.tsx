import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck, UserPlus2, Search, IdCard, Phone, ShieldAlert, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { DuplicatePatientCheck } from "@/components/duplicate-patient-check";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/reception")({ component: ReceptionPage });


interface Patient { id: string; full_name: string; phone: string | null; medical_record_number: string | null; address: string | null }
interface Appointment { id: string; patient_id: string; scheduled_at: string; status: string; reason: string | null; visit_id: string | null }
interface Visit { id: string; patient_id: string; current_stage: string | null; opened_at: string; status: string }

const PAYMENT_METHODS = ["cash", "mpesa", "card", "insurance", "corporate"] as const;

function ReceptionPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

  const appts = useQuery({
    queryKey: ["recep-appts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("appointments" as never).select("*")
        .gte("scheduled_at", today.toISOString()).lt("scheduled_at", tomorrow.toISOString())
        .order("scheduled_at");
      if (error) throw error;
      return (data as unknown as Appointment[]) ?? [];
    },
  });

  // Search-only: only run when the user has typed at least 2 characters
  const patients = useQuery({
    queryKey: ["recep-patients", search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never)
        .select("id, full_name, phone, medical_record_number, address")
        .or(`full_name.ilike.%${search}%,medical_record_number.ilike.%${search}%`)
        .order("full_name").limit(20);
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });

  // For the appointments list, fetch only the names of patients in those appointments
  const apptPatientIds = Array.from(new Set((appts.data ?? []).map((a) => a.patient_id)));
  const apptPatients = useQuery({
    queryKey: ["recep-appt-patients", apptPatientIds.join(",")],
    enabled: apptPatientIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never)
        .select("id, full_name").in("id", apptPatientIds as never);
      return (data as unknown as { id: string; full_name: string }[]) ?? [];
    },
  });
  const apptPatientName = (id: string) => apptPatients.data?.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);

  const activeVisits = useQuery({
    queryKey: ["recep-visits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never).select("id, patient_id, current_stage, opened_at, status")
        .neq("status", "closed").order("opened_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });
  const visitPatientIds = Array.from(new Set((activeVisits.data ?? []).map((v) => v.patient_id)));
  const visitPatients = useQuery({
    queryKey: ["recep-visit-patients", visitPatientIds.join(",")],
    enabled: visitPatientIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never)
        .select("id, full_name").in("id", visitPatientIds as never);
      return (data as unknown as { id: string; full_name: string }[]) ?? [];
    },
  });
  const visitPatientName = (id: string) => visitPatients.data?.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);

  // Check-in dialog (also used for booking-in an existing patient)
  type CheckInPatient = { id: string; full_name: string };
  const [checkInForm, setCheckInForm] = useState<{
    appointment?: Appointment;
    patient?: CheckInPatient;
    reason: string;
    payment_method: string;
    payment_location: string;
    phone: string;
  } | null>(null);

  function openCheckIn(opts: { appointment?: Appointment; patient?: CheckInPatient; defaultReason?: string }) {
    setCheckInForm({
      appointment: opts.appointment,
      patient: opts.patient,
      reason: opts.defaultReason ?? opts.appointment?.reason ?? "",
      payment_method: "cash",
      payment_location: "",
      phone: "",
    });
  }

  const checkIn = useMutation({
    mutationFn: async () => {
      if (!checkInForm) return;
      const patientId = checkInForm.appointment?.patient_id ?? checkInForm.patient?.id;
      if (!patientId) throw new Error("No patient");

      // Update patient phone/address if provided
      const patchPatient: Record<string, unknown> = {};
      if (checkInForm.phone) patchPatient.phone = checkInForm.phone;
      if (checkInForm.payment_location) patchPatient.address = checkInForm.payment_location;
      if (Object.keys(patchPatient).length > 0) {
        await supabase.from("patients" as never).update(patchPatient as never).eq("id", patientId);
      }

      // Open a new visit (consultation is auto-billed by trigger)
      let visitId = checkInForm.appointment?.visit_id ?? null;
      if (!visitId) {
        const { data: v, error: ve } = await supabase.from("visits" as never).insert({
          patient_id: patientId,
          opened_by: user!.id,
          reason: checkInForm.reason || (checkInForm.appointment ? checkInForm.appointment.reason : "Walk-in"),
          status: "open",
          current_stage: "checked_in",
          payment_method: checkInForm.payment_method,
          payment_location: checkInForm.payment_location || null,
        } as never).select("id").single();
        if (ve) throw ve;
        visitId = (v as { id: string }).id;
      }
      if (checkInForm.appointment) {
        await supabase.from("appointments" as never)
          .update({ status: "checked_in", visit_id: visitId } as never)
          .eq("id", checkInForm.appointment.id);
      }
      await supabase.from("visit_queue" as never).insert({ visit_id: visitId, queue_type: "triage", priority: 3 } as never);
    },
    onSuccess: () => {
      setCheckInForm(null);
      qc.invalidateQueries({ queryKey: ["recep-appts"] });
      qc.invalidateQueries({ queryKey: ["recep-visits"] });
      toast.success("Checked in & queued for triage");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Walk-in / new patient registration — trimmed layout
  const EMPTY_REG = {
    // Identification
    full_name: "", date_of_birth: "", gender: "",
    // Contact
    phone: "", email: "", address: "",
    // Emergency contact
    emergency_contact_name: "", emergency_contact_phone: "",
  };
  const [walkOpen, setWalkOpen] = useState(false);
  const [walkForm, setWalkForm] = useState({ ...EMPTY_REG });
  const [createdMrn, setCreatedMrn] = useState<string | null>(null);

  const walkIn = useMutation({
    mutationFn: async () => {
      if (!walkForm.full_name.trim()) throw new Error("Full name is required");
      const { data: p, error: pe } = await supabase.from("patients" as never).insert({
        full_name: walkForm.full_name.trim(),
        date_of_birth: walkForm.date_of_birth || null,
        gender: walkForm.gender || null,
        phone: walkForm.phone || null,
        email: walkForm.email || null,
        address: walkForm.address || null,
        emergency_contact_name: walkForm.emergency_contact_name || null,
        emergency_contact_phone: walkForm.emergency_contact_phone || null,
        created_by: user!.id,
      } as never).select("id, medical_record_number").single();
      if (pe) throw pe;
      const pid = (p as { id: string }).id;
      const mrn = (p as { medical_record_number: string | null }).medical_record_number;
      const { data: v, error: ve } = await supabase.from("visits" as never).insert({
        patient_id: pid,
        opened_by: user!.id,
        reason: null,
        status: "open",
        current_stage: "checked_in",
        payment_method: "cash",
      } as never).select("id").single();
      if (ve) throw ve;
      const vid = (v as { id: string }).id;
      await supabase.from("visit_queue" as never).insert({ visit_id: vid, queue_type: "triage", priority: 3 } as never);
      return mrn;
    },
    onSuccess: (mrn) => {
      setCreatedMrn(mrn ?? null);
      setWalkForm({ ...EMPTY_REG });
      qc.invalidateQueries({ queryKey: ["recep-visits"] });
      toast.success(mrn ? `Registered · MRN ${mrn}` : "Registered & queued");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ClipboardCheck className="h-6 w-6 text-primary" /> Reception</h1>
          <p className="text-sm text-muted-foreground">Today's appointments, walk-ins, and active visits.</p>
        </div>
        <Dialog open={walkOpen} onOpenChange={(v) => { setWalkOpen(v); if (!v) setCreatedMrn(null); }}>
          <DialogTrigger asChild><Button><UserPlus2 className="h-4 w-4" />New patient</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Register new patient</DialogTitle>
              <p className="text-xs text-muted-foreground">MRN is generated automatically after registration (format LITU-YYYYMM-XX-###).</p>
            </DialogHeader>

            {createdMrn && (
              <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm">
                <div className="font-medium text-green-700">Patient registered</div>
                <div className="text-xs text-muted-foreground">MRN <span className="font-mono">{createdMrn}</span> · queued for triage.</div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setCreatedMrn(null); }}>Register another</Button>
                  <Button size="sm" onClick={() => { setCreatedMrn(null); setWalkOpen(false); }}>Done</Button>
                </div>
              </div>
            )}

            {!createdMrn && (
              <div className="space-y-5">
                {/* Section 1 · Identification */}
                <section className="rounded-md border">
                  <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                    <IdCard className="h-4 w-4 text-primary" /> 1 · Identification
                    <span className="ml-auto rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">MRN auto-generated</span>
                  </header>
                  <div className="grid grid-cols-12 gap-2 p-3">
                    <div className="col-span-6"><Label className="text-xs">Full name *</Label><Input value={walkForm.full_name} onChange={(e) => setWalkForm({ ...walkForm, full_name: e.target.value })} maxLength={120} /></div>
                    <div className="col-span-3"><Label className="text-xs">Date of birth</Label><Input type="date" value={walkForm.date_of_birth} onChange={(e) => setWalkForm({ ...walkForm, date_of_birth: e.target.value })} /></div>
                    <div className="col-span-3"><Label className="text-xs">Gender</Label>
                      <select className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" value={walkForm.gender} onChange={(e) => setWalkForm({ ...walkForm, gender: e.target.value })}>
                        <option value="">—</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Section 2 · Contact */}
                <section className="rounded-md border">
                  <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                    <Phone className="h-4 w-4 text-primary" /> 2 · Contact
                  </header>
                  <div className="grid grid-cols-12 gap-2 p-3">
                    <div className="col-span-4"><Label className="text-xs">Phone</Label><Input value={walkForm.phone} onChange={(e) => setWalkForm({ ...walkForm, phone: e.target.value })} maxLength={30} /></div>
                    <div className="col-span-4"><Label className="text-xs">Email</Label><Input type="email" value={walkForm.email} onChange={(e) => setWalkForm({ ...walkForm, email: e.target.value })} maxLength={255} /></div>
                    <div className="col-span-4"><Label className="text-xs">Residence (town/estate)</Label><Input value={walkForm.address} onChange={(e) => setWalkForm({ ...walkForm, address: e.target.value })} /></div>
                  </div>
                </section>

                {/* Section 3 · Emergency Contact */}
                <section className="rounded-md border">
                  <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                    <ShieldAlert className="h-4 w-4 text-primary" /> 3 · Emergency contact
                  </header>
                  <div className="grid grid-cols-12 gap-2 p-3">
                    <div className="col-span-7"><Label className="text-xs">Contact name</Label><Input value={walkForm.emergency_contact_name} onChange={(e) => setWalkForm({ ...walkForm, emergency_contact_name: e.target.value })} /></div>
                    <div className="col-span-5"><Label className="text-xs">Contact phone</Label><Input value={walkForm.emergency_contact_phone} onChange={(e) => setWalkForm({ ...walkForm, emergency_contact_phone: e.target.value })} /></div>
                  </div>
                </section>

                <DuplicatePatientCheck name={walkForm.full_name} phone={walkForm.phone} />
              </div>
            )}

            {!createdMrn && (
              <DialogFooter>
                <Button variant="outline" onClick={() => setWalkOpen(false)}>Cancel</Button>
                <Button onClick={() => walkIn.mutate()} disabled={walkIn.isPending || !walkForm.full_name.trim()}>Register & queue for triage</Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <div className="border-b p-3 font-medium">Today's appointments ({appts.data?.length ?? 0})</div>
          <div className="divide-y">
            {appts.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nothing scheduled.</div>}
            {appts.data?.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <div className="font-medium">{apptPatientName(a.patient_id)}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.scheduled_at).toLocaleTimeString()} · {a.reason ?? "—"}</div>
                </div>
                <div>
                  {a.status === "booked" ? (
                    <Button size="sm" onClick={() => openCheckIn({ appointment: a })}>Check in</Button>
                  ) : (
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-700">{a.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="border-b p-3 font-medium">Active visits</div>
          <div className="divide-y">
            {activeVisits.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No active visits.</div>}
            {activeVisits.data?.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <div className="font-medium">{visitPatientName(v.patient_id)}</div>
                  <div className="text-xs text-muted-foreground">{v.current_stage ?? "—"} · {new Date(v.opened_at).toLocaleTimeString()}</div>
                </div>
                <span className="text-xs text-muted-foreground">In progress</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <div className="font-medium">Patient search</div>
          <div className="relative max-w-xs">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by name or MRN..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-7" />
          </div>
        </div>
        <div className="divide-y">
          {search.trim().length < 2 ? (
            <div className="p-4 text-sm text-muted-foreground">Type at least 2 characters of the patient's name or MRN to search.</div>
          ) : patients.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Searching…</div>
          ) : (patients.data?.length ?? 0) === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No matching patients.</div>
          ) : (
            patients.data?.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/30">
                <div className="min-w-0">
                  <div className="font-medium">{p.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{p.medical_record_number ?? "MRN pending"}</span>
                    {p.phone ? ` · ${p.phone}` : ""}
                    {p.address ? ` · ${p.address}` : ""}
                  </div>
                </div>
                <Button size="sm" onClick={() => openCheckIn({ patient: { id: p.id, full_name: p.full_name }, defaultReason: "Walk-in" })}>
                  <ClipboardCheck className="h-3.5 w-3.5" /> Book in
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={!!checkInForm} onOpenChange={(v) => !v && setCheckInForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Check in {checkInForm?.appointment ? apptPatientName(checkInForm.appointment.patient_id) : checkInForm?.patient?.full_name ?? ""}
            </DialogTitle>
          </DialogHeader>
          {checkInForm && (
            <div className="space-y-3">
              <div><Label>Reason</Label><Textarea rows={2} value={checkInForm.reason} onChange={(e) => setCheckInForm({ ...checkInForm, reason: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Phone (update)</Label><Input value={checkInForm.phone} onChange={(e) => setCheckInForm({ ...checkInForm, phone: e.target.value })} placeholder="Leave blank to keep" /></div>
                <div><Label>Location / residence</Label><Input value={checkInForm.payment_location} onChange={(e) => setCheckInForm({ ...checkInForm, payment_location: e.target.value })} placeholder="Town, estate" /></div>
              </div>
              <div>
                <Label>Mode of payment</Label>
                <select className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" value={checkInForm.payment_method} onChange={(e) => setCheckInForm({ ...checkInForm, payment_method: e.target.value })}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">A consultation fee will be added to the invoice automatically.</p>
            </div>
          )}
          <DialogFooter><Button onClick={() => checkIn.mutate()} disabled={checkIn.isPending}>Check in & queue</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
