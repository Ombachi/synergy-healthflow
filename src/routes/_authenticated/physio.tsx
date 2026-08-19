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
import { Plus, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DoctorStation } from "@/components/workstations/doctor-station";
import { MyActivePatients } from "@/components/my-active-patients";

export const Route = createFileRoute("/_authenticated/physio")({
  component: PhysioDashboard,
});

interface Injury { id: string; athlete_id: string; body_part: string; severity: string; status: string; reported_at: string; notes: string | null }
interface Athlete { id: string; full_name: string }

function PhysioDashboard() {
  const { hasAnyRole, user } = useAuth();
  const allowed = hasAnyRole(["physio", "doctor", "admin"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ athlete_id: "", body_part: "", severity: "mild", notes: "" });

  const athletes = useQuery({
    queryKey: ["physio-athletes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("athletes" as never).select("id, full_name").order("full_name");
      if (error) throw error;
      return (data as unknown as Athlete[]) ?? [];
    },
    enabled: allowed,
  });

  const injuries = useQuery({
    queryKey: ["physio-injuries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("injuries" as never).select("*").neq("status", "cleared").order("reported_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Injury[]) ?? [];
    },
    enabled: allowed,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("injuries" as never).insert({ ...form, reported_by: user?.id } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["physio-injuries"] }); setOpen(false); setForm({ athlete_id: "", body_part: "", severity: "mild", notes: "" }); toast.success("Injury reported"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async (inj: Injury) => {
      const { error } = await supabase.from("clearance_records" as never).insert({
        athlete_id: inj.athlete_id, injury_id: inj.id, status: "cleared", cleared_by: user?.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["physio-injuries"] }); toast.success("Clearance recorded"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) return <p className="text-sm text-muted-foreground">Physio access only.</p>;

  const nameOf = (id: string) => athletes.data?.find((a) => a.id === id)?.full_name ?? id.slice(0, 8);

  return (
    <Tabs defaultValue="clinic" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Physiotherapy</h1>
        <p className="text-sm text-muted-foreground">
          Patient consultations, plus sports injuries and return-to-play clearance.
        </p>
      </div>
      <TabsList>
        <TabsTrigger value="clinic">Consultations</TabsTrigger>
        <TabsTrigger value="sports">Sports injuries</TabsTrigger>
      </TabsList>

      <TabsContent value="clinic" className="space-y-6">
        <DoctorStation />
        <MyActivePatients />
      </TabsContent>

      <TabsContent value="sports" className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-medium">Sports injuries</h2>
          <p className="text-sm text-muted-foreground">Athlete injuries, treatments, return-to-play clearance.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" />Report injury</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Report injury</DialogTitle></DialogHeader>
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
              <div><Label>Body part</Label><Input value={form.body_part} onChange={(e) => setForm({ ...form, body_part: e.target.value })} /></div>
              <div>
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["mild", "moderate", "severe"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.athlete_id || !form.body_part || create.isPending}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Active injuries ({injuries.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {injuries.data?.length === 0 ? <p className="text-sm text-muted-foreground">No active injuries.</p> : (
            <div className="space-y-2">
              {injuries.data?.map((inj) => (
                <div key={inj.id} className="flex items-center justify-between rounded border p-3 text-sm">
                  <div>
                    <div className="font-medium">{nameOf(inj.athlete_id)} — {inj.body_part}</div>
                    <div className="text-xs text-muted-foreground">
                      Severity: {inj.severity} • Reported {new Date(inj.reported_at).toLocaleDateString("en-GB")}
                    </div>
                    {inj.notes && <div className="mt-1 text-xs">{inj.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={"rounded px-2 py-0.5 text-xs " + (inj.status === "active" ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-600")}>
                      {inj.status}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => clear.mutate(inj)} disabled={clear.isPending}>
                      <Check className="h-4 w-4" />Clear
                    </Button>
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
