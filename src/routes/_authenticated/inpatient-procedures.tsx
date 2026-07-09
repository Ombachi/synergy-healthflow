import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Scissors, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RoleGate } from "@/components/role-gate";
import { AdmissionPicker } from "@/components/admission-picker";

export const Route = createFileRoute("/_authenticated/inpatient-procedures")({
  component: () => <RoleGate path="/inpatient-procedures"><InpatientProceduresPage /></RoleGate>,
});

interface Proc {
  id: string; procedure_name: string; scheduled_at: string | null; performed_at: string | null;
  status: string; location: string | null; consent_obtained: boolean; notes: string | null; complications: string | null;
}

function InpatientProceduresPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [adm, setAdm] = useState("");
  const [f, setF] = useState({ procedure_name: "", scheduled_at: "", location: "", consent_obtained: false, notes: "" });

  const list = useQuery({
    queryKey: ["iproc", adm], enabled: !!adm,
    queryFn: async () => {
      const { data } = await supabase.from("inpatient_procedures" as never).select("*").eq("admission_id", adm).order("created_at", { ascending: false });
      return (data as unknown as Proc[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inpatient_procedures" as never).insert({
        admission_id: adm, performed_by: user?.id, procedure_name: f.procedure_name,
        scheduled_at: f.scheduled_at || null, location: f.location || null,
        consent_obtained: f.consent_obtained, notes: f.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Procedure booked"); setF({ procedure_name: "", scheduled_at: "", location: "", consent_obtained: false, notes: "" }); qc.invalidateQueries({ queryKey: ["iproc", adm] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (p: { id: string; status: string }) => {
      const patch: Record<string, unknown> = { status: p.status };
      if (p.status === "completed") patch.performed_at = new Date().toISOString();
      const { error } = await supabase.from("inpatient_procedures" as never).update(patch as never).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["iproc", adm] }); },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Scissors className="h-6 w-6" /> Inpatient procedures</h1>
        <p className="text-sm text-muted-foreground">Bedside procedures with consent tracking.</p>
      </div>
      <Card><CardContent className="p-4"><AdmissionPicker value={adm} onChange={setAdm} /></CardContent></Card>

      {adm && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Book procedure</CardTitle></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-3">
              <div className="md:col-span-2"><Label>Procedure</Label><Input value={f.procedure_name} onChange={(e) => setF((s) => ({ ...s, procedure_name: e.target.value }))} /></div>
              <div><Label>When</Label><Input type="datetime-local" value={f.scheduled_at} onChange={(e) => setF((s) => ({ ...s, scheduled_at: e.target.value }))} /></div>
              <div><Label>Location</Label><Input value={f.location} onChange={(e) => setF((s) => ({ ...s, location: e.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.consent_obtained} onChange={(e) => setF((s) => ({ ...s, consent_obtained: e.target.checked }))} /> Consent obtained</label>
              <div className="md:col-span-3"><Button disabled={!f.procedure_name} onClick={() => create.mutate()}><Plus className="mr-1 h-4 w-4" />Book</Button></div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {(list.data ?? []).map((p) => (
              <Card key={p.id}>
                <CardContent className="flex items-center justify-between p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      {p.procedure_name}
                      <Badge variant="outline" className="capitalize">{p.status}</Badge>
                      {p.consent_obtained ? <Badge className="bg-emerald-600">Consent</Badge> : <Badge className="bg-amber-500">No consent</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.scheduled_at && <>Scheduled: {new Date(p.scheduled_at).toLocaleString()}. </>}
                      {p.location && <>{p.location}. </>}
                    </div>
                  </div>
                  <Select value={p.status} onValueChange={(v) => setStatus.mutate({ id: p.id, status: v })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["scheduled", "in_progress", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
