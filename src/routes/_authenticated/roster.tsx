import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/roster")({
  component: () => <RoleGate path="/roster"><RosterPage /></RoleGate>,
});

interface Shift { id: string; name: string; department: string | null; starts_at: string; ends_at: string }
interface Assignment { id: string; shift_id: string; user_id: string; role: string | null; status: string }
interface Leave { id: string; user_id: string; starts_at: string; ends_at: string; kind: string; status: string; reason: string | null }
interface Staff { id: string; full_name: string; role: string }

const fmt = (s: string) => new Date(s).toLocaleString("en-GB");

function RosterPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ name:"", department:"", starts_at:"", ends_at:"" });
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ shift_id:"", user_id:"", role:"" });
  const [conflicts, setConflicts] = useState<{kind:string;label:string;starts_at:string;ends_at:string}[]>([]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ user_id:"", starts_at:"", ends_at:"", kind:"annual", reason:"" });

  const shifts = useQuery({ queryKey:["shifts"], queryFn: async () => {
    const { data } = await supabase.from("shifts" as never).select("*").gte("ends_at", new Date().toISOString()).order("starts_at");
    return (data as unknown as Shift[]) ?? [];
  }});
  const assigns = useQuery({ queryKey:["assigns"], queryFn: async () => {
    const { data } = await supabase.from("shift_assignments" as never).select("*");
    return (data as unknown as Assignment[]) ?? [];
  }});
  const leaves = useQuery({ queryKey:["leaves"], queryFn: async () => {
    const { data } = await supabase.from("leave_requests" as never).select("*").order("starts_at",{ ascending: false }).limit(50);
    return (data as unknown as Leave[]) ?? [];
  }});
  const staff = useQuery({ queryKey:["staff-msgable"], queryFn: async () => {
    const { data } = await supabase.rpc("list_messageable_users" as never);
    return (data as unknown as Staff[]) ?? [];
  }});
  const nameOf = (id: string) => staff.data?.find(s=>s.id===id)?.full_name ?? id.slice(0,8);

  const createShift = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shifts" as never).insert({
        name: shiftForm.name, department: shiftForm.department || null,
        starts_at: new Date(shiftForm.starts_at).toISOString(),
        ends_at: new Date(shiftForm.ends_at).toISOString(),
        created_by: user?.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Shift created"); setShiftOpen(false); setShiftForm({name:"",department:"",starts_at:"",ends_at:""}); qc.invalidateQueries({queryKey:["shifts"]}); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function checkConflicts() {
    if (!assignForm.user_id || !assignForm.shift_id) return;
    const sh = shifts.data?.find(s=>s.id===assignForm.shift_id);
    if (!sh) return;
    const { data } = await supabase.rpc("roster_conflicts" as never, { _user: assignForm.user_id, _starts: sh.starts_at, _ends: sh.ends_at } as never);
    setConflicts((data as unknown as typeof conflicts) ?? []);
  }

  const assign = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shift_assignments" as never).insert({
        shift_id: assignForm.shift_id, user_id: assignForm.user_id, role: assignForm.role || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assigned"); setAssignOpen(false); setConflicts([]); setAssignForm({shift_id:"",user_id:"",role:""}); qc.invalidateQueries({queryKey:["assigns"]}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createLeave = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leave_requests" as never).insert({
        user_id: leaveForm.user_id || user?.id, starts_at: new Date(leaveForm.starts_at).toISOString(),
        ends_at: new Date(leaveForm.ends_at).toISOString(), kind: leaveForm.kind, reason: leaveForm.reason || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Leave requested"); setLeaveOpen(false); setLeaveForm({user_id:"",starts_at:"",ends_at:"",kind:"annual",reason:""}); qc.invalidateQueries({queryKey:["leaves"]}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const decideLeave = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leave_requests" as never).update({ status, decided_by: user?.id, decided_at: new Date().toISOString() } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({queryKey:["leaves"]}); },
  });

  const assignsByShift = (sid: string) => (assigns.data ?? []).filter(a=>a.shift_id===sid);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold flex items-center gap-2"><CalendarDays className="h-6 w-6"/> Staff rostering</h1>
          <p className="text-sm text-muted-foreground">Plan shifts, assign staff, manage leave with conflict detection.</p></div>
      </div>

      <Tabs defaultValue="shifts">
        <TabsList>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
        </TabsList>

        <TabsContent value="shifts" className="space-y-4">
          <div className="flex gap-2">
            <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4"/>New shift</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New shift</DialogTitle></DialogHeader>
                <div className="grid gap-3">
                  <div><Label>Name</Label><Input value={shiftForm.name} onChange={e=>setShiftForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Night ER"/></div>
                  <div><Label>Department</Label><Input value={shiftForm.department} onChange={e=>setShiftForm(f=>({...f,department:e.target.value}))}/></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Starts</Label><Input type="datetime-local" value={shiftForm.starts_at} onChange={e=>setShiftForm(f=>({...f,starts_at:e.target.value}))}/></div>
                    <div><Label>Ends</Label><Input type="datetime-local" value={shiftForm.ends_at} onChange={e=>setShiftForm(f=>({...f,ends_at:e.target.value}))}/></div>
                  </div>
                </div>
                <DialogFooter><Button onClick={()=>createShift.mutate()} disabled={!shiftForm.name||!shiftForm.starts_at||!shiftForm.ends_at}>Create</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={assignOpen} onOpenChange={(o)=>{ setAssignOpen(o); if (!o) setConflicts([]); }}>
              <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="mr-1 h-4 w-4"/>Assign staff</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign to shift</DialogTitle></DialogHeader>
                <div className="grid gap-3">
                  <div><Label>Shift</Label>
                    <Select value={assignForm.shift_id} onValueChange={v=>{setAssignForm(f=>({...f,shift_id:v})); setConflicts([]);}}>
                      <SelectTrigger><SelectValue placeholder="Choose shift"/></SelectTrigger>
                      <SelectContent>{(shifts.data??[]).map(s=><SelectItem key={s.id} value={s.id}>{s.name} · {fmt(s.starts_at)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Staff</Label>
                    <Select value={assignForm.user_id} onValueChange={v=>{setAssignForm(f=>({...f,user_id:v})); setConflicts([]);}}>
                      <SelectTrigger><SelectValue placeholder="Choose staff"/></SelectTrigger>
                      <SelectContent>{(staff.data??[]).map(s=><SelectItem key={s.id} value={s.id}>{s.full_name} ({s.role})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Role</Label><Input value={assignForm.role} onChange={e=>setAssignForm(f=>({...f,role:e.target.value}))}/></div>
                  <Button variant="ghost" size="sm" onClick={checkConflicts} disabled={!assignForm.user_id || !assignForm.shift_id}>Check conflicts</Button>
                  {conflicts.length>0 && (
                    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                      <div className="flex items-center gap-1 font-medium text-amber-800"><AlertTriangle className="h-4 w-4"/>Conflicts:</div>
                      <ul className="ml-5 list-disc">
                        {conflicts.map((c,i)=><li key={i}>{c.kind}: {c.label} ({fmt(c.starts_at)} → {fmt(c.ends_at)})</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                <DialogFooter><Button onClick={()=>assign.mutate()} disabled={!assignForm.shift_id || !assignForm.user_id}>Assign</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {(shifts.data ?? []).map(s => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{s.name}{s.department?` · ${s.department}`:""}</CardTitle>
                  <p className="text-xs text-muted-foreground">{fmt(s.starts_at)} → {fmt(s.ends_at)}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {assignsByShift(s.id).map(a => (
                      <Badge key={a.id} variant="secondary">{nameOf(a.user_id)}{a.role?` · ${a.role}`:""}</Badge>
                    ))}
                    {assignsByShift(s.id).length===0 && <span className="text-xs text-muted-foreground">No assignments yet</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(shifts.data ?? []).length===0 && <p className="text-sm text-muted-foreground">No upcoming shifts.</p>}
          </div>
        </TabsContent>

        <TabsContent value="leave" className="space-y-4">
          <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4"/>Request leave</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Leave request</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Staff (leave empty for self)</Label>
                  <Select value={leaveForm.user_id} onValueChange={v=>setLeaveForm(f=>({...f,user_id:v}))}>
                    <SelectTrigger><SelectValue placeholder="Self"/></SelectTrigger>
                    <SelectContent>{(staff.data??[]).map(s=><SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>From</Label><Input type="datetime-local" value={leaveForm.starts_at} onChange={e=>setLeaveForm(f=>({...f,starts_at:e.target.value}))}/></div>
                  <div><Label>To</Label><Input type="datetime-local" value={leaveForm.ends_at} onChange={e=>setLeaveForm(f=>({...f,ends_at:e.target.value}))}/></div>
                </div>
                <div><Label>Kind</Label>
                  <Select value={leaveForm.kind} onValueChange={v=>setLeaveForm(f=>({...f,kind:v}))}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual</SelectItem><SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem><SelectItem value="study">Study</SelectItem><SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Reason</Label><Input value={leaveForm.reason} onChange={e=>setLeaveForm(f=>({...f,reason:e.target.value}))}/></div>
              </div>
              <DialogFooter><Button onClick={()=>createLeave.mutate()} disabled={!leaveForm.starts_at || !leaveForm.ends_at}>Submit</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="p-2">Staff</th><th>Kind</th><th>From</th><th>To</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {(leaves.data ?? []).map(l => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">{nameOf(l.user_id)}</td>
                      <td>{l.kind}</td><td>{fmt(l.starts_at)}</td><td>{fmt(l.ends_at)}</td>
                      <td><Badge variant={l.status==="approved"?"default":l.status==="denied"?"destructive":"secondary"}>{l.status}</Badge></td>
                      <td>{l.status==="pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={()=>decideLeave.mutate({id:l.id,status:"approved"})}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={()=>decideLeave.mutate({id:l.id,status:"denied"})}>Deny</Button>
                        </div>
                      )}</td>
                    </tr>
                  ))}
                  {(leaves.data ?? []).length===0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No leave requests.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
