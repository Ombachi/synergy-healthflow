import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const STAGES = ["triage", "doctor", "lab", "radiology", "pharmacy", "discharge"] as const;
export type Stage = typeof STAGES[number];

interface StageRow { id: string; visit_id: string; stage: string; entered_at: string; exited_at: string | null }

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export function VisitTimer({ visitId, openedAt, closedAt, canManage }: {
  visitId: string; openedAt: string; closedAt: string | null; canManage: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const stages = useQuery({
    queryKey: ["stages", visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_stages" as never).select("*").eq("visit_id", visitId).order("entered_at");
      if (error) throw error;
      return (data as unknown as StageRow[]) ?? [];
    },
  });

  const startStage = useMutation({
    mutationFn: async (stage: Stage) => {
      // close any open stage
      await supabase.from("visit_stages" as never)
        .update({ exited_at: new Date().toISOString() } as never)
        .eq("visit_id", visitId).is("exited_at", null);
      const { error } = await supabase.from("visit_stages" as never).insert({
        visit_id: visitId, stage, by_user: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stages", visitId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const total = (closedAt ? new Date(closedAt).getTime() : now) - new Date(openedAt).getTime();
  const stageTotals: Record<string, number> = {};
  (stages.data ?? []).forEach((s) => {
    const end = s.exited_at ? new Date(s.exited_at).getTime() : now;
    stageTotals[s.stage] = (stageTotals[s.stage] ?? 0) + (end - new Date(s.entered_at).getTime());
  });
  const currentStage = stages.data?.find((s) => !s.exited_at);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4 text-primary" /> Time in hospital
        </div>
        <div className="font-mono text-sm">{fmt(total)}</div>
      </div>
      {currentStage && (
        <div className="mt-2 text-xs text-muted-foreground">
          Currently in <span className="font-medium text-foreground capitalize">{currentStage.stage}</span>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {STAGES.map((st) => (
          <div key={st} className={`rounded border px-2 py-1.5 ${currentStage?.stage === st ? "border-primary bg-primary/5" : ""}`}>
            <div className="capitalize text-muted-foreground">{st}</div>
            <div className="font-mono">{fmt(stageTotals[st] ?? 0)}</div>
          </div>
        ))}
      </div>
      {canManage && !closedAt && (
        <div className="mt-3 flex flex-wrap gap-1">
          {STAGES.map((st) => (
            <Button key={st} size="sm" variant="outline" className="h-7 text-xs"
              disabled={startStage.isPending || currentStage?.stage === st}
              onClick={() => startStage.mutate(st)}>
              <ArrowRight className="h-3 w-3" /> {st}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
