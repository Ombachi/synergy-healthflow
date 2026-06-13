import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/nutrition")({
  component: NutritionDashboard,
});

interface Plan { id: string; athlete_id: string; notes: string | null; start_date: string | null; end_date: string | null; compliance_pct: number | null; plan: Record<string, unknown> }
interface Athlete { id: string; full_name: string }

function NutritionDashboard() {
  const { hasAnyRole, user } = useAuth();
  const allowed = hasAnyRole(["nutritionist", "admin"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ athlete_id: "", notes: "", start_date: "", end_date: "", compliance_pct: "" });

  const athletes = useQuery({
    queryKey: ["nut-athletes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("athletes" as never).select("id, full_name").order("full_name");
      if (error) throw error;
      return (data as unknown as Athlete[]) ?? [];
    },
    enabled: allowed,
  });

  const plans = useQuery({
    queryKey: ["nut-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nutrition_plans" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Plan[]) ?? [];
    },
    enabled: allowed,
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        athlete_id: form.athlete_id,
        nutritionist_id: user?.id,
        notes: form.notes || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        compliance_pct: form.compliance_pct ? Number(form.compliance_pct) : null,
        plan: {},
      };
      const { error } = await supabase.from("nutrition_plans" as never).insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nut-plans"] }); setOpen(false); setForm({ athlete_id: "", notes: "", start_date: "", end_date: "", compliance_pct: "" }); toast.success("Plan created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) return <p className="text-sm text-muted-foreground">Nutritionist access only.</p>;

  const nameOf = (id: string) => athletes.data?.find((a) => a.id === id)?.full_name ?? id.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Nutrition</h1>
          <p className="text-sm text-muted-foreground">Athlete nutrition plans and compliance.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" />New plan</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New nutrition plan</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Athlete</Label>
                <Select value={form.athlete_id} onValueChange={(v) => setForm({ ...form, athlete_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select athlete" /></SelectTrigger>
                  <SelectContent>
                    {athletes.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div><Label>Compliance %</Label><Input type="number" min="0" max="100" value={form.compliance_pct} onChange={(e) => setForm({ ...form, compliance_pct: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.athlete_id || create.isPending}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Active plans ({plans.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {plans.data?.length === 0 ? <p className="text-sm text-muted-foreground">No plans yet.</p> : (
            <div className="space-y-2">
              {plans.data?.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded border p-3 text-sm">
                  <div>
                    <div className="font-medium">{nameOf(p.athlete_id)}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.start_date ?? "—"} → {p.end_date ?? "—"}
                    </div>
                    {p.notes && <div className="mt-1 text-xs">{p.notes}</div>}
                  </div>
                  <div className="text-sm font-medium">
                    {p.compliance_pct != null ? `${p.compliance_pct}%` : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
