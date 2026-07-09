import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, Plus } from "lucide-react";
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
import { useActiveAdmissions } from "@/components/admission-picker";

export const Route = createFileRoute("/_authenticated/infection-control")({
  component: () => <RoleGate path="/infection-control"><IpcPage /></RoleGate>,
});

interface Alert {
  id: string; admission_id: string; organism: string | null; precaution_type: string;
  onset_date: string | null; is_hospital_acquired: boolean; status: string; notes: string | null; created_at: string;
}

function IpcPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admissions = useActiveAdmissions();
  const [f, setF] = useState({ admission_id: "", organism: "", precaution_type: "contact", onset_date: "", is_hospital_acquired: false, notes: "" });

  const alerts = useQuery({
    queryKey: ["ipc"],
    queryFn: async () => {
      const { data } = await supabase.from("infection_control_alerts" as never).select("*").order("created_at", { ascending: false });
      return (data as unknown as Alert[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("infection_control_alerts" as never).insert({
        admission_id: f.admission_id, created_by: user?.id, organism: f.organism || null,
        precaution_type: f.precaution_type, onset_date: f.onset_date || null,
        is_hospital_acquired: f.is_hospital_acquired, notes: f.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Alert created"); setF({ admission_id: "", organism: "", precaution_type: "contact", onset_date: "", is_hospital_acquired: false, notes: "" }); qc.invalidateQueries({ queryKey: ["ipc"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("infection_control_alerts" as never).update({ status: "resolved" } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ipc"] }); },
  });

  const admName = (id: string) => admissions.data?.find((a) => a.id === id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldAlert className="h-6 w-6" /> Infection prevention & control</h1>
        <p className="text-sm text-muted-foreground">Precaution alerts and hospital-acquired infection tracking.</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">New IPC alert</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label>Inpatient</Label>
            <Select value={f.admission_id} onValueChange={(v) => setF((s) => ({ ...s, admission_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{(admissions.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.patient_name} — {a.ward_name} {a.bed_code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Precaution</Label>
            <Select value={f.precaution_type} onValueChange={(v) => setF((s) => ({ ...s, precaution_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["standard", "contact", "droplet", "airborne", "protective"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Organism</Label><Input value={f.organism} onChange={(e) => setF((s) => ({ ...s, organism: e.target.value }))} placeholder="e.g. MRSA" /></div>
          <div><Label>Onset date</Label><Input type="date" value={f.onset_date} onChange={(e) => setF((s) => ({ ...s, onset_date: e.target.value }))} /></div>
          <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={f.is_hospital_acquired} onChange={(e) => setF((s) => ({ ...s, is_hospital_acquired: e.target.checked }))} /> Hospital-acquired (HAI)</label>
          <div className="md:col-span-3"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} /></div>
          <div className="md:col-span-3"><Button disabled={!f.admission_id} onClick={() => create.mutate()}><Plus className="mr-1 h-4 w-4" />Create alert</Button></div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(alerts.data ?? []).map((a) => {
          const p = admName(a.admission_id);
          return (
            <Card key={a.id} className={a.status === "active" ? "border-amber-400" : ""}>
              <CardContent className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    {p?.patient_name ?? a.admission_id.slice(0, 8)}
                    <Badge variant="outline" className="capitalize">{a.precaution_type}</Badge>
                    {a.organism && <Badge>{a.organism}</Badge>}
                    {a.is_hospital_acquired && <Badge className="bg-rose-600">HAI</Badge>}
                    <Badge variant="outline" className="capitalize">{a.status}</Badge>
                  </div>
                  {a.status === "active" && <Button size="sm" variant="outline" onClick={() => resolve.mutate(a.id)}>Resolve</Button>}
                </div>
                {a.notes && <div className="text-xs text-muted-foreground mt-1">{a.notes}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
