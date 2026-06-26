import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/preauth")({
  component: () => <RoleGate path="/preauth"><PreauthPage /></RoleGate>,
});

interface PA {
  id: string; patient_id: string; payer_id: string | null; procedure_name: string; procedure_code: string | null;
  clinical_justification: string | null; estimated_cost_cents: number | null; status: string;
  reference_number: string | null; approved_amount_cents: number | null; decision_notes: string | null; created_at: string;
}
interface Payer { id: string; name: string; requires_preauth: boolean }
interface Patient { id: string; full_name: string; medical_record_number: string | null }

const money = (c: number | null) => c==null ? "—" : `KES ${(c/100).toLocaleString()}`;

function PreauthPage() {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const isOfficer = roles.includes("insurance_officer") || roles.includes("admin");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient_id:"", payer_id:"", procedure_name:"", procedure_code:"", clinical_justification:"", estimated_cost_cents:"" });
  const [search, setSearch] = useState("");
  const [decide, setDecide] = useState<PA | null>(null);
  const [decision, setDecision] = useState({ status:"approved", reference_number:"", approved_amount_cents:"", decision_notes:"" });

  const list = useQuery({ queryKey:["preauths"], queryFn: async () => {
    const { data, error } = await supabase.from("preauth_requests" as never).select("*").order("created_at",{ ascending: false }).limit(100);
    if (error) throw error;
    return (data as unknown as PA[]) ?? [];
  }});
  const payers = useQuery({ queryKey:["payers-pa"], queryFn: async () => {
    const { data } = await supabase.from("insurance_payers" as never).select("id, name, requires_preauth").eq("active", true).order("name");
    return (data as unknown as Payer[]) ?? [];
  }});
  const ps = useQuery({ queryKey:["pa-search", search], enabled: search.trim().length>=2, queryFn: async () => {
    const { data } = await supabase.from("patients" as never).select("id, full_name, medical_record_number")
      .or(`full_name.ilike.%${search}%,medical_record_number.ilike.%${search}%`).limit(10);
    return (data as unknown as Patient[]) ?? [];
  }});
  const pIds = Array.from(new Set((list.data ?? []).map(p=>p.patient_id)));
  const pNames = useQuery({ queryKey:["pa-names", pIds.join(",")], enabled: pIds.length>0, queryFn: async () => {
    const { data } = await supabase.from("patients" as never).select("id, full_name").in("id", pIds as never);
    return (data as unknown as { id: string; full_name: string }[]) ?? [];
  }});
  const nameOf = (id: string) => pNames.data?.find(p=>p.id===id)?.full_name ?? id.slice(0,8);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("preauth_requests" as never).insert({
        patient_id: form.patient_id, payer_id: form.payer_id || null,
        procedure_name: form.procedure_name, procedure_code: form.procedure_code || null,
        clinical_justification: form.clinical_justification || null,
        estimated_cost_cents: form.estimated_cost_cents ? Math.round(Number(form.estimated_cost_cents)*100) : null,
        requested_by: user?.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pre-auth requested"); setOpen(false); setForm({ patient_id:"", payer_id:"", procedure_name:"", procedure_code:"", clinical_justification:"", estimated_cost_cents:"" }); setSearch(""); qc.invalidateQueries({queryKey:["preauths"]}); },
    onError: (e: Error) => toast.error(e.message),
  });
  const decideMut = useMutation({
    mutationFn: async () => {
      if (!decide) return;
      const { error } = await supabase.from("preauth_requests" as never).update({
        status: decision.status,
        reference_number: decision.reference_number || null,
        approved_amount_cents: decision.approved_amount_cents ? Math.round(Number(decision.approved_amount_cents)*100) : null,
        decision_notes: decision.decision_notes || null,
        decided_by: user?.id, decided_at: new Date().toISOString(),
      } as never).eq("id", decide.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Decision recorded"); setDecide(null); qc.invalidateQueries({queryKey:["preauths"]}); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldCheck className="h-6 w-6"/> Pre-authorization</h1>
          <p className="text-sm text-muted-foreground">Procedures requiring PA cannot be billed without an approved reference number.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4"/>Raise request</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New pre-authorization</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Search patient</Label>
                <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or MRN"/>
                <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                  {(ps.data ?? []).map(p => (
                    <button key={p.id} type="button" onClick={()=>{setForm(f=>({...f,patient_id:p.id})); setSearch(p.full_name);}}
                      className={`block w-full rounded border p-2 text-left text-sm ${form.patient_id===p.id?"bg-primary/10":""}`}>
                      {p.full_name} <span className="text-muted-foreground">· {p.medical_record_number ?? "—"}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div><Label>Payer</Label>
                <Select value={form.payer_id} onValueChange={v=>setForm(f=>({...f,payer_id:v}))}>
                  <SelectTrigger><SelectValue placeholder="Choose payer"/></SelectTrigger>
                  <SelectContent>{(payers.data??[]).map(p=><SelectItem key={p.id} value={p.id}>{p.name}{p.requires_preauth?" (PA required)":""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Procedure name</Label><Input value={form.procedure_name} onChange={e=>setForm(f=>({...f,procedure_name:e.target.value}))}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Procedure code</Label><Input value={form.procedure_code} onChange={e=>setForm(f=>({...f,procedure_code:e.target.value}))}/></div>
                <div><Label>Estimated cost (KES)</Label><Input type="number" value={form.estimated_cost_cents} onChange={e=>setForm(f=>({...f,estimated_cost_cents:e.target.value}))}/></div>
              </div>
              <div><Label>Clinical justification</Label><Textarea rows={3} value={form.clinical_justification} onChange={e=>setForm(f=>({...f,clinical_justification:e.target.value}))}/></div>
            </div>
            <DialogFooter><Button onClick={()=>create.mutate()} disabled={!form.patient_id || !form.procedure_name}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent requests</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Patient</th><th>Procedure</th><th>Cost</th><th>Status</th><th>Ref #</th><th></th></tr></thead>
            <tbody>
              {(list.data ?? []).map(p => (
                <tr key={p.id} className="border-t">
                  <td className="py-1">{nameOf(p.patient_id)}</td>
                  <td>{p.procedure_name}{p.procedure_code?` (${p.procedure_code})`:""}</td>
                  <td>{money(p.estimated_cost_cents)}</td>
                  <td><Badge variant={p.status==="approved"?"default":p.status==="denied"?"destructive":"secondary"}>{p.status}</Badge></td>
                  <td className="font-mono text-xs">{p.reference_number ?? "—"}</td>
                  <td>{isOfficer && p.status==="pending" && (
                    <Button size="sm" variant="outline" onClick={()=>{setDecide(p); setDecision({status:"approved",reference_number:"",approved_amount_cents: p.estimated_cost_cents?String(p.estimated_cost_cents/100):"",decision_notes:""});}}>Decide</Button>
                  )}</td>
                </tr>
              ))}
              {(list.data ?? []).length===0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No requests yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!decide} onOpenChange={(o)=>{ if(!o) setDecide(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decide pre-authorization</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Decision</Label>
              <Select value={decision.status} onValueChange={v=>setDecision(d=>({...d,status:v}))}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="denied">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Payer reference number</Label><Input value={decision.reference_number} onChange={e=>setDecision(d=>({...d,reference_number:e.target.value}))}/></div>
            <div><Label>Approved amount (KES)</Label><Input type="number" value={decision.approved_amount_cents} onChange={e=>setDecision(d=>({...d,approved_amount_cents:e.target.value}))}/></div>
            <div><Label>Notes</Label><Textarea rows={2} value={decision.decision_notes} onChange={e=>setDecision(d=>({...d,decision_notes:e.target.value}))}/></div>
          </div>
          <DialogFooter><Button onClick={()=>decideMut.mutate()}>Save decision</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
