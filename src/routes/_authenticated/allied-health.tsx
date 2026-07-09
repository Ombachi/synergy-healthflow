import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HeartPulse, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RoleGate } from "@/components/role-gate";
import { AdmissionPicker } from "@/components/admission-picker";

export const Route = createFileRoute("/_authenticated/allied-health")({
  component: () => <RoleGate path="/allied-health"><AlliedPage /></RoleGate>,
});

interface Note { id: string; discipline: string; session_at: string; assessment: string | null; intervention: string | null; plan: string | null }

function AlliedPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [adm, setAdm] = useState("");
  const [f, setF] = useState({ discipline: "physio", assessment: "", intervention: "", plan: "" });

  const notes = useQuery({
    queryKey: ["allied", adm], enabled: !!adm,
    queryFn: async () => {
      const { data } = await supabase.from("allied_health_notes" as never).select("*").eq("admission_id", adm).order("session_at", { ascending: false });
      return (data as unknown as Note[]) ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("allied_health_notes" as never).insert({
        admission_id: adm, clinician_id: user?.id, discipline: f.discipline,
        assessment: f.assessment || null, intervention: f.intervention || null, plan: f.plan || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Session recorded"); setF({ discipline: f.discipline, assessment: "", intervention: "", plan: "" }); qc.invalidateQueries({ queryKey: ["allied", adm] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><HeartPulse className="h-6 w-6" /> Allied health services</h1>
        <p className="text-sm text-muted-foreground">Physiotherapy, nutrition, occupational and speech therapy interventions.</p>
      </div>
      <Card><CardContent className="p-4"><AdmissionPicker value={adm} onChange={setAdm} /></CardContent></Card>

      {adm && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">New session</CardTitle></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              <div>
                <Label>Discipline</Label>
                <Select value={f.discipline} onValueChange={(v) => setF((s) => ({ ...s, discipline: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["physio", "nutrition", "ot", "speech", "social"].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div />
              <div><Label>Assessment</Label><Textarea value={f.assessment} onChange={(e) => setF((s) => ({ ...s, assessment: e.target.value }))} /></div>
              <div><Label>Intervention</Label><Textarea value={f.intervention} onChange={(e) => setF((s) => ({ ...s, intervention: e.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Plan</Label><Textarea value={f.plan} onChange={(e) => setF((s) => ({ ...s, plan: e.target.value }))} /></div>
              <div className="md:col-span-2"><Button onClick={() => save.mutate()}><Plus className="mr-1 h-4 w-4" />Record session</Button></div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {(notes.data ?? []).map((n) => (
              <Card key={n.id}>
                <CardContent className="p-3 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <Badge variant="secondary" className="capitalize">{n.discipline}</Badge>
                    <span>{new Date(n.session_at).toLocaleString()}</span>
                  </div>
                  {n.assessment && <div className="mt-1"><b>Assessment:</b> {n.assessment}</div>}
                  {n.intervention && <div><b>Intervention:</b> {n.intervention}</div>}
                  {n.plan && <div><b>Plan:</b> {n.plan}</div>}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
