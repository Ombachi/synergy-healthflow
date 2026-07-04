import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/display/queue")({
  component: QueueDisplay,
  head: () => ({
    meta: [{ title: "Now serving — Vitalis" }],
  }),
});

type Row = {
  ticket: string;
  queue_type: string;
  priority: number;
  status: "waiting" | "now_serving" | "served";
  entered_at: string;
};

function QueueDisplay() {
  const { data } = useQuery({
    queryKey: ["public-queue"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_queue" as never);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 15_000,
  });

  const rows = data ?? [];
  const byDept = rows.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.queue_type] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-5xl font-black tracking-tight">Now Serving</h1>
        <div className="text-right text-lg text-slate-400">
          <div>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          <div className="text-sm">Auto-refresh every 15s</div>
        </div>
      </header>

      {Object.keys(byDept).length === 0 && (
        <div className="grid min-h-[60vh] place-items-center text-3xl text-slate-500">
          No one in queue today.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {Object.entries(byDept).map(([dept, list]) => {
          const serving = list.filter((r) => r.status === "now_serving");
          const waiting = list.filter((r) => r.status === "waiting").slice(0, 5);
          return (
            <section key={dept} className="rounded-2xl bg-slate-900 p-6 shadow-lg">
              <h2 className="mb-4 text-2xl font-bold uppercase tracking-widest text-primary">
                {dept.replace(/_/g, " ")}
              </h2>

              <div className="mb-6">
                <div className="text-sm uppercase text-slate-400">Now serving</div>
                {serving.length === 0 ? (
                  <div className="text-4xl font-black text-slate-600">—</div>
                ) : (
                  serving.map((r) => (
                    <div key={r.ticket} className="text-7xl font-black text-emerald-400">
                      {r.ticket}
                    </div>
                  ))
                )}
              </div>

              <div>
                <div className="mb-2 text-sm uppercase text-slate-400">Next up</div>
                <ul className="space-y-1 text-3xl font-bold">
                  {waiting.length === 0 && <li className="text-slate-600">—</li>}
                  {waiting.map((r) => (
                    <li key={r.ticket} className="flex items-center justify-between">
                      <span>{r.ticket}</span>
                      {r.priority > 0 && (
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-sm text-amber-300">
                          priority
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
