import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Plus } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/care-plans")({
  component: () => <RoleGate path="/care-plans"><CarePlansPage /></RoleGate>,
});

interface Plan { id: string; plan_type: string; title: string; problem: string | null; status: string; created_at: string }
interface Goal { id: string; care_plan_id: string; goal: string; intervention: string | null; target_date: string | null; status: string }

function CarePlansPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [adm, setAdm] = useState("");
  const [pf, setPf] = useState({ plan_type: "nursing", title: "", problem: "" });
  const [gf, setGf] = useState<Record<string, { goal: string; intervention: string; target_date: string }>>({});

  const plans = useQuery({
    queryKey: ["plans", adm], enabled: !!adm,
    queryFn: async () => {
      const { data } = await supabase.from("care_plans" as never).select("*").eq("admission_id", adm).order("created_at", { ascending: false });
      return (data as unknown as Plan[]) ?? [];
    },
  });
  const planIds = (plans.data ?? []).map((p) => p.id);
  const goals = useQuery({
    queryKey: ["goals", planIds.join(",")], enabled: planIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("care_plan_goals" as never).select("*").in("care_plan_id", planIds as never).order("created_at");
      return (data as unknown as Goal[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("care_plans" as never).insert({ admission_id: adm, created_by: user?.id, ...pf, problem: pf.problem || null } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan created"); setPf({ plan_type: "nursing", title: "", problem: "" }); qc.invalidateQueries({ queryKey: ["plans", adm] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addGoal = useMutation({
    mutationFn: async (planId: string) => {
      const g = gf[planId];
      if (!g?.goal) throw new Error("Goal required");
      const { error } = await supabase.from("care_plan_goals" as never).insert({
        care_plan_id: planId, goal: g.goal, intervention: g.intervention || null, target_date: g.target_date || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_, planId) => { setGf((s) => ({ ...s, [planId]: { goal: "", intervention: "", target_date: "" } })); qc.invalidateQueries({ queryKey: ["goals", planIds.join(",")] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const goalsFor = (id: string) => (goals.data ?? []).filter((g) => g.care_plan_id === id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><ClipboardList className="h-6 w-6" /> Care plans</h1>
        <p className="text-sm text-muted-foreground">Nursing, nutrition, physiotherapy and discharge care plans with goals.</p>
      </div>
      <Card><CardContent className="p-4"><AdmissionPicker value={adm} onChange={setAdm} /></CardContent></Card>

      {adm && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">New plan</CardTitle></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-4">
              <div>
                <Label>Type</Label>
                <Select value={pf.plan_type} onValueChange={(v) => setPf((f) => ({ ...f, plan_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["nursing", "nutrition", "physio", "ot", "discharge"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Title</Label><Input value={pf.title} onChange={(e) => setPf((f) => ({ ...f, title: e.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Problem</Label><Input value={pf.problem} onChange={(e) => setPf((f) => ({ ...f, problem: e.target.value }))} /></div>
              <div className="md:col-span-4"><Button disabled={!pf.title} onClick={() => create.mutate()}><Plus className="mr-1 h-4 w-4" />Create plan</Button></div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {(plans.data ?? []).map((p) => {
              const g = gf[p.id] ?? { goal: "", intervention: "", target_date: "" };
              return (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">{p.plan_type}</Badge>
                      {p.title}
                      <Badge variant="outline" className="ml-auto capitalize">{p.status}</Badge>
                    </CardTitle>
                    {p.problem && <p className="text-xs text-muted-foreground">{p.problem}</p>}
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {goalsFor(p.id).map((gl) => (
                      <div key={gl.id} className="rounded border p-2">
                        <div className="font-medium">{gl.goal}</div>
                        {gl.intervention && <div className="text-xs text-muted-foreground">Intervention: {gl.intervention}</div>}
                        {gl.target_date && <div className="text-xs text-muted-foreground">Target: {gl.target_date}</div>}
                      </div>
                    ))}
                    <div className="grid gap-2 md:grid-cols-4 pt-2">
                      <Textarea rows={1} placeholder="Goal" value={g.goal} onChange={(e) => setGf((s) => ({ ...s, [p.id]: { ...g, goal: e.target.value } }))} />
                      <Textarea rows={1} placeholder="Intervention" value={g.intervention} onChange={(e) => setGf((s) => ({ ...s, [p.id]: { ...g, intervention: e.target.value } }))} />
                      <Input type="date" value={g.target_date} onChange={(e) => setGf((s) => ({ ...s, [p.id]: { ...g, target_date: e.target.value } }))} />
                      <Button onClick={() => addGoal.mutate(p.id)}>Add goal</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
