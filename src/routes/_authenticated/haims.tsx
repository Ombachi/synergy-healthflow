import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Activity, Users, Clock, TrendingUp, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/haims")({
  component: () => <RoleGate path="/haims"><HaimsDashboard /></RoleGate>,
});

function HaimsDashboard() {
  const kpi = useQuery({
    queryKey: ["haims-kpi"],
    queryFn: async () => {
      const [beds, adm, rounds, alerts] = await Promise.all([
        supabase.from("beds" as never).select("id, status", { count: "exact" }),
        supabase.from("admissions" as never).select("id, admitted_at, status", { count: "exact" }).eq("status", "active"),
        supabase.from("ward_rounds" as never).select("id", { count: "exact", head: true }).gte("round_at", new Date(Date.now() - 86400000).toISOString()),
        supabase.from("infection_control_alerts" as never).select("id", { count: "exact", head: true }).eq("status", "active"),
      ]);
      const bedRows = (beds.data as { status: string }[]) ?? [];
      const occupied = bedRows.filter((b) => b.status === "occupied").length;
      const admRows = (adm.data as { admitted_at: string }[]) ?? [];
      const alos = admRows.length === 0 ? 0 :
        admRows.reduce((sum, a) => sum + (Date.now() - new Date(a.admitted_at).getTime()) / 86400000, 0) / admRows.length;
      return {
        totalBeds: bedRows.length,
        occupied,
        occupancyPct: bedRows.length ? Math.round((occupied / bedRows.length) * 100) : 0,
        activeAdmissions: admRows.length,
        roundsToday: rounds.count ?? 0,
        ipcAlerts: alerts.count ?? 0,
        alos: Number(alos.toFixed(1)),
      };
    },
  });

  const s = kpi.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">HAIMS · Executive Dashboard</h1>
        <p className="text-sm text-muted-foreground">Hospital-wide inpatient occupancy, throughput and quality metrics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat icon={BedDouble} label="Occupancy" value={s ? `${s.occupancyPct}%` : "…"} sub={s && `${s.occupied}/${s.totalBeds} beds`} />
        <Stat icon={Users} label="Active inpatients" value={s?.activeAdmissions ?? "…"} />
        <Stat icon={Clock} label="Avg LOS (days)" value={s?.alos ?? "…"} />
        <Stat icon={Activity} label="Rounds (24h)" value={s?.roundsToday ?? "…"} />
        <Stat icon={ShieldAlert} label="IPC alerts" value={s?.ipcAlerts ?? "…"} />
        <Stat icon={TrendingUp} label="Discharge planning" value="→" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">HAIMS modules</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <ModuleLink to="/admissions" label="Admission management" />
          <ModuleLink to="/beds" label="Bed & ward management" />
          <ModuleLink to="/nursing-station" label="Nursing ward dashboard" />
          <ModuleLink to="/ward-rounds" label="Consultant ward rounds" />
          <ModuleLink to="/emar" label="Medication administration (eMAR)" />
          <ModuleLink to="/monitoring" label="Clinical monitoring & scores" />
          <ModuleLink to="/care-plans" label="Care plans" />
          <ModuleLink to="/inpatient-procedures" label="Procedure management" />
          <ModuleLink to="/allied-health" label="Allied health services" />
          <ModuleLink to="/infection-control" label="Infection prevention & control" />
          <ModuleLink to="/surgery" label="Surgery / theatre" />
          <ModuleLink to="/discharge-planning" label="Discharge planning" />
          <ModuleLink to="/ward-analytics" label="Ward analytics" />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof BedDouble; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
function ModuleLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="rounded-md border p-3 text-sm hover:bg-muted">{label}</Link>
  );
}
