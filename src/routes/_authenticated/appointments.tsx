import { createFileRoute, Link } from "@tanstack/react-router";
import { Pager, usePager } from "@/components/pager";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/appointments")({
  component: () => <RoleGate path="/appointments"><AppointmentsPage /></RoleGate>,
});

interface Appointment {
  id: string; patient_id: string; doctor_id: string | null; scheduled_at: string;
  reason: string | null; status: string; notes: string | null; visit_id: string | null;
  duration_minutes: number | null; department: string | null;
}
interface Patient { id: string; full_name: string }
interface Doctor { id: string; full_name: string | null; role: string }

const STATUS_COLOR: Record<string, string> = {
  booked: "bg-muted text-muted-foreground",
  checked_in: "bg-blue-500/10 text-blue-700",
  cancelled: "bg-rose-500/10 text-rose-700",
  no_show: "bg-amber-500/10 text-amber-700",
  completed: "bg-green-500/10 text-green-700",
};

function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0,0,0,0);
  const dow = x.getDay(); // 0 Sun..6 Sat — use Mon as week start
  const diff = (dow + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDay(d: Date) { return d.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" }); }

function AppointmentsPage() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canCheckIn = hasAnyRole(["receptionist", "nurse", "admin"]);
  const [view, setView] = useState<"week" | "day" | "list">("week");
  const [anchor, setAnchor] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState({ patient_id: "", doctor_id: "", scheduled_at: "", reason: "", duration: 20, department: "" });

  const appts = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("appointments" as never).select("*").order("scheduled_at");
      if (error) throw error;
        const pager = usePager(appts.data ?? [], 20);

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

  const save = useMutation({
    mutationFn: async () => {
      if (!form.patient_id || !form.scheduled_at) throw new Error("Patient and time required");
      const payload = {
        patient_id: form.patient_id,
        doctor_id: form.doctor_id || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        reason: form.reason || null,
        duration_minutes: Number(form.duration) || 20,
        department: form.department || null,
      };
      if (editing) {
        const { error } = await supabase.from("appointments" as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("appointments" as never).insert({ ...payload, created_by: user!.id } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setOpen(false); setEditing(null);
      setForm({ patient_id: "", doctor_id: "", scheduled_at: "", reason: "", duration: 20, department: "" });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(editing ? "Rescheduled" : "Booked");
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

  /** Check-in opens (or reuses) the consultation encounter and queues the patient for triage. */
  const checkIn = useMutation({
    mutationFn: async (a: Appointment) => {
      let visitId = a.visit_id;
      if (!visitId) {
        const { data: v, error: ve } = await supabase.from("visits" as never).insert({
          patient_id: a.patient_id,
          opened_by: user?.id ?? null,
          reason: a.reason ?? "Scheduled appointment",
          triage_level: "routine",
          status: "open",
        } as never).select("id").single();
        if (ve) throw ve;
        visitId = (v as { id: string }).id;
        await supabase.from("visit_queue" as never).insert({ visit_id: visitId, queue_type: "triage", priority: 3 } as never);
      }
      const { error } = await supabase.from("appointments" as never)
        .update({ status: "checked_in", visit_id: visitId } as never).eq("id", a.id);
      if (error) throw error;
      return visitId as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appointments"] }); toast.success("Checked in — consultation opened"); },
    onError: (e: Error) => toast.error(e.message),
  });


  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";
  const doctorName = (id: string | null) => id ? doctors.data?.find((d) => d.id === id)?.full_name ?? "—" : "Any";

  function openEdit(a: Appointment) {
    setEditing(a);
    const dt = new Date(a.scheduled_at);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setForm({
      patient_id: a.patient_id, doctor_id: a.doctor_id ?? "", scheduled_at: local,
      reason: a.reason ?? "", duration: a.duration_minutes ?? 20, department: a.department ?? "",
    });
    setOpen(true);
  }
  function openNew() {
    setEditing(null);
    setForm({ patient_id: "", doctor_id: "", scheduled_at: "", reason: "", duration: 20, department: "" });
    setOpen(true);
  }

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const apptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    (appts.data ?? []).forEach((a) => { const k = a.scheduled_at.slice(0, 10); (map[k] ??= []).push(a); });
    return map;
  }, [appts.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><CalendarClock className="h-6 w-6 text-primary" /> Appointments</h1>
          <p className="text-sm text-muted-foreground">Book, reschedule, and check in patients.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4" /> New appointment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Reschedule appointment" : "Book appointment"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Patient</Label>
                <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>{patients.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Doctor (optional)</Label>
                <Select value={form.doctor_id} onValueChange={(v) => setForm({ ...form, doctor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Any available doctor" /></SelectTrigger>
                  <SelectContent>{doctors.data?.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name ?? "Doctor"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Date & time</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
                <div><Label>Duration (min)</Label><Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} /></div>
              </div>
              <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>Reason</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>{editing ? "Save changes" : "Book"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as "week" | "day" | "list")}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, view === "day" ? -1 : -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>Today</Button>
            <Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, view === "day" ? 1 : 7))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <TabsContent value="week" className="mt-3">
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const list = apptsByDay[dayKey(d)] ?? [];
              const isToday = dayKey(d) === dayKey(new Date());
              return (
                <div key={d.toISOString()} className={`rounded-lg border bg-card ${isToday ? "border-primary" : ""}`}>
                  <div className="border-b p-2 text-xs font-medium">{fmtDay(d)}</div>
                  <div className="max-h-80 space-y-1 overflow-auto p-2">
                    {list.length === 0 && <div className="text-xs text-muted-foreground">—</div>}
                    {list.sort((a,b) => a.scheduled_at.localeCompare(b.scheduled_at)).map((a) => (
                      <button key={a.id} type="button" onClick={() => openEdit(a)} className="block w-full rounded border bg-background p-1.5 text-left text-xs hover:border-primary">
                        <div className="font-mono">{new Date(a.scheduled_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
                        <div className="truncate font-medium">{patientName(a.patient_id)}</div>
                        <span className={`mt-0.5 inline-block rounded px-1 py-0.5 text-[10px] ${STATUS_COLOR[a.status] ?? STATUS_COLOR.booked}`}>{a.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="day" className="mt-3">
          <DayAgenda
            day={anchor}
            items={apptsByDay[dayKey(anchor)] ?? []}
            patientName={patientName}
            doctorName={doctorName}
            onEdit={openEdit}
            onCheckIn={(a) => checkIn.mutate(a)}

            onStatus={(id, status) => setStatus.mutate({ id, status })}
            canCheckIn={canCheckIn}
          />
        </TabsContent>

        <TabsContent value="list" className="mt-3">
          <div className="rounded-lg border bg-card">
            <div className="divide-y">
              {pager.total === 0 && <div className="p-4 text-sm text-muted-foreground">No appointments.</div>}
              {pager.slice.map((a) => (
                <div key={a.id} className="grid grid-cols-12 items-center gap-2 p-3 text-sm">
                  <div className="col-span-3 font-medium">{patientName(a.patient_id)}</div>
                  <div className="col-span-3 text-muted-foreground">{new Date(a.scheduled_at).toLocaleString("en-GB")}</div>
                  <div className="col-span-2">{doctorName(a.doctor_id)}</div>
                  <div className="col-span-2"><span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[a.status] ?? STATUS_COLOR.booked}`}>{a.status}</span></div>
                  <div className="col-span-2 flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>Edit</Button>
                    {canCheckIn && a.status === "booked" && (
                      <Button size="sm" variant="outline" onClick={() => checkIn.mutate(a)} disabled={checkIn.isPending}>Check in</Button>
                    )}
                    {a.visit_id && (
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/visits/$visitId" params={{ visitId: a.visit_id }}>Open consultation</Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pager {...pager} label="appointments" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DayAgenda({ day, items, patientName, doctorName, onEdit, onStatus, onCheckIn, canCheckIn }: {
  day: Date; items: Appointment[]; patientName: (id: string) => string;
  doctorName: (id: string | null) => string;
  onEdit: (a: Appointment) => void; onStatus: (id: string, status: string) => void;
  onCheckIn: (a: Appointment) => void;
  canCheckIn: boolean;
}) {

  const hours = Array.from({ length: 12 }, (_, i) => 8 + i); // 8..19
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-3 font-medium">{fmtDay(day)}</div>
      <div className="divide-y">
        {hours.map((h) => {
          const slot = items.filter((a) => new Date(a.scheduled_at).getHours() === h);
          return (
            <div key={h} className="grid grid-cols-12 gap-2 p-2 text-sm">
              <div className="col-span-1 font-mono text-xs text-muted-foreground">{String(h).padStart(2,"0")}:00</div>
              <div className="col-span-11 space-y-1">
                {slot.length === 0 && <div className="text-xs text-muted-foreground">—</div>}
                {slot.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded border p-2">
                    <div>
                      <div className="font-medium">{patientName(a.patient_id)} <span className="text-xs text-muted-foreground">· {new Date(a.scheduled_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ({a.duration_minutes ?? 20}m)</span></div>
                      <div className="text-xs text-muted-foreground">{doctorName(a.doctor_id)}{a.reason ? ` · ${a.reason}` : ""}</div>
                    </div>
                    <div className="flex gap-1">
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[a.status] ?? STATUS_COLOR.booked}`}>{a.status}</span>
                      <Button size="sm" variant="ghost" onClick={() => onEdit(a)}>Edit</Button>
                      {canCheckIn && a.status === "booked" && <Button size="sm" variant="outline" onClick={() => onCheckIn(a)}>Check in</Button>}
                      {a.visit_id && (
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/visits/$visitId" params={{ visitId: a.visit_id }}>Open consultation</Link>
                        </Button>
                      )}

                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
