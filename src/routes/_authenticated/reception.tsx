import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck, UserPlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/reception")({ component: ReceptionPage });

interface Patient { id: string; full_name: string; phone: string | null; medical_record_number: string | null }
interface Appointment { id: string; patient_id: string; scheduled_at: string; status: string; reason: string | null; visit_id: string | null }
interface Visit { id: string; patient_id: string; current_stage: string | null; opened_at: string; status: string }

function ReceptionPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [walkOpen, setWalkOpen] = useState(false);
  const [walkForm, setWalkForm] = useState({ full_name: "", phone: "", reason: "" });
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
  const patients = useQuery({
    queryKey: ["recep-patients", search],
    queryFn: async () => {
      let q = supabase.from("patients" as never).select("id, full_name, phone, medical_record_number").order("full_name").limit(50);
      if (search) q = q.ilike("full_name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });
  const activeVisits = useQuery({
    queryKey: ["recep-visits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never).select("id, patient_id, current_stage, opened_at, status")
        .neq("status", "closed").order("opened_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });

  const checkIn = useMutation({
    mutationFn: async (a: Appointment) => {
      // open visit if not already
      let visitId = a.visit_id;
      if (!visitId) {
        const { data: v, error: ve } = await supabase.from("visits" as never).insert({
          patient_id: a.patient_id, opened_by: user!.id, reason: a.reason, status: "open", current_stage: "checked_in",
        } as never).select("id").single();
        if (ve) throw ve;
        visitId = (v as { id: string }).id;
      }
      await supabase.from("appointments" as never).update({ status: "checked_in", visit_id: visitId } as never).eq("id", a.id);
      await supabase.from("visit_queue" as never).insert({ visit_id: visitId, queue_type: "triage", priority: 3 } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recep-appts"] });
      qc.invalidateQueries({ queryKey: ["recep-visits"] });
      toast.success("Checked in & queued for triage");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const walkIn = useMutation({
    mutationFn: async () => {
      if (!walkForm.full_name) throw new Error("Name required");
      const { data: p, error: pe } = await supabase.from("patients" as never).insert({
        full_name: walkForm.full_name, phone: walkForm.phone || null, created_by: user!.id,
      } as never).select("id").single();
      if (pe) throw pe;
      const pid = (p as { id: string }).id;
      const { data: v, error: ve } = await supabase.from("visits" as never).insert({
        patient_id: pid, opened_by: user!.id, reason: walkForm.reason || "Walk-in", status: "open", current_stage: "checked_in",
      } as never).select("id").single();
      if (ve) throw ve;
      const vid = (v as { id: string }).id;
      await supabase.from("visit_queue" as never).insert({ visit_id: vid, queue_type: "triage", priority: 3 } as never);
    },
    onSuccess: () => {
      setWalkOpen(false); setWalkForm({ full_name: "", phone: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["recep-patients"] });
      qc.invalidateQueries({ queryKey: ["recep-visits"] });
      toast.success("Walk-in registered & queued");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bookInPatient = useMutation({
    mutationFn: async (p: Patient) => {
      const { data: v, error: ve } = await supabase.from("visits" as never).insert({
        patient_id: p.id, opened_by: user!.id, reason: "Walk-in", status: "open", current_stage: "checked_in",
      } as never).select("id").single();
      if (ve) throw ve;
      const vid = (v as { id: string }).id;
      await supabase.from("visit_queue" as never).insert({ visit_id: vid, queue_type: "triage", priority: 3 } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recep-visits"] });
      toast.success("Patient checked in & queued for triage");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? id.slice(0,8);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ClipboardCheck className="h-6 w-6 text-primary" /> Reception</h1>
          <p className="text-sm text-muted-foreground">Today's appointments, walk-ins, and active visits.</p>
        </div>
        <Dialog open={walkOpen} onOpenChange={setWalkOpen}>
          <DialogTrigger asChild><Button><UserPlus2 className="h-4 w-4" />Walk-in</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Register walk-in patient</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={walkForm.full_name} onChange={(e) => setWalkForm({ ...walkForm, full_name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={walkForm.phone} onChange={(e) => setWalkForm({ ...walkForm, phone: e.target.value })} /></div>
              <div><Label>Reason</Label><Input value={walkForm.reason} onChange={(e) => setWalkForm({ ...walkForm, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => walkIn.mutate()} disabled={walkIn.isPending}>Register & queue</Button></DialogFooter>
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
                  <div className="font-medium">{patientName(a.patient_id)}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.scheduled_at).toLocaleTimeString()} · {a.reason ?? "—"}</div>
                </div>
                <div>
                  {a.status === "booked" ? (
                    <Button size="sm" onClick={() => checkIn.mutate(a)}>Check in</Button>
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
              <Link key={v.id} to="/visits/$visitId" params={{ visitId: v.id }} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/50">
                <div>
                  <div className="font-medium">{patientName(v.patient_id)}</div>
                  <div className="text-xs text-muted-foreground">{v.current_stage ?? "—"} · {new Date(v.opened_at).toLocaleTimeString()}</div>
                </div>
                <span className="text-xs text-muted-foreground">Open →</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-3">
          <div className="font-medium">Patient search</div>
          <Input placeholder="Search by name or MRN..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
        <div className="divide-y">
          {patients.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No matching patients.</div>}
          {patients.data?.slice(0,20).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted/30">
              <div className="min-w-0">
                <div className="font-medium">{p.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{p.medical_record_number ?? "MRN pending"}</span>
                  {p.phone ? ` · ${p.phone}` : ""}
                </div>
              </div>
              <Button size="sm" onClick={() => bookInPatient.mutate(p)} disabled={bookInPatient.isPending}>
                <ClipboardCheck className="h-3.5 w-3.5" /> Book in
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
