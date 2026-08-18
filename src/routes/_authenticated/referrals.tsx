import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Send, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { generateReferralLetter } from "@/lib/referral-pdf";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({
    meta: [
      { title: "Referrals & consults — Litu Vault" },
      { name: "description", content: "Raise consult requests, track responses and print referral letters." },
      { property: "og:title", content: "Referrals & consults — Litu Vault" },
      { property: "og:description", content: "Raise consult requests, track responses and print referral letters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RoleGate path="/referrals"><ReferralsPage /></RoleGate>,
});

interface Referral {
  id: string; patient_id: string; visit_id: string | null;
  referred_by: string; referred_to: string | null;
  specialty: string; external_facility: string | null; urgency: string;
  reason: string; clinical_summary: string | null; investigations: string | null;
  current_medications: string | null; status: string; response: string | null;
  responded_at: string | null; created_at: string;
}
interface Patient { id: string; full_name: string; medical_record_number: string | null; date_of_birth: string | null; gender: string | null }
interface StaffUser { id: string; full_name: string; role: string }

const SPECIALTIES = [
  "General Surgery", "Internal Medicine", "Paediatrics", "Obstetrics & Gynaecology",
  "Orthopaedics", "Cardiology", "Neurology", "Nephrology", "Oncology", "ENT",
  "Ophthalmology", "Dermatology", "Psychiatry", "Urology", "Physiotherapy",
  "Nutrition & Dietetics", "Radiology", "Pathology", "Dental",
];

const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

function age(dob: string | null): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} yrs`;
}

/** Clinician roles that can receive an internal consult request. */
const CLINICIAN_ROLES = [
  "doctor", "consultant", "specialist", "surgeon", "radiologist",
  "physiotherapist", "nutritionist", "pharmacist", "dentist", "admin",
];

function ReferralsPage() {
  const qc = useQueryClient();
  const { user, profile, hasRole } = useAuth();
  // Nurses may only refer patients under their own care and never see the whole register.
  const nurseScoped = hasRole("nurse") && !hasRole("doctor") && !hasRole("admin");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    patient_id: "", specialty: SPECIALTIES[0], referred_to: "", external_facility: "",
    urgency: "routine", reason: "", clinical_summary: "", investigations: "", current_medications: "",
  });

  const patients = useQuery({
    queryKey: ["ref-patients"],
    queryFn: async () => {
      // patient_directory() excludes staff members who also hold a patient record.
      const { data, error } = await supabase.rpc("patient_directory" as never);
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });

  /** Patient ids on visits currently assigned to this nurse. */
  const myVisitPatients = useQuery({
    queryKey: ["ref-nurse-visits", user?.id],
    enabled: nurseScoped && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never)
        .select("patient_id").eq("assigned_nurse_id", user!.id);
      if (error) throw error;
      return new Set(((data as unknown as { patient_id: string }[]) ?? []).map((v) => v.patient_id));
    },
  });

  const staff = useQuery({
    queryKey: ["ref-staff"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_messageable_users" as never);
      return (data as unknown as StaffUser[]) ?? [];
    },
  });

  const referrals = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("referrals" as never)
        .select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data as unknown as Referral[]) ?? [];
    },
  });

  const referralTargets = useMemo(
    () => (staff.data ?? []).filter((s) => CLINICIAN_ROLES.includes(s.role)),
    [staff.data],
  );

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = patients.data ?? [];
    if (nurseScoped) {
      const allowed = myVisitPatients.data;
      base = allowed ? base.filter((p) => allowed.has(p.id)) : [];
    }
    if (!q) return base.slice(0, 25);
    return base.filter((p) =>
      p.full_name.toLowerCase().includes(q) || (p.medical_record_number ?? "").toLowerCase().includes(q),
    ).slice(0, 25);
  }, [patients.data, search, nurseScoped, myVisitPatients.data]);


  const patientById = (id: string) => patients.data?.find((p) => p.id === id);
  const staffName = (id: string | null) => (id ? staff.data?.find((s) => s.id === id)?.full_name ?? "—" : null);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.patient_id) throw new Error("Select a patient");
      if (!form.reason.trim()) throw new Error("A reason for referral is required");
      const { error } = await supabase.from("referrals" as never).insert({
        patient_id: form.patient_id,
        specialty: form.specialty,
        referred_to: form.referred_to || null,
        external_facility: form.external_facility || null,
        urgency: form.urgency,
        reason: form.reason,
        clinical_summary: form.clinical_summary || null,
        investigations: form.investigations || null,
        current_medications: form.current_medications || null,
        referred_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Referral sent");
      setForm({ ...form, patient_id: "", reason: "", clinical_summary: "", investigations: "", current_medications: "" });
      qc.invalidateQueries({ queryKey: ["referrals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respond = useMutation({
    mutationFn: async ({ id, response, status }: { id: string; response: string; status: string }) => {
      const { error } = await supabase.from("referrals" as never).update({
        response, status, responded_by: user!.id, responded_at: new Date().toISOString(),
      } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Response recorded"); qc.invalidateQueries({ queryKey: ["referrals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function printLetter(r: Referral) {
    const p = patientById(r.patient_id);
    const doc = await generateReferralLetter({
      patientName: p?.full_name ?? "Patient",
      mrn: p?.medical_record_number ?? null,
      age: age(p?.date_of_birth ?? null),
      gender: p?.gender ?? null,
      specialty: r.specialty,
      urgency: r.urgency,
      referredToName: staffName(r.referred_to),
      externalFacility: r.external_facility,
      reason: r.reason,
      clinicalSummary: r.clinical_summary,
      investigations: r.investigations,
      currentMedications: r.current_medications,
      referringClinician: profile?.full_name ?? "Attending clinician",
      date: new Date(r.created_at),
    });
    doc.save(`referral-${(p?.full_name ?? "patient").replace(/\s+/g, "-").toLowerCase()}.pdf`);
  }

  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const incoming = (referrals.data ?? []).filter((r) => r.referred_to === user?.id);
  const outgoing = (referrals.data ?? []).filter((r) => r.referred_by === user?.id);

  const card = (r: Referral, mode: "in" | "out") => {
    const p = patientById(r.patient_id);
    return (
      <div key={r.id} className="space-y-2 rounded-lg border bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">{p?.full_name ?? "Patient"} <span className="text-xs text-muted-foreground">{p?.medical_record_number ?? ""}</span></div>
            <div className="text-xs text-muted-foreground">
              {r.specialty} · {staffName(r.referred_to) ?? r.external_facility ?? "Unassigned"} · {dmy(r.created_at)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs capitalize ${
              r.urgency === "emergency" ? "bg-destructive/10 text-destructive"
                : r.urgency === "urgent" ? "bg-amber-500/10 text-amber-700" : "bg-muted"
            }`}>{r.urgency}</span>
            <span className={`rounded px-2 py-0.5 text-xs capitalize ${
              r.status === "accepted" ? "bg-green-500/10 text-green-700"
                : r.status === "declined" ? "bg-destructive/10 text-destructive"
                : r.status === "completed" ? "bg-blue-500/10 text-blue-700" : "bg-muted"
            }`}>{r.status}</span>
            <Button size="sm" variant="outline" onClick={() => printLetter(r)}>
              <FileText className="h-3.5 w-3.5" /> Letter
            </Button>
          </div>
        </div>
        <div className="text-xs"><span className="font-medium">Reason: </span>{r.reason}</div>
        {r.clinical_summary && <div className="text-xs text-muted-foreground">{r.clinical_summary}</div>}
        {r.response && (
          <div className="rounded border bg-muted/30 p-2 text-xs">
            <span className="font-medium">Consultant response: </span>{r.response}
            {r.responded_at && <span className="text-muted-foreground"> · {dmy(r.responded_at)}</span>}
          </div>
        )}
        {mode === "in" && r.status === "pending" && (
          <div className="space-y-2">
            <Textarea rows={2} placeholder="Your opinion and recommendations…"
              value={replyDraft[r.id] ?? ""}
              onChange={(e) => setReplyDraft({ ...replyDraft, [r.id]: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => respond.mutate({ id: r.id, response: replyDraft[r.id] ?? "", status: "accepted" })}>
                Accept & reply
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => respond.mutate({ id: r.id, response: replyDraft[r.id] ?? "", status: "completed" })}>
                Mark reviewed
              </Button>
              <Button size="sm" variant="ghost"
                onClick={() => respond.mutate({ id: r.id, response: replyDraft[r.id] ?? "", status: "declined" })}>
                Decline
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Share2 className="h-6 w-6 text-primary" /> Referrals & consult requests
        </h1>
        <p className="text-sm text-muted-foreground">Raise an internal consult or an external referral, track the reply, and print the referral letter.</p>
      </div>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">New referral</TabsTrigger>
          <TabsTrigger value="incoming">Incoming ({incoming.length})</TabsTrigger>
          <TabsTrigger value="outgoing">Sent ({outgoing.length})</TabsTrigger>
          <TabsTrigger value="all">All ({referrals.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <div className="space-y-2 rounded-lg border bg-card p-4">
              <Label>Patient</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or MRN…" />
              <div className="max-h-64 divide-y overflow-auto rounded border">
                {filteredPatients.map((p) => (
                  <button key={p.id} onClick={() => setForm({ ...form, patient_id: p.id })}
                    className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-muted ${form.patient_id === p.id ? "bg-primary/10" : ""}`}>
                    <div className="font-medium">{p.full_name}</div>
                    <div className="text-xs text-muted-foreground">{p.medical_record_number ?? "—"}</div>
                  </button>
                ))}
                {filteredPatients.length === 0 && <div className="p-2 text-xs text-muted-foreground">No matches.</div>}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Specialty</Label>
                  <select value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                    className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm">
                    {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Urgency</Label>
                  <select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                    className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm">
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
                <div>
                  <Label>Refer to (internal)</Label>
                  <select value={form.referred_to} onChange={(e) => setForm({ ...form, referred_to: e.target.value })}
                    className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm">
                    <option value="">— external / unassigned —</option>
                    {staff.data?.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>)}
                  </select>
                </div>
                <div>
                  <Label>External facility</Label>
                  <Input value={form.external_facility} onChange={(e) => setForm({ ...form, external_facility: e.target.value })}
                    placeholder="e.g. Kenyatta National Hospital" />
                </div>
              </div>
              <div><Label>Reason for referral</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
              <div><Label>Clinical summary</Label><Textarea rows={4} value={form.clinical_summary} onChange={(e) => setForm({ ...form, clinical_summary: e.target.value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Investigations to date</Label><Textarea rows={3} value={form.investigations} onChange={(e) => setForm({ ...form, investigations: e.target.value })} /></div>
                <div><Label>Current medications</Label><Textarea rows={3} value={form.current_medications} onChange={(e) => setForm({ ...form, current_medications: e.target.value })} /></div>
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                <Send className="h-4 w-4" /> Send referral
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="incoming" className="mt-4 space-y-3">
          {incoming.length === 0 && <div className="rounded border p-4 text-sm text-muted-foreground">No consult requests addressed to you.</div>}
          {incoming.map((r) => card(r, "in"))}
        </TabsContent>
        <TabsContent value="outgoing" className="mt-4 space-y-3">
          {outgoing.length === 0 && <div className="rounded border p-4 text-sm text-muted-foreground">You have not sent any referrals yet.</div>}
          {outgoing.map((r) => card(r, "out"))}
        </TabsContent>
        <TabsContent value="all" className="mt-4 space-y-3">
          {(referrals.data ?? []).map((r) => card(r, "out"))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
