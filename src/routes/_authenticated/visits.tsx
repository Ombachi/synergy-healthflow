import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/visits")({
  component: Visits,
});

interface Visit {
  id: string;
  patient_id: string;
  status: string;
  reason: string | null;
  chief_complaint: string | null;
  triage_level: string | null;
  opened_at: string;
  closed_at: string | null;
}

interface PatientOpt {
  id: string;
  full_name: string;
  medical_record_number: string | null;
}

function Visits() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, hasAnyRole } = useAuth();
  const canOpen = hasAnyRole(["doctor", "nurse", "admin"]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});


  const visits = useQuery({
    queryKey: ["visits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits" as never)
        .select("id, patient_id, status, reason, chief_complaint, triage_level, opened_at, closed_at")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });

  const patients = useQuery({
    queryKey: ["patients-opt"],
    enabled: canOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("id, full_name, medical_record_number")
        .order("full_name");
      if (error) throw error;
      return (data as unknown as PatientOpt[]) ?? [];
    },
  });

  const patientName = (id: string) =>
    patients.data?.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.patient_id) throw new Error("Pick a patient");
      const { data, error } = await supabase.from("visits" as never).insert({
        patient_id: form.patient_id,
        opened_by: user!.id,
        reason: form.reason || null,
        chief_complaint: form.chief_complaint || null,
        triage_level: form.triage_level || "routine",
        status: "open",
      } as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (visitId) => {
      qc.invalidateQueries({ queryKey: ["visits"] });
      setOpen(false);
      setForm({});
      toast.success("Visit started");
      navigate({ to: "/visits/$visitId", params: { visitId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const triageBadge = (level: string | null) => {
    const cls =
      level === "emergent"
        ? "bg-destructive/15 text-destructive"
        : level === "urgent"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
    return <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${cls}`}>{level ?? "routine"}</span>;
  };

  const statusBadge = (s: string) => (
    <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${s === "closed" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
      {s.replace("_", " ")}
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Visits</h1>
          <p className="text-sm text-muted-foreground">
            Patient visits flow from intake → vitals → diagnosis.
          </p>
        </div>
        {canOpen && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> Start visit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start a new visit</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Patient *</Label>
                  <Select value={form.patient_id ?? ""} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose patient" /></SelectTrigger>
                    <SelectContent>
                      {patients.data?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name}
                          {p.medical_record_number ? ` · ${p.medical_record_number}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reason for visit</Label>
                  <Input value={form.reason ?? ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                </div>
                <div>
                  <Label>Chief complaint</Label>
                  <Textarea rows={2} value={form.chief_complaint ?? ""} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })} />
                </div>
                <div>
                  <Label>Triage level</Label>
                  <Select value={form.triage_level ?? "routine"} onValueChange={(v) => setForm({ ...form, triage_level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="routine">Routine</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="emergent">Emergent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Opening..." : "Open visit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Patient</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Triage</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Opened</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {visits.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {visits.data?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No visits yet.</td></tr>
            )}
            {visits.data?.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="px-4 py-2">{patientName(v.patient_id)}</td>
                <td className="px-4 py-2">{v.reason ?? "—"}</td>
                <td className="px-4 py-2">{triageBadge(v.triage_level)}</td>
                <td className="px-4 py-2">{statusBadge(v.status)}</td>
                <td className="px-4 py-2 text-muted-foreground">{new Date(v.opened_at).toLocaleString()}</td>
                <td className="px-4 py-2 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/visits/$visitId" params={{ visitId: v.id }}>Open visit</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}