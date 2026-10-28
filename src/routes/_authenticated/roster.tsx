import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFacility } from "@/components/facility-context";
import { requireBranchRecord } from "@/lib/hr-facility-rules";
import { requireFacilityId } from "@/lib/facility-filter";
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
  head: () => ({ meta: [{ title: "Roster — Litu Vault" }, { name: "description", content: "Roster workspace in Litu Vault, scoped to your active facility." }, { property: "og:title", content: "Roster — Litu Vault" }, { property: "og:description", content: "Roster workspace in Litu Vault, scoped to your active facility." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <RoleGate path="/roster"><RosterPage /></RoleGate>,
});

interface Shift { id: string; name: string; department: string | null; starts_at: string; ends_at: string }
interface Assignment { id: string; shift_id: string; user_id: string; role: string | null; status: string }
interface Staff { id: string; full_name: string; role?: string }

const fmt = (s: string) => new Date(s).toLocaleString("en-GB");

function RosterPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeFacility, loading: facilityLoading, error: facilityError, refresh } = useFacility();
  const ready = !!user && !facilityLoading && !facilityError;
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ name:"", department:"", starts_at:"", ends_at:"" });
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ shift_id:"", user_id:"", role:"" });
  const [conflicts, setConflicts] = useState<{kind:string;label:string;starts_at:string;ends_at:string}[]>([]);
  useEffect(() => {
    setShiftOpen(false); setAssignOpen(false); setConflicts([]);
    setShiftForm({name:"",department:"",starts_at:"",ends_at:""});
    setAssignForm({shift_id:"",user_id:"",role:""});
  }, [activeFacility.id]);

  const staff = useQuery({ queryKey:["roster-staff", activeFacility.id, user?.id], enabled: ready, queryFn: async () => {
    const { data, error } = await supabase.from("employees" as never).select("id,full_name").eq("facility_id", requireFacilityId(activeFacility.id)).order("full_name");
    if (error) throw new Error("Staff could not be loaded for this facility.");
    return (data ?? []) as Staff[];
  }});
  const shifts = useQuery({ queryKey:["shifts", activeFacility.id, user?.id], enabled: ready, queryFn: async () => {
    const { data, error } = await supabase.from("shifts" as never).select("*").eq("facility_id", requireFacilityId(activeFacility.id)).gte("ends_at", new Date().toISOString()).order("starts_at");
    if (error) throw new Error("Shifts could not be loaded for this facility.");
    return (data ?? []) as Shift[];
  }});
  const shiftIds = (shifts.data ?? []).map(s => s.id);
  const assigns = useQuery({ queryKey:["assigns", activeFacility.id, user?.id, shiftIds], enabled: ready && shifts.isSuccess, queryFn: async () => {
    if (!shiftIds.length) return [] as Assignment[];
    const { data, error } = await supabase.from("shift_assignments" as never).select("*").in("shift_id", shiftIds);
    if (error) throw new Error("Assignments could not be loaded for this facility.");
    return (data ?? []) as Assignment[];
  }});
  const nameOf = (id: string) => staff.data?.find(s=>s.id===id)?.full_name ?? id.slice(0,8);

  const createShift = useMutation({
    mutationFn: async () => {
      if (!ready || !user) throw new Error("Select an authorized facility first.");
      const { error } = await supabase.from("shifts" as never).insert({
        facility_id: requireFacilityId(activeFacility.id), name: shiftForm.name, department: shiftForm.department || null,
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
    requireBranchRecord(assignForm.user_id, staff.data ?? []);
    const { data, error } = await supabase.rpc("roster_conflicts" as never, { _user: assignForm.user_id, _starts: sh.starts_at, _ends: sh.ends_at } as never);
    if (error) { toast.error("Conflicts could not be checked."); return; }
    setConflicts((data as unknown as typeof conflicts) ?? []);
  }

  const assign = useMutation({
    mutationFn: async () => {
      if (!ready) throw new Error("Select an authorized facility first.");
      requireBranchRecord(assignForm.shift_id, shifts.data ?? []);
      requireBranchRecord(assignForm.user_id, staff.data ?? []);
      const { error } = await supabase.from("shift_assignments" as never).insert({
        shift_id: assignForm.shift_id, user_id: assignForm.user_id, role: assignForm.role || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assigned"); setAssignOpen(false); setConflicts([]); setAssignForm({shift_id:"",user_id:"",role:""}); qc.invalidateQueries({queryKey:["assigns"]}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignsByShift = (sid: string) => (assigns.data ?? []).filter(a=>a.shift_id===sid);

  if (facilityLoading) return <p role="status">Loading your facility…</p>;
  if (facilityError) return <div role="alert" className="space-y-3"><p>{facilityError}</p><Button onClick={refresh}>Retry</Button></div>;
  const queryError = staff.error ?? shifts.error ?? assigns.error;
  if (queryError) return <div role="alert" className="space-y-3"><p className="text-destructive">{queryError.message}</p><Button onClick={() => { void staff.refetch(); void shifts.refetch(); void assigns.refetch(); }}>Retry</Button></div>;
  if (staff.isPending || shifts.isPending || assigns.isPending) return <p role="status">Loading branch roster…</p>;

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
                <DialogFooter><Button onClick={()=>createShift.mutate()} disabled={createShift.isPending||!shiftForm.name||!shiftForm.starts_at||!shiftForm.ends_at}>Create</Button></DialogFooter>
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
                      <SelectContent>{(staff.data??[]).map(s=><SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
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
                <DialogFooter><Button onClick={()=>assign.mutate()} disabled={assign.isPending || !assignForm.shift_id || !assignForm.user_id}>Assign</Button></DialogFooter>
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
          <Button asChild variant="outline"><Link to="/hr/leave">Open leave requests</Link></Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
