import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/team-manager")({
  component: TeamManagerDashboard,
});

interface Team { id: string; name: string; sport: string | null; season: string | null }
interface Competition { id: string; name: string; sport: string | null; scheduled_at: string | null; venue: string | null; opponents: string | null; result: string | null }

function TeamManagerDashboard() {
  const { hasAnyRole } = useAuth();
  const allowed = hasAnyRole(["team_manager", "coach", "admin"]);
  const qc = useQueryClient();
  const [teamOpen, setTeamOpen] = useState(false);
  const [team, setTeam] = useState({ name: "", sport: "", season: "" });
  const [compOpen, setCompOpen] = useState(false);
  const [comp, setComp] = useState({ name: "", sport: "", scheduled_at: "", venue: "", opponents: "" });

  const teams = useQuery({
    queryKey: ["tm-teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Team[]) ?? [];
    },
    enabled: allowed,
  });

  const comps = useQuery({
    queryKey: ["tm-comps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("competitions" as never).select("*").order("scheduled_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Competition[]) ?? [];
    },
    enabled: allowed,
  });

  const createTeam = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("teams" as never).insert(team as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tm-teams"] }); setTeamOpen(false); setTeam({ name: "", sport: "", season: "" }); toast.success("Team created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createComp = useMutation({
    mutationFn: async () => {
      const payload = { ...comp, scheduled_at: comp.scheduled_at ? new Date(comp.scheduled_at).toISOString() : null };
      const { error } = await supabase.from("competitions" as never).insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tm-comps"] }); setCompOpen(false); setComp({ name: "", sport: "", scheduled_at: "", venue: "", opponents: "" }); toast.success("Competition scheduled"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) return <p className="text-sm text-muted-foreground">Team manager access only.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team manager</h1>
        <p className="text-sm text-muted-foreground">Rosters and competitions calendar.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Teams</CardTitle>
          <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />New team</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New team</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} /></div>
                <div><Label>Sport</Label><Input value={team.sport} onChange={(e) => setTeam({ ...team, sport: e.target.value })} /></div>
                <div><Label>Season</Label><Input value={team.season} onChange={(e) => setTeam({ ...team, season: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => createTeam.mutate()} disabled={!team.name || createTeam.isPending}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {teams.data?.length === 0 ? <p className="text-sm text-muted-foreground">No teams yet.</p> : (
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Competitions</CardTitle>
          <Dialog open={compOpen} onOpenChange={setCompOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Schedule</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New competition</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={comp.name} onChange={(e) => setComp({ ...comp, name: e.target.value })} /></div>
                <div><Label>Sport</Label><Input value={comp.sport} onChange={(e) => setComp({ ...comp, sport: e.target.value })} /></div>
                <div><Label>Date / time</Label><Input type="datetime-local" value={comp.scheduled_at} onChange={(e) => setComp({ ...comp, scheduled_at: e.target.value })} /></div>
                <div><Label>Venue</Label><Input value={comp.venue} onChange={(e) => setComp({ ...comp, venue: e.target.value })} /></div>
                <div><Label>Opponents</Label><Input value={comp.opponents} onChange={(e) => setComp({ ...comp, opponents: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => createComp.mutate()} disabled={!comp.name || createComp.isPending}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {comps.data?.length === 0 ? <p className="text-sm text-muted-foreground">No competitions yet.</p> : (
            <div className="space-y-2">
              {comps.data?.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded border p-3 text-sm">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : "TBD"} • {c.venue ?? "—"} • vs {c.opponents ?? "—"}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{c.result ?? "pending"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
