import { createFileRoute } from "@tanstack/react-router";
import { Pager, usePager } from "@/components/pager";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFacility } from "@/components/facility-context";
import { hrFacilityScope } from "@/lib/hr-facility-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/attendance")({  head: () => ({ meta: [{ title: "Attendance — Litu Vault" }, { name: "description", content: "Attendance workspace in Litu Vault, scoped to your active facility." }, { property: "og:title", content: "Attendance — Litu Vault" }, { property: "og:description", content: "Attendance workspace in Litu Vault, scoped to your active facility." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
component: AttendancePage });

interface Att { id: string; user_id: string; clock_in: string | null; clock_out: string | null; department: string | null; notes: string | null }

function AttendancePage() {
  const { user } = useAuth();
  const { activeFacility, roles, loading: facilityLoading, error: facilityError, refresh } = useFacility();
  const qc = useQueryClient();
  const isManager = roles.some(role => ["admin", "hr_officer", "hr_manager", "dept_manager"].includes(role));
  const ready = !!user && !facilityLoading && !facilityError;

  const mine = useQuery({
    queryKey: ["att-mine", activeFacility.id, user?.id],
    queryFn: async () => {
      const scope = hrFacilityScope(activeFacility.id, user?.id ?? "", false);
      const { data, error } = await supabase.from("attendance" as never).select("*")
        .eq("facility_id", scope.facilityId).eq("user_id", user?.id ?? "").order("clock_in", { ascending: false }).limit(30);
      if (error) throw error;
      return (data as unknown as Att[]) ?? [];
    },
    enabled: ready,
  });

  const all = useQuery({
    queryKey: ["att-all", activeFacility.id, user?.id],
    queryFn: async () => {
      const scope = hrFacilityScope(activeFacility.id, user?.id ?? "", true);
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase.from("attendance" as never).select("*")
        .eq("facility_id", scope.facilityId).gte("clock_in", since).order("clock_in", { ascending: false });
      if (error) throw error;
      return (data as unknown as Att[]) ?? [];
    },
    enabled: isManager && ready,
  });

  const minePager = usePager(mine.data ?? [], 10);
  const allPager = usePager(all.data ?? [], 20);
  const open = (mine.data ?? []).find((a) => a.clock_in && !a.clock_out);

  async function clockIn() {
    if (!user || !ready || mine.isPending || mine.isError || open) return;
    const { error } = await supabase.from("attendance" as never).insert({
      facility_id: activeFacility.id, user_id: user.id, clock_in: new Date().toISOString(),
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Clocked in");
    qc.invalidateQueries({ queryKey: ["att-mine"] });
  }
  async function clockOut() {
    if (!open || !user || !ready || mine.isPending || mine.isError) return;
    const { data, error } = await supabase.from("attendance" as never).update({
      clock_out: new Date().toISOString(),
    } as never).eq("id", open.id).eq("user_id", user.id).eq("facility_id", activeFacility.id).select("id");
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Attendance was not updated in this facility.");
    toast.success("Clocked out");
    qc.invalidateQueries({ queryKey: ["att-mine"] });
  }

  const totalHours = (mine.data ?? []).reduce((acc, a) => {
    if (!a.clock_in || !a.clock_out) return acc;
    return acc + (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3600000;
  }, 0);

  if (facilityLoading) return <p role="status">Loading your facility…</p>;
  if (facilityError) return <div role="alert" className="space-y-3"><p>{facilityError}</p><Button onClick={refresh}>Retry</Button></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-muted-foreground">Clock in and out, view summaries.</p>
        </div>
        {open ? <Button disabled={mine.isPending || mine.isError} onClick={clockOut} variant="destructive">Clock out</Button>
              : <Button disabled={mine.isPending || mine.isError} onClick={clockIn}>Clock in</Button>}
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
          {mine.isPending ? <p role="status">Loading attendance…</p> : mine.isError ? <div role="alert"><p className="text-destructive">Attendance is unavailable. Check the branch setup and connection.</p><Button variant="outline" onClick={() => void mine.refetch()}>Retry</Button></div> : (mine.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No records yet.</p> : (
            <div className="space-y-1 text-sm">
              {minePager.slice.map((a) => (
                <div key={a.id} className="flex justify-between rounded border p-2">
                  <span>{a.clock_in ? new Date(a.clock_in).toLocaleString("en-GB") : "—"}</span>
                  <span>{a.clock_out ? new Date(a.clock_out).toLocaleString("en-GB") : "in progress"}</span>
                </div>
              ))}
              <Pager {...minePager} label="entries" />
            </div>
          )}
        </CardContent>
      </Card>

      {isManager && (
        <Card>
          <CardHeader><CardTitle>Team attendance — last 7 days</CardTitle></CardHeader>
          <CardContent>
            {all.isPending ? <p role="status">Loading team attendance…</p> : all.isError ? <div role="alert"><p className="text-destructive">Team attendance is unavailable for this facility.</p><Button variant="outline" onClick={() => void all.refetch()}>Retry</Button></div> : (all.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No records.</p> : (
              <div className="space-y-1 text-sm">
                <div className="text-xs text-muted-foreground">Total entries: {all.data?.length}</div>
                {allPager.slice.map((a) => (
                  <div key={a.id} className="flex justify-between rounded border p-2">
                    <span className="font-mono text-xs">{a.user_id.slice(0, 8)}</span>
                    <span>{a.clock_in ? new Date(a.clock_in).toLocaleString("en-GB") : "—"} → {a.clock_out ? new Date(a.clock_out).toLocaleTimeString("en-GB") : "open"}</span>
                  </div>
                ))}
                <Pager {...allPager} label="team entries" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
