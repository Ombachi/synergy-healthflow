import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, AlertTriangle, Pill, Droplets, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleGate } from "@/components/role-gate";
import { useActiveAdmissions } from "@/components/admission-picker";

export const Route = createFileRoute("/_authenticated/nursing-station")({
  component: () => <RoleGate path="/nursing-station"><NursingStation /></RoleGate>,
});

function NursingStation() {
  const admissions = useActiveAdmissions();
  const admIds = (admissions.data ?? []).map((a) => a.id);

  const scores = useQuery({
    queryKey: ["ns-scores", admIds.join(",")], enabled: admIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("warning_scores" as never)
        .select("admission_id, scale, total_score, risk_level, scored_at")
        .in("admission_id", admIds as never)
        .order("scored_at", { ascending: false });
      return (data as unknown as { admission_id: string; scale: string; total_score: number; risk_level: string; scored_at: string }[]) ?? [];
    },
  });
  const ipc = useQuery({
    queryKey: ["ns-ipc", admIds.join(",")], enabled: admIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("infection_control_alerts" as never).select("admission_id, precaution_type, organism")
        .in("admission_id", admIds as never).eq("status", "active");
      return (data as unknown as { admission_id: string; precaution_type: string; organism: string | null }[]) ?? [];
    },
  });
  const meds = useQuery({
    queryKey: ["ns-meds", admIds.join(",")], enabled: admIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("medication_orders" as never).select("admission_id, status")
        .in("admission_id", admIds as never).eq("status", "active");
      return (data as unknown as { admission_id: string; status: string }[]) ?? [];
    },
  });

  const latestScore = (id: string) => (scores.data ?? []).find((s) => s.admission_id === id && s.scale === "news2");
  const ipcFor = (id: string) => (ipc.data ?? []).filter((a) => a.admission_id === id);
  const medCount = (id: string) => (meds.data ?? []).filter((m) => m.admission_id === id).length;

  const wardGroups = new Map<string, ReturnType<typeof useActiveAdmissions>["data"] extends (infer T)[] | undefined ? T[] : never>();
  for (const a of admissions.data ?? []) {
    const k = a.ward_name ?? "Unassigned";
    if (!wardGroups.has(k)) wardGroups.set(k, []);
    wardGroups.get(k)!.push(a);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Users className="h-6 w-6" /> Nursing ward dashboard</h1>
        <p className="text-sm text-muted-foreground">Live ward census, warning scores, IPC precautions and active medications.</p>
      </div>

      {Array.from(wardGroups.entries()).map(([ward, list]) => (
        <Card key={ward}>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between">{ward}<span className="text-sm text-muted-foreground">{list.length} patients</span></CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Bed</th>
                    <th className="text-left">Patient</th>
                    <th className="text-left">NEWS2</th>
                    <th className="text-left">IPC</th>
                    <th className="text-left">Meds</th>
                    <th className="text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => {
                    const s = latestScore(a.id);
                    const alerts = ipcFor(a.id);
                    return (
                      <tr key={a.id} className="border-t">
                        <td className="py-2 font-mono">{a.bed_code ?? "—"}</td>
                        <td>{a.patient_name}</td>
                        <td>
                          {s ? (
                            <span className="flex items-center gap-1">
                              {s.total_score}
                              <Badge className={s.risk_level === "high" ? "bg-rose-600" : s.risk_level === "medium" ? "bg-amber-500" : "bg-emerald-600"}>
                                {s.risk_level}
                              </Badge>
                            </span>
                          ) : <span className="text-muted-foreground text-xs">not scored</span>}
                        </td>
                        <td>
                          {alerts.length === 0 ? <span className="text-muted-foreground text-xs">—</span> :
                            alerts.map((x, i) => <Badge key={i} className="mr-1 bg-amber-500 capitalize"><AlertTriangle className="mr-1 h-3 w-3" />{x.precaution_type}</Badge>)}
                        </td>
                        <td><span className="flex items-center gap-1 text-xs"><Pill className="h-3 w-3" />{medCount(a.id)}</span></td>
                        <td className="space-x-2">
                          <Link to="/monitoring" className="text-xs text-primary underline"><Droplets className="inline h-3 w-3" /> chart</Link>
                          <Link to="/emar" className="text-xs text-primary underline"><Pill className="inline h-3 w-3" /> eMAR</Link>
                          <Link to="/ward-rounds" className="text-xs text-primary underline"><Stethoscope className="inline h-3 w-3" /> notes</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
      {(admissions.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No active inpatients.</p>}
    </div>
  );
}
