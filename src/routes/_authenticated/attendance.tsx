import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/attendance")({ component: AttendancePage });

interface Att { id: string; user_id: string; clock_in: string | null; clock_out: string | null; department: string | null; notes: string | null }

function AttendancePage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isManager = hasRole("admin") || hasRole("hr_officer") || hasRole("hr_manager") || hasRole("dept_manager");

  const mine = useQuery({
    queryKey: ["att-mine"],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance" as never).select("*")
        .eq("user_id", user!.id).order("clock_in", { ascending: false }).limit(30);
      if (error) throw error;
      return (data as unknown as Att[]) ?? [];
    },
    enabled: !!user,
  });

  const all = useQuery({
    queryKey: ["att-all"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase.from("attendance" as never).select("*")
        .gte("clock_in", since).order("clock_in", { ascending: false });
      if (error) throw error;
      return (data as unknown as Att[]) ?? [];
    },
    enabled: isManager,
  });

  const open = (mine.data ?? []).find((a) => a.clock_in && !a.clock_out);

  async function clockIn() {
    const { error } = await supabase.from("attendance" as never).insert({
      user_id: user?.id, clock_in: new Date().toISOString(),
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Clocked in");
    qc.invalidateQueries({ queryKey: ["att-mine"] });
  }
  async function clockOut() {
    if (!open) return;
    const { error } = await supabase.from("attendance" as never).update({
      clock_out: new Date().toISOString(),
    } as never).eq("id", open.id);
    if (error) return toast.error(error.message);
    toast.success("Clocked out");
    qc.invalidateQueries({ queryKey: ["att-mine"] });
  }

  const totalHours = (mine.data ?? []).reduce((acc, a) => {
    if (!a.clock_in || !a.clock_out) return acc;
    return acc + (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3600000;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-muted-foreground">Clock in and out, view summaries.</p>
        </div>
        {open ? <Button onClick={clockOut} variant="destructive">Clock out</Button>
              : <Button onClick={clockIn}>Clock in</Button>}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{open ? "On shift" : "Off"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Last 30 entries — hours</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{totalHours.toFixed(1)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Entries</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{mine.data?.length ?? 0}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>My recent attendance</CardTitle></CardHeader>
        <CardContent>
          {(mine.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No records yet.</p> : (
            <div className="space-y-1 text-sm">
              {mine.data?.map((a) => (
                <div key={a.id} className="flex justify-between rounded border p-2">
                  <span>{a.clock_in ? new Date(a.clock_in).toLocaleString("en-GB") : "—"}</span>
                  <span>{a.clock_out ? new Date(a.clock_out).toLocaleString("en-GB") : "in progress"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isManager && (
        <Card>
          <CardHeader><CardTitle>Team attendance — last 7 days</CardTitle></CardHeader>
          <CardContent>
            {(all.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No records.</p> : (
              <div className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Total entries: {all.data?.length}</div>
                {all.data?.slice(0, 50).map((a) => (
                  <div key={a.id} className="flex justify-between rounded border p-2">
                    <span className="font-mono text-xs">{a.user_id.slice(0, 8)}</span>
                    <span>{a.clock_in ? new Date(a.clock_in).toLocaleString("en-GB") : "—"} → {a.clock_out ? new Date(a.clock_out).toLocaleTimeString("en-GB") : "open"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
