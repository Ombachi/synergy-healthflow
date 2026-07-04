import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Gauge, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/sla")({ component: SlaPage });

type Row = {
  order_id: string;
  patient_id: string;
  priority: string;
  status: string;
  ordered_at: string;
  minutes_elapsed: number;
  threshold_minutes: number;
  sla_status: "on_time" | "in_progress" | "late" | "breached";
  modality?: string;
};

function statusClass(s: string) {
  switch (s) {
    case "breached":
      return "bg-destructive text-destructive-foreground";
    case "late":
      return "bg-amber-500 text-white";
    case "in_progress":
      return "bg-muted text-foreground";
    default:
      return "bg-emerald-600 text-white";
  }
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const counts = { on_time: 0, in_progress: 0, late: 0, breached: 0 };
  rows.forEach((r) => (counts[r.sla_status] = (counts[r.sla_status] ?? 0) + 1));
  const breaches = rows.filter((r) => r.sla_status === "breached" || r.sla_status === "late");

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="On time" value={counts.on_time} tone="bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100" />
        <Tile label="In progress" value={counts.in_progress} tone="bg-muted" />
        <Tile label="Late" value={counts.late} tone="bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100" />
        <Tile label="Breached" value={counts.breached} tone="bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-100" />
      </div>

      {breaches.length > 0 && (
        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Breaches & late orders
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Order</th>
                <th className="p-2 text-left">Priority</th>
                {"modality" in (breaches[0] ?? {}) && <th className="p-2 text-left">Modality</th>}
                <th className="p-2 text-left">Ordered</th>
                <th className="p-2 text-right">Elapsed (min)</th>
                <th className="p-2 text-right">Threshold</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {breaches.map((r) => (
                <tr key={r.order_id} className="border-t">
                  <td className="p-2 font-mono text-xs">{r.order_id.slice(0, 8)}</td>
                  <td className="p-2 uppercase">{r.priority}</td>
                  {"modality" in r && <td className="p-2">{r.modality}</td>}
                  <td className="p-2">{new Date(r.ordered_at).toLocaleString()}</td>
                  <td className="p-2 text-right">{r.minutes_elapsed}</td>
                  <td className="p-2 text-right">{r.threshold_minutes}</td>
                  <td className="p-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusClass(r.sla_status)}`}>
                      {r.sla_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SlaPage() {
  const lab = useQuery({
    queryKey: ["sla-lab"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_lab_tat" as never).select("*").limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 60_000,
  });
  const rad = useQuery({
    queryKey: ["sla-rad"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_radiology_tat" as never).select("*").limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold">SLA dashboard</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          Thresholds: Lab stat 60m / routine 4h · Radiology stat 2h / routine 24h
        </span>
      </header>

      {lab.isLoading || rad.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <Section title="Laboratory" rows={lab.data ?? []} />
          <Section title="Radiology" rows={rad.data ?? []} />
        </>
      )}
    </div>
  );
}
