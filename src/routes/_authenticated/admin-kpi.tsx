import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, BedDouble, CalendarClock, ClipboardList, Receipt, ShieldX, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin-kpi")({
  component: () => <RoleGate path="/admin-kpi"><AdminKPI /></RoleGate>,
});

const money = (c: number) => `KES ${(c / 100).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

function AdminKPI() {
  const revenue = useQuery({
    queryKey: ["kpi-rev"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("kpi_revenue_by_dept" as never, {
        _since: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      } as never);
      return (data as unknown as { dept: string; day: string; revenue_cents: number }[]) ?? [];
    },
  });
  const occ = useQuery({
    queryKey: ["kpi-occ"], staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("kpi_occupancy" as never);
      return (data as unknown as { ward: string; total_beds: number; occupied: number; free: number; cleaning: number; occupancy_pct: number }[]) ?? [];
    },
  });
  const alos = useQuery({ queryKey:["kpi-alos"], staleTime: 60_000, queryFn: async () => {
    const { data } = await supabase.rpc("kpi_alos" as never);
    return ((data as unknown as { alos_days: number; discharges_30d: number }[]) ?? [])[0] ?? null;
  }});
  const denial = useQuery({ queryKey:["kpi-den"], staleTime: 60_000, queryFn: async () => {
    const { data } = await supabase.rpc("kpi_denial" as never);
    return ((data as unknown as { denied_count: number; decided_count: number; denial_pct: number }[]) ?? [])[0] ?? null;
  }});
  const tat = useQuery({ queryKey:["kpi-tat"], staleTime: 60_000, queryFn: async () => {
    const { data } = await supabase.rpc("kpi_lab_tat" as never);
    return ((data as unknown as { tat_minutes: number; samples_30d: number }[]) ?? [])[0] ?? null;
  }});
  const mix = useQuery({ queryKey:["kpi-mix"], staleTime: 60_000, queryFn: async () => {
    const { data } = await supabase.rpc("kpi_walkin_vs_appointment" as never, { _days: 30 } as never);
    return (data as unknown as { day: string; walk_in: number; scheduled: number }[]) ?? [];
  }});


  // group revenue by dept
  const byDept = new Map<string, number>();
  (revenue.data ?? []).forEach((r) => byDept.set(r.dept, (byDept.get(r.dept) ?? 0) + Number(r.revenue_cents)));
  const totalRev = Array.from(byDept.values()).reduce((s,v)=>s+v,0);

  const mixRows = mix.data ?? [];
  const walkTotal = mixRows.reduce((s, r) => s + Number(r.walk_in ?? 0), 0);
  const schedTotal = mixRows.reduce((s, r) => s + Number(r.scheduled ?? 0), 0);
  const mixTotal = walkTotal + schedTotal;
  const maxDay = Math.max(1, ...mixRows.map((r) => Number(r.walk_in ?? 0) + Number(r.scheduled ?? 0)));

  async function refresh() {
    await supabase.rpc("refresh_admin_kpis" as never);
    revenue.refetch(); occ.refetch(); alos.refetch(); denial.refetch(); tat.refetch(); mix.refetch();
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">KPI command center</h1>
          <p className="text-sm text-muted-foreground">Cached every 5 minutes. Click refresh for live snapshot.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>Refresh now</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Receipt} title="Revenue (30d)" value={money(totalRev)} sub={`${byDept.size} departments`} color="text-blue-500" />
        <Kpi icon={BedDouble} title="Occupancy" value={`${avg(occ.data?.map(o=>o.occupancy_pct))}%`} sub={`${sum(occ.data?.map(o=>o.occupied))} / ${sum(occ.data?.map(o=>o.total_beds))} beds`} color="text-amber-500" />
        <Kpi icon={ClipboardList} title="ALOS (30d)" value={`${alos.data?.alos_days ?? "—"} days`} sub={`${alos.data?.discharges_30d ?? 0} discharges`} color="text-emerald-500" />
        <Kpi icon={ShieldX} title="Denial rate" value={`${denial.data?.denial_pct ?? 0}%`} sub={`${denial.data?.denied_count ?? 0} of ${denial.data?.decided_count ?? 0} claims`} color="text-rose-500" />
        <Kpi icon={Timer} title="Lab TAT" value={`${tat.data?.tat_minutes ?? "—"} min`} sub={`${tat.data?.samples_30d ?? 0} samples`} color="text-violet-500" />
        <Kpi icon={Activity} title="Wards active" value={(occ.data?.length ?? 0).toString()} sub="across hospital" color="text-cyan-500" />
        <Kpi icon={CalendarClock} title="Scheduled share (30d)" value={`${mixTotal ? Math.round(100 * schedTotal / mixTotal) : 0}%`} sub={`${schedTotal} scheduled · ${walkTotal} walk-in`} color="text-indigo-500" />
      </div>

      <Card>
        <CardHeader><CardTitle>Walk-in vs appointment (30 days)</CardTitle></CardHeader>
        <CardContent>
          {mixRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visit activity in the last 30 days.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-primary" /> Scheduled ({schedTotal})</span>
                <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-amber-500" /> Walk-in ({walkTotal})</span>
              </div>
              <div className="flex h-40 items-end gap-1">
                {mixRows.map((r) => {
                  const w = Number(r.walk_in ?? 0), s = Number(r.scheduled ?? 0);
                  return (
                    <div key={r.day} className="flex flex-1 flex-col justify-end" title={`${new Date(r.day).toLocaleDateString("en-GB")} — ${s} scheduled, ${w} walk-in`}>
                      <div className="w-full bg-amber-500" style={{ height: `${(w / maxDay) * 100}%` }} />
                      <div className="w-full bg-primary" style={{ height: `${(s / maxDay) * 100}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{new Date(mixRows[0]!.day).toLocaleDateString("en-GB")}</span>
                <span>{new Date(mixRows[mixRows.length - 1]!.day).toLocaleDateString("en-GB")}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>



      <Card>
        <CardHeader><CardTitle>Revenue by department (30d)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Dept</th><th>Revenue</th><th>Share</th></tr></thead>
            <tbody>
              {Array.from(byDept.entries()).sort((a,b)=>b[1]-a[1]).map(([d,v]) => (
                <tr key={d} className="border-t"><td className="py-1">{d}</td><td>{money(v)}</td><td>{totalRev ? Math.round(100*v/totalRev) : 0}%</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Live occupancy heatmap</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {(occ.data ?? []).map((w) => (
              <div key={w.ward} className="rounded border p-3">
                <div className="flex items-center justify-between"><b>{w.ward}</b><span className={`text-sm ${w.occupancy_pct>=85?"text-rose-600":w.occupancy_pct>=60?"text-amber-600":"text-emerald-600"}`}>{w.occupancy_pct}%</span></div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, w.occupancy_pct)}%` }} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{w.occupied}/{w.total_beds} occupied · {w.free} free · {w.cleaning} cleaning</div>
              </div>
            ))}
            {(occ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No wards configured yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, title, value, sub, color }: { icon: typeof Activity; title: string; value: string; sub?: string; color: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent><div className="text-2xl font-semibold">{value}</div>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</CardContent>
    </Card>
  );
}

function sum(arr?: number[]) { return (arr ?? []).reduce((s,v)=>s+(v??0),0); }
function avg(arr?: number[]) { const a = arr ?? []; if (!a.length) return 0; return Math.round(a.reduce((s,v)=>s+(v??0),0)/a.length); }
