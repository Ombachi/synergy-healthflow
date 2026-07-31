import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Stethoscope, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RoleGate } from "@/components/role-gate";
import { AdmissionPicker } from "@/components/admission-picker";

export const Route = createFileRoute("/_authenticated/ward-rounds")({
  component: () => <RoleGate path="/ward-rounds"><WardRoundsPage /></RoleGate>,
});

interface Round {
  id: string; admission_id: string; round_at: string; round_type: string;
  subjective: string | null; objective: string | null; assessment: string | null; plan: string | null;
}

function WardRoundsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [adm, setAdm] = useState("");
  const [form, setForm] = useState({ round_type: "consultant", subjective: "", objective: "", assessment: "", plan: "" });

  const rounds = useQuery({
    queryKey: ["ward-rounds", adm], enabled: !!adm,
    queryFn: async () => {
      const { data } = await supabase.from("ward_rounds" as never).select("*").eq("admission_id", adm).order("round_at", { ascending: false });
      return (data as unknown as Round[]) ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ward_rounds" as never).insert({
        admission_id: adm, performed_by: user?.id, round_type: form.round_type,
        subjective: form.subjective || null, objective: form.objective || null,
        assessment: form.assessment || null, plan: form.plan || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Round note saved");
      setForm({ round_type: "consultant", subjective: "", objective: "", assessment: "", plan: "" });
      qc.invalidateQueries({ queryKey: ["ward-rounds", adm] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Stethoscope className="h-6 w-6" /> Consultant ward rounds</h1>
        <p className="text-sm text-muted-foreground">SOAP progress notes tied to the inpatient stay.</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">New SOAP note</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <AdmissionPicker value={adm} onChange={setAdm} />
          <div>
            <Label>Round type</Label>
            <Select value={form.round_type} onValueChange={(v) => setForm((f) => ({ ...f, round_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="consultant">Consultant</SelectItem>
                <SelectItem value="registrar">Registrar</SelectItem>
                <SelectItem value="nurse">Nursing</SelectItem>
                <SelectItem value="allied">Allied health</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 grid gap-2 md:grid-cols-2">
            <div><Label>Subjective</Label><Textarea rows={3} value={form.subjective} onChange={(e) => setForm((f) => ({ ...f, subjective: e.target.value }))} /></div>
            <div><Label>Objective</Label><Textarea rows={3} value={form.objective} onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))} /></div>
            <div><Label>Assessment</Label><Textarea rows={3} value={form.assessment} onChange={(e) => setForm((f) => ({ ...f, assessment: e.target.value }))} /></div>
            <div><Label>Plan</Label><Textarea rows={3} value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))} /></div>
          </div>
          <div className="md:col-span-2">
            <Button disabled={!adm || save.isPending} onClick={() => save.mutate()}><Plus className="mr-1 h-4 w-4" />Save round</Button>
          </div>
        </CardContent>
      </Card>

      {adm && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Round history</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(rounds.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No rounds yet.</p>}
            {(rounds.data ?? []).map((r) => (
              <div key={r.id} className="rounded border p-3 text-sm">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span className="capitalize font-medium">{r.round_type}</span>
                  <span>{new Date(r.round_at).toLocaleString("en-GB")}</span>
                </div>
                {r.subjective && <div><b>S:</b> {r.subjective}</div>}
                {r.objective && <div><b>O:</b> {r.objective}</div>}
                {r.assessment && <div><b>A:</b> {r.assessment}</div>}
                {r.plan && <div><b>P:</b> {r.plan}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
