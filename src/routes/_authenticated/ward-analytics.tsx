import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/ward-analytics")({
  component: () => <RoleGate path="/ward-analytics"><WardAnalytics /></RoleGate>,
});

interface Bed { id: string; ward_id: string; status: string }
interface Ward { id: string; name: string }
interface Adm { id: string; bed_id: string | null; admitted_at: string; discharged_at: string | null; status: string }

function WardAnalytics() {
  const wards = useQuery({ queryKey: ["wards"], queryFn: async () => {
    const { data } = await supabase.from("wards" as never).select("id, name").order("name");
    return (data as unknown as Ward[]) ?? [];
  }});
  const beds = useQuery({ queryKey: ["beds"], queryFn: async () => {
    const { data } = await supabase.from("beds" as never).select("id, ward_id, status");
    return (data as unknown as Bed[]) ?? [];
  }});
  const admissions = useQuery({ queryKey: ["adm-all"], queryFn: async () => {
    const { data } = await supabase.from("admissions" as never).select("id, bed_id, admitted_at, discharged_at, status").gte("admitted_at", new Date(Date.now() - 30 * 86400000).toISOString());
    return (data as unknown as Adm[]) ?? [];
  }});
  const falls = useQuery({ queryKey: ["qual"], queryFn: async () => {
    const { data } = await supabase.from("quality_events" as never).select("id, event_type, occurred_at").gte("occurred_at", new Date(Date.now() - 30 * 86400000).toISOString());
    return (data as unknown as { event_type: string }[]) ?? [];
  }});
  const hais = useQuery({ queryKey: ["hai"], queryFn: async () => {
    const { data } = await supabase.from("infection_control_alerts" as never).select("id, is_hospital_acquired").eq("is_hospital_acquired", true);
    return (data as { id: string }[]).length;
  }});

  // Compute per-ward
  const rows = (wards.data ?? []).map((w) => {
    const wBeds = (beds.data ?? []).filter((b) => b.ward_id === w.id);
    const occ = wBeds.filter((b) => b.status === "occupied").length;
    const wAdmIds = new Set(wBeds.map((b) => b.id));
    const wAdm = (admissions.data ?? []).filter((a) => a.bed_id && wAdmIds.has(a.bed_id));
    const discharged = wAdm.filter((a) => a.discharged_at);
    const alos = discharged.length === 0 ? 0 :
      discharged.reduce((s, a) => s + (new Date(a.discharged_at!).getTime() - new Date(a.admitted_at).getTime()) / 86400000, 0) / discharged.length;
    return {
      ward: w.name,
      beds: wBeds.length,
      occupancy: wBeds.length ? Math.round((occ / wBeds.length) * 100) : 0,
      admissions30d: wAdm.length,
      discharges30d: discharged.length,
      alos: Number(alos.toFixed(1)),
    };
  });

  const fallCount = (falls.data ?? []).filter((f) => f.event_type === "fall").length;
  const pressureCount = (falls.data ?? []).filter((f) => f.event_type === "pressure_injury").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><BarChart3 className="h-6 w-6" /> Ward analytics</h1>
        <p className="text-sm text-muted-foreground">Occupancy, throughput and quality metrics — last 30 days.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Falls (30d)" value={fallCount} />
        <Kpi label="Pressure injuries (30d)" value={pressureCount} />
        <Kpi label="Hospital-acquired infections" value={hais.data ?? "…"} />
        <Kpi label="Wards" value={(wards.data ?? []).length} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Per-ward metrics</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Ward</th>
                  <th className="text-right">Beds</th>
                  <th className="text-right">Occupancy</th>
                  <th className="text-right">Admissions (30d)</th>
                  <th className="text-right">Discharges (30d)</th>
                  <th className="text-right">ALOS (days)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ward} className="border-t">
                    <td className="py-2">{r.ward}</td>
                    <td className="text-right">{r.beds}</td>
                    <td className="text-right">{r.occupancy}%</td>
                    <td className="text-right">{r.admissions30d}</td>
                    <td className="text-right">{r.discharges30d}</td>
                    <td className="text-right">{r.alos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold">{value}</div></CardContent></Card>
  );
}
