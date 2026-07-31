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
import { useActiveAdmissions } from "@/components/admission-picker";

export const Route = createFileRoute("/_authenticated/surgery")({
  component: () => <RoleGate path="/surgery"><SurgeryPage /></RoleGate>,
});

interface Booking { id: string; procedure_name: string; scheduled_at: string; theatre: string | null; status: string; admission_id: string | null; patient_id: string | null }

function SurgeryPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admissions = useActiveAdmissions();
  const [f, setF] = useState({ admission_id: "", procedure_name: "", scheduled_at: "", theatre: "", notes: "" });

  const bookings = useQuery({
    queryKey: ["surg"],
    queryFn: async () => {
      const { data } = await supabase.from("surgery_bookings" as never).select("*").order("scheduled_at");
      return (data as unknown as Booking[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const adm = admissions.data?.find((a) => a.id === f.admission_id);
      const { error } = await supabase.from("surgery_bookings" as never).insert({
        admission_id: f.admission_id || null, patient_id: adm?.patient_id ?? null,
        procedure_name: f.procedure_name, scheduled_at: f.scheduled_at,
        theatre: f.theatre || null, surgeon_id: user?.id, notes: f.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Booked"); setF({ admission_id: "", procedure_name: "", scheduled_at: "", theatre: "", notes: "" }); qc.invalidateQueries({ queryKey: ["surg"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (p: { id: string; status: string }) => {
      const { error } = await supabase.from("surgery_bookings" as never).update({ status: p.status } as never).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surg"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Scissors className="h-6 w-6" /> Surgery / theatre</h1>
        <p className="text-sm text-muted-foreground">Theatre schedule. Extended workflow (WHO checklist, operative notes, recovery) coming in a follow-up build.</p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Book case</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label>Inpatient</Label>
            <Select value={f.admission_id} onValueChange={(v) => setF((s) => ({ ...s, admission_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{(admissions.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.patient_name} — {a.ward_name} {a.bed_code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Theatre</Label><Input value={f.theatre} onChange={(e) => setF((s) => ({ ...s, theatre: e.target.value }))} /></div>
          <div className="md:col-span-2"><Label>Procedure</Label><Input value={f.procedure_name} onChange={(e) => setF((s) => ({ ...s, procedure_name: e.target.value }))} /></div>
          <div><Label>Scheduled at</Label><Input type="datetime-local" value={f.scheduled_at} onChange={(e) => setF((s) => ({ ...s, scheduled_at: e.target.value }))} /></div>
          <div className="md:col-span-3"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} /></div>
          <div className="md:col-span-3"><Button disabled={!f.procedure_name || !f.scheduled_at} onClick={() => create.mutate()}><Plus className="mr-1 h-4 w-4" />Book</Button></div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(bookings.data ?? []).map((b) => (
          <Card key={b.id}>
            <CardContent className="flex items-center justify-between p-3 text-sm">
              <div>
                <div className="font-medium">{b.procedure_name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(b.scheduled_at).toLocaleString("en-GB")} · {b.theatre ?? "Theatre TBC"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{b.status}</Badge>
                <Select value={b.status} onValueChange={(v) => setStatus.mutate({ id: b.id, status: v })}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>{["scheduled", "in_theatre", "recovery", "completed", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
