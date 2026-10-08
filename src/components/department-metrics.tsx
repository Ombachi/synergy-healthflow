import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, FlaskConical, Stethoscope, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startOfTodayISO } from "@/lib/today-scope";

interface Q { entered_at: string; called_at: string | null; served_at: string | null }

/** Top half of the unified workstation: live department metrics for today. */
export function DepartmentMetrics() {
  const qc = useQueryClient();
  const m = useQuery({
    queryKey: ["dept-metrics"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = startOfTodayISO();
      const [queue, consult, labs] = await Promise.all([
        supabase.from("visit_queue" as never).select("entered_at, called_at, served_at").gte("entered_at", since),
        supabase.from("visits" as never).select("id", { count: "exact", head: true })
          .eq("current_stage", "in_consultation").neq("status", "closed"),
        supabase.from("lab_orders" as never).select("id", { count: "exact", head: true })
          .not("status", "in", "(resulted,cancelled,completed)"),
      ]);
      const rows = ((queue.data as unknown as Q[]) ?? []);
      const waiting = rows.filter((r) => !r.served_at).length;
      const served = rows.filter((r) => r.served_at);
      const tat = served.length
        ? Math.round(served.reduce((s, r) => s + (new Date(r.served_at!).getTime() - new Date(r.entered_at).getTime()), 0) / served.length / 60000)
        : null;
      return { waiting, consulting: consult.count ?? 0, tat, pendingLabs: labs.count ?? 0 };
    },
  });

  useEffect(() => {
    const ch = supabase.channel("dept-metrics-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_queue" }, () => qc.invalidateQueries({ queryKey: ["dept-metrics"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const cards = [
    { label: "Patients waiting", value: m.data?.waiting, icon: Users },
    { label: "In consultation", value: m.data?.consulting, icon: Stethoscope },
    { label: "Avg turnaround", value: m.data ? (m.data.tat == null ? "—" : `${m.data.tat} min`) : undefined, icon: Clock },
    { label: "Pending labs", value: m.data?.pendingLabs, icon: FlaskConical },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><c.icon className="h-4 w-4 text-primary" />{c.label}</div>
          <div className="mt-1 text-2xl font-semibold">{m.isLoading ? "…" : c.value ?? 0}</div>
        </div>
      ))}
    </section>
  );
}
