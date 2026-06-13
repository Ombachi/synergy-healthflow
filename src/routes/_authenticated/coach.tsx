import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/coach")({
  component: CoachDashboard,
});

interface Team { id: string; name: string; sport: string | null; season: string | null }
interface Session { id: string; scheduled_at: string; focus: string | null; status: string; location: string | null; team_id: string | null }
interface Athlete { id: string; full_name: string; status: string }

function CoachDashboard() {
  const { hasAnyRole } = useAuth();
  const allowed = hasAnyRole(["coach", "team_manager", "admin"]);

  const teams = useQuery({
    queryKey: ["coach-teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Team[]) ?? [];
    },
    enabled: allowed,
  });

  const sessions = useQuery({
    queryKey: ["coach-today-sessions"],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from("training_sessions" as never)
        .select("*")
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString())
        .order("scheduled_at");
      if (error) throw error;
      return (data as unknown as Session[]) ?? [];
    },
    enabled: allowed,
  });

  const active = useQuery({
    queryKey: ["coach-active-athletes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athletes" as never)
        .select("id, full_name, status")
        .neq("status", "archived")
        .order("full_name");
      if (error) throw error;
      return (data as unknown as Athlete[]) ?? [];
    },
    enabled: allowed,
  });

  if (!allowed) return <p className="text-sm text-muted-foreground">Coach access only.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Coach dashboard</h1>
        <p className="text-sm text-muted-foreground">Teams, today&apos;s sessions, athlete status.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Teams</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{teams.data?.length ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Today&apos;s sessions</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{sessions.data?.length ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Active athletes</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{active.data?.length ?? 0}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Today&apos;s training sessions</CardTitle></CardHeader>
        <CardContent>
          {sessions.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions scheduled today.</p>
          ) : (
            <div className="space-y-2">
              {sessions.data?.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded border p-3 text-sm">
                  <div>
                    <div className="font-medium">{s.focus ?? "Training"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.scheduled_at).toLocaleTimeString()} • {s.location ?? "—"}
                    </div>
                  </div>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Teams</CardTitle></CardHeader>
        <CardContent>
          {teams.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams yet. Create one from Team Manager.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {teams.data?.map((t) => (
                <div key={t.id} className="rounded border p-3 text-sm">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.sport ?? "—"} • {t.season ?? "—"}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
