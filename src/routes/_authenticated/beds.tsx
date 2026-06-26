import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BedDouble, Plus, ArrowRightLeft, LogOut as LogOutIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/beds")({
  component: () => <RoleGate path="/beds"><BedsPage /></RoleGate>,
});

interface Ward { id: string; name: string; code: string | null; department: string | null }
interface Bed { id: string; ward_id: string; code: string; status: string }
interface Patient { id: string; full_name: string; medical_record_number: string | null }
interface Admission { id: string; patient_id: string; bed_id: string | null; admitted_at: string; status: string; admission_reason: string | null }

function BedsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [wardOpen, setWardOpen] = useState(false);
  const [wardForm, setWardForm] = useState({ name: "", code: "", department: "" });
  const [bedOpen, setBedOpen] = useState(false);
  const [bedForm, setBedForm] = useState({ ward_id: "", code: "" });
  const [admOpen, setAdmOpen] = useState(false);
  const [admForm, setAdmForm] = useState({ patient_id: "", bed_id: "", reason: "" });
  const [transferFor, setTransferFor] = useState<Admission | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [search, setSearch] = useState("");

  const wards = useQuery({ queryKey:["wards"], queryFn: async () => {
    const { data } = await supabase.from("wards" as never).select("*").order("name");
    return (data as unknown as Ward[]) ?? [];
  }});
  const beds = useQuery({ queryKey:["beds"], queryFn: async () => {
    const { data } = await supabase.from("beds" as never).select("*").order("code");
    return (data as unknown as Bed[]) ?? [];
  }});
  const admissions = useQuery({ queryKey:["admissions"], queryFn: async () => {
    const { data } = await supabase.from("admissions" as never).select("*").eq("status","active").order("admitted_at",{ ascending: false });
    return (data as unknown as Admission[]) ?? [];
  }});
  const pIds = Array.from(new Set((admissions.data ?? []).map(a => a.patient_id)));
  const admPatients = useQuery({ queryKey:["adm-patients", pIds.join(",")], enabled: pIds.length>0, queryFn: async () => {
    const { data } = await supabase.from("patients" as never).select("id, full_name, medical_record_number").in("id", pIds as never);
    return (data as unknown as Patient[]) ?? [];
  }});
  const patientSearch = useQuery({ queryKey:["adm-psearch", search], enabled: search.trim().length>=2, queryFn: async () => {
    const { data } = await supabase.from("patients" as never).select("id, full_name, medical_record_number")
      .or(`full_name.ilike.%${search}%,medical_record_number.ilike.%${search}%`).limit(10);
    return (data as unknown as Patient[]) ?? [];
  }});

  const createWard = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("wards" as never).insert({ name: wardForm.name, code: wardForm.code || null, department: wardForm.department || null } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ward created"); setWardOpen(false); setWardForm({name:"",code:"",department:""}); qc.invalidateQueries({queryKey:["wards"]}); },
    onError: (e: Error) => toast.error(e.message),
  });
  const createBed = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("beds" as never).insert({ ward_id: bedForm.ward_id, code: bedForm.code } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bed added"); setBedOpen(false); setBedForm({ward_id:"",code:""}); qc.invalidateQueries({queryKey:["beds"]}); },
    onError: (e: Error) => toast.error(e.message),
  });
  const admit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("admissions" as never).insert({
        patient_id: admForm.patient_id, bed_id: admForm.bed_id, admission_reason: admForm.reason || null, admitted_by: user?.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Patient admitted"); setAdmOpen(false); setAdmForm({patient_id:"",bed_id:"",reason:""}); setSearch("");
      qc.invalidateQueries({queryKey:["admissions"]}); qc.invalidateQueries({queryKey:["beds"]}); },
    onError: (e: Error) => toast.error(e.message),
  });
  const discharge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admissions" as never).update({ status:"discharged", discharged_at: new Date().toISOString(), discharged_by: user?.id } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Discharged"); qc.invalidateQueries({queryKey:["admissions"]}); qc.invalidateQueries({queryKey:["beds"]}); },
    onError: (e: Error) => toast.error(e.message),
  });
  const transfer = useMutation({
    mutationFn: async () => {
      if (!transferFor) return;
      const { error: ie } = await supabase.from("bed_transfers" as never).insert({
        admission_id: transferFor.id, from_bed_id: transferFor.bed_id, to_bed_id: transferTo, transferred_by: user?.id,
      } as never);
      if (ie) throw ie;
      const { error } = await supabase.from("admissions" as never).update({ bed_id: transferTo } as never).eq("id", transferFor.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transferred"); setTransferFor(null); setTransferTo("");
      qc.invalidateQueries({queryKey:["admissions"]}); qc.invalidateQueries({queryKey:["beds"]}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const freeBeds = (beds.data ?? []).filter(b => b.status === "free");
  const bedByWard = (wid: string) => (beds.data ?? []).filter(b => b.ward_id === wid);
  const admByBed = (bid: string) => admissions.data?.find(a => a.bed_id === bid);
  const pName = (id: string) => admPatients.data?.find(p => p.id === id)?.full_name ?? id.slice(0,8);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><BedDouble className="h-6 w-6"/> Wards & beds</h1>
          <p className="text-sm text-muted-foreground">Admit, transfer, discharge inpatients.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={wardOpen} onOpenChange={setWardOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4"/>Ward</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New ward</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Name</Label><Input value={wardForm.name} onChange={e=>setWardForm(f=>({...f,name:e.target.value}))} /></div>
                <div><Label>Code</Label><Input value={wardForm.code} onChange={e=>setWardForm(f=>({...f,code:e.target.value}))} /></div>
                <div><Label>Department</Label><Input value={wardForm.department} onChange={e=>setWardForm(f=>({...f,department:e.target.value}))} /></div>
              </div>
              <DialogFooter><Button onClick={()=>createWard.mutate()} disabled={!wardForm.name}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={bedOpen} onOpenChange={setBedOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4"/>Bed</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New bed</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Ward</Label>
                  <Select value={bedForm.ward_id} onValueChange={v=>setBedForm(f=>({...f,ward_id:v}))}>
                    <SelectTrigger><SelectValue placeholder="Choose ward"/></SelectTrigger>
                    <SelectContent>{(wards.data??[]).map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Code</Label><Input value={bedForm.code} onChange={e=>setBedForm(f=>({...f,code:e.target.value}))} placeholder="e.g. A-01"/></div>
              </div>
              <DialogFooter><Button onClick={()=>createBed.mutate()} disabled={!bedForm.ward_id || !bedForm.code}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={admOpen} onOpenChange={setAdmOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4"/>Admit</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Admit patient</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Search patient</Label>
                  <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or MRN"/>
                  <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {(patientSearch.data ?? []).map(p => (
                      <button key={p.id} type="button"
                        onClick={()=>{setAdmForm(f=>({...f,patient_id:p.id})); setSearch(p.full_name);}}
                        className={`block w-full rounded border p-2 text-left text-sm ${admForm.patient_id===p.id?"bg-primary/10":""}`}>
                        {p.full_name} <span className="text-muted-foreground">· {p.medical_record_number ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div><Label>Bed</Label>
                  <Select value={admForm.bed_id} onValueChange={v=>setAdmForm(f=>({...f,bed_id:v}))}>
                    <SelectTrigger><SelectValue placeholder="Choose free bed"/></SelectTrigger>
                    <SelectContent>{freeBeds.map(b=>{
                      const w = wards.data?.find(w=>w.id===b.ward_id);
                      return <SelectItem key={b.id} value={b.id}>{w?.name} · {b.code}</SelectItem>;
                    })}</SelectContent>
                  </Select>
                </div>
                <div><Label>Reason</Label><Input value={admForm.reason} onChange={e=>setAdmForm(f=>({...f,reason:e.target.value}))}/></div>
              </div>
              <DialogFooter><Button onClick={()=>admit.mutate()} disabled={!admForm.patient_id || !admForm.bed_id}>Admit</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(wards.data ?? []).map(w => {
          const wb = bedByWard(w.id);
          const occ = wb.filter(b=>b.status==="occupied").length;
          return (
            <Card key={w.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{w.name}</span>
                  <span className="text-sm text-muted-foreground">{occ}/{wb.length} occupied</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {wb.map(b => {
                    const a = admByBed(b.id);
                    const color = b.status==="occupied"?"bg-rose-100 border-rose-300":b.status==="cleaning"?"bg-amber-100 border-amber-300":b.status==="blocked"?"bg-stone-200 border-stone-400":"bg-emerald-50 border-emerald-300";
                    return (
                      <div key={b.id} className={`rounded border p-2 text-center text-xs ${color}`}>
                        <div className="font-semibold">{b.code}</div>
                        <div className="capitalize text-muted-foreground">{b.status}</div>
                        {a && (
                          <>
                            <div className="mt-1 truncate" title={pName(a.patient_id)}>{pName(a.patient_id)}</div>
                            <div className="mt-1 flex gap-1">
                              <Button size="sm" variant="ghost" className="h-6 px-1" title="Transfer" onClick={()=>setTransferFor(a)}><ArrowRightLeft className="h-3 w-3"/></Button>
                              <Button size="sm" variant="ghost" className="h-6 px-1" title="Discharge" onClick={()=>discharge.mutate(a.id)}><LogOutIcon className="h-3 w-3"/></Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {wb.length === 0 && <p className="col-span-4 text-xs text-muted-foreground">No beds — add some.</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(wards.data ?? []).length===0 && <p className="text-sm text-muted-foreground">No wards yet. Create one to get started.</p>}
      </div>

      <Dialog open={!!transferFor} onOpenChange={(o)=>{ if (!o) { setTransferFor(null); setTransferTo(""); }}}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer {transferFor && pName(transferFor.patient_id)}</DialogTitle></DialogHeader>
          <Select value={transferTo} onValueChange={setTransferTo}>
            <SelectTrigger><SelectValue placeholder="Choose free bed"/></SelectTrigger>
            <SelectContent>{freeBeds.map(b=>{ const w = wards.data?.find(w=>w.id===b.ward_id); return <SelectItem key={b.id} value={b.id}>{w?.name} · {b.code}</SelectItem>; })}</SelectContent>
          </Select>
          <DialogFooter><Button disabled={!transferTo} onClick={()=>transfer.mutate()}>Transfer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
