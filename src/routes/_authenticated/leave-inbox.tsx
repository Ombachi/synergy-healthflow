import { createFileRoute } from "@tanstack/react-router";
import { Pager, usePager } from "@/components/pager";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { decideLeave, hrStaffOptions } from "@/lib/hr.functions";
import { useFacility } from "@/components/facility-context";

export const Route = createFileRoute("/_authenticated/leave-inbox")({  head: () => ({ meta: [{ title: "Leave Inbox — Litu Vault" }, { name: "description", content: "Leave Inbox workspace in Litu Vault, scoped to your active facility." }, { property: "og:title", content: "Leave Inbox — Litu Vault" }, { property: "og:description", content: "Leave Inbox workspace in Litu Vault, scoped to your active facility." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
component: LeaveInbox });

interface LR { id: string; employee_id: string; status: string; start_date: string; end_date: string; days: number; reason: string | null; approver_comment: string | null }

function LeaveInbox() {
  const { user, hasRole } = useAuth();
  const { activeFacility } = useFacility();
  const saveDecision = useServerFn(decideLeave);
  const loadStaff = useServerFn(hrStaffOptions);
  const [deciding, setDeciding] = useState<string | null>(null);
  const qc = useQueryClient();
  const allowed = hasRole("admin") || hasRole("hr_officer") || hasRole("hr_manager");

  const q = useQuery({
    queryKey: ["leave-inbox", activeFacility.id],
    enabled: allowed,
    queryFn: async () => {
      const ids = (await loadStaff({ data: { facilityId: activeFacility.id } })).map(r => r.id);
      const { data, error } = await supabase.from("leave_requests" as never)
        .select("*").in("employee_id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as LR[]) ?? [];
    },
  });

  async function decide(id: string, status: "approved" | "rejected" | "clarification") {
    if (deciding) return;
    const comment = window.prompt(`Comment for ${status} (optional)`);
    if (comment === null) return;
    setDeciding(id);
    try {
      await saveDecision({ data: { id, status, comment, facilityId: activeFacility.id } });
      toast.success(status === "approved" ? "Leave approved and balance deducted" : "Decision saved");
      void qc.invalidateQueries({ queryKey: ["leave-inbox", activeFacility.id] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Decision was not saved"); }
    finally { setDeciding(null); }
  }

  const pending = (q.data ?? []).filter((r) => ["submitted", "pending", "clarification"].includes(r.status));
  const decided = (q.data ?? []).filter((r) => !["submitted", "pending", "clarification"].includes(r.status));
  const pager = usePager(decided, 20);

  if (q.isPending && allowed) return <p role="status">Loading branch leave requests…</p>;
  if (q.isError) return <div><p role="alert" className="text-destructive">Leave requests could not be loaded.</p><Button onClick={() => q.refetch()}>Retry</Button></div>;
  if (!allowed) return <p className="text-sm text-muted-foreground">Manager/HR access only.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Leave inbox</h1>
        <p className="text-sm text-muted-foreground">Approve, reject, or request clarification.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Pending ({pending.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">All clear.</p> : pending.map((r) => (
            <div key={r.id} className="rounded border p-3 text-sm">
              <div className="flex justify-between">
                <div><span className="font-mono text-xs">{r.employee_id.slice(0, 8)}</span> • {r.start_date} → {r.end_date} ({r.days}d)</div>
                <span className="rounded bg-primary/10 px-2 text-xs text-primary">{r.status}</span>
              </div>
              {r.reason && <p className="text-xs text-muted-foreground">Reason: {r.reason}</p>}
              <div className="flex gap-2 pt-2">
                <Button disabled={!!deciding || r.employee_id === user?.id} size="sm" onClick={() => decide(r.id, "approved")}>Approve</Button>
                <Button disabled={!!deciding || r.employee_id === user?.id} size="sm" variant="outline" onClick={() => decide(r.id, "clarification")}>Request info</Button>
                <Button disabled={!!deciding || r.employee_id === user?.id} size="sm" variant="destructive" onClick={() => decide(r.id, "rejected")}>Reject</Button>
              </div>
            </div>
          ))}
          <Pager {...pager} label="decided requests" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Decided ({decided.length})</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {pager.slice.map((r) => (
            <div key={r.id} className="flex justify-between rounded border p-2 text-sm">
              <span>{r.start_date} → {r.end_date}</span>
              <span className="rounded bg-muted px-2 text-xs">{r.status}</span>
            </div>
          ))}
          <Pager {...pager} label="decided requests" />
        </CardContent>
      </Card>
    </div>
  );
}
