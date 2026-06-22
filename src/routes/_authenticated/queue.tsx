import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListOrdered, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WorkflowChip, workflowLabel } from "@/components/workflow-chip";
import { NurseStation } from "@/components/workstations/nurse-station";
import { DoctorStation } from "@/components/workstations/doctor-station";

export const Route = createFileRoute("/_authenticated/queue")({ component: QueueRouter });

function QueueRouter() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  // Specialized workstations
  if (roles.includes("nurse") && !roles.includes("admin")) return <NurseStation />;
  if (roles.includes("doctor") && !roles.includes("admin")) return <DoctorStation />;
  return <QueueBoard />;
}

interface QueueEntry { id: string; visit_id: string; queue_type: string; priority: number; entered_at: string; called_at: string | null; served_at: string | null }
interface Visit { id: string; patient_id: string; current_stage: string | null }
interface Patient { id: string; full_name: string }

const ALL_TYPES = ["triage", "doctor", "procedure", "lab", "radiology", "pharmacy", "billing"];

const ROLE_QUEUES: Record<string, string[]> = {
  receptionist: ["triage"],
  nurse: ["triage", "procedure"],
  lab_tech: ["lab"],
  radiologist: ["radiology"],
  pharmacist: ["pharmacy"],
  cashier: ["billing"],
  billing_officer: ["billing"],
};

function QueueBoard() {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const TYPES = roles.includes("admin")
    ? ALL_TYPES
    : Array.from(new Set(roles.flatMap((r) => ROLE_QUEUES[r] ?? [])));

  const queue = useQuery({
    queryKey: ["queue"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visit_queue" as never).select("*")
        .is("served_at", null).order("priority").order("entered_at");
      if (error) throw error;
      return (data as unknown as QueueEntry[]) ?? [];
    },
  });
  const visits = useQuery({
    queryKey: ["queue-visits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never).select("id, patient_id, current_stage").neq("status", "closed");
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["queue-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name");
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_queue" }, () => qc.invalidateQueries({ queryKey: ["queue"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const call = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("visit_queue" as never).update({ called_at: new Date().toISOString() } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["queue"] }); toast.success("Patient called"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const serve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("visit_queue" as never).update({
        served_at: new Date().toISOString(), served_by: user!.id,
      } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["queue"] }); toast.success("Marked served"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const visitFor = (vid: string) => visits.data?.find((v) => v.id === vid);
  const patientName = (pid: string) => patients.data?.find((p) => p.id === pid)?.full_name ?? "—";
  const elapsed = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ListOrdered className="h-6 w-6 text-primary" /> Live queue board</h1>
        <p className="text-sm text-muted-foreground">All departments, sorted by priority then wait time.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TYPES.map((type) => {
          const entries = queue.data?.filter((q) => q.queue_type === type) ?? [];
          return (
            <div key={type} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <div className="font-medium">{workflowLabel(type)}</div>
                <span className="rounded bg-muted px-2 py-0.5 text-xs">{entries.length}</span>
              </div>
              <div className="divide-y">
                {entries.length === 0 && <div className="p-3 text-xs text-muted-foreground">Empty</div>}
                {entries.map((q) => {
                  const v = visitFor(q.visit_id);
                  return (
                    <div key={q.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <div>
                        <div className="font-medium">{v ? patientName(v.patient_id) : "—"}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {v?.current_stage && <WorkflowChip status={v.current_stage} />}
                          <span>P{q.priority} · waited {elapsed(q.entered_at)} {q.called_at && "· called"}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {!q.called_at && <Button size="sm" variant="outline" onClick={() => call.mutate(q.id)}><BellRing className="h-3 w-3" /></Button>}
                        <Button size="sm" onClick={() => serve.mutate(q.id)}>Done</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
