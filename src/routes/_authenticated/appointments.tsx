import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/appointments")({ component: AppointmentsPage });

interface Appointment {
  id: string; patient_id: string; doctor_id: string | null; scheduled_at: string;
  reason: string | null; status: string; notes: string | null; visit_id: string | null;
}
interface Patient { id: string; full_name: string }
interface Doctor { id: string; full_name: string | null; role: string }

function AppointmentsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient_id: "", doctor_id: "", scheduled_at: "", reason: "" });

  const appts = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("appointments" as never).select("*").order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as Appointment[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["appt-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name").order("full_name");
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });
  const doctors = useQuery({
    queryKey: ["appt-doctors"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_messageable_users" as never);
      if (error) throw error;
      return ((data as unknown as Doctor[]) ?? []).filter((u) => u.role === "doctor");
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.patient_id || !form.scheduled_at) throw new Error("Patient and time required");
      const { error } = await supabase.from("appointments" as never).insert({
        patient_id: form.patient_id,
        doctor_id: form.doctor_id || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        reason: form.reason || null,
        created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false); setForm({ patient_id: "", doctor_id: "", scheduled_at: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment booked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("appointments" as never).update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appointments"] }); toast.success("Updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";
  const doctorName = (id: string | null) => id ? doctors.data?.find((d) => d.id === id)?.full_name ?? "—" : "Any";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><CalendarClock className="h-6 w-6 text-primary" /> Appointments</h1>
          <p className="text-sm text-muted-foreground">Book and manage patient appointments.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" />New appointment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Book appointment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Patient</Label>
                <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Doctor (optional)</Label>
                <Select value={form.doctor_id} onValueChange={(v) => setForm({ ...form, doctor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Any available doctor" /></SelectTrigger>
                  <SelectContent>
                    {doctors.data?.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name ?? "Doctor"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date & time</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
              <div><Label>Reason</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>Book</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b p-3 font-medium">Upcoming & recent</div>
        <div className="divide-y">
          {appts.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No appointments.</div>}
          {appts.data?.map((a) => (
            <div key={a.id} className="grid grid-cols-12 items-center gap-2 p-3 text-sm">
              <div className="col-span-3 font-medium">{patientName(a.patient_id)}</div>
              <div className="col-span-3 text-muted-foreground">{new Date(a.scheduled_at).toLocaleString()}</div>
              <div className="col-span-2">{doctorName(a.doctor_id)}</div>
              <div className="col-span-2">
                <span className={`rounded px-2 py-0.5 text-xs ${
                  a.status === "checked_in" ? "bg-blue-500/10 text-blue-700" :
                  a.status === "cancelled" ? "bg-rose-500/10 text-rose-700" :
                  a.status === "no_show" ? "bg-amber-500/10 text-amber-700" :
                  "bg-muted text-muted-foreground"
                }`}>{a.status}</span>
              </div>
              <div className="col-span-2 flex justify-end gap-1">
                {a.status === "booked" && <>
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: a.id, status: "checked_in" })}>Check in</Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: a.id, status: "cancelled" })}>Cancel</Button>
                </>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
