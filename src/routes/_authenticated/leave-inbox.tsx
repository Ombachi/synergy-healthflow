import { createFileRoute } from "@tanstack/react-router";
import { Pager, usePager } from "@/components/pager";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leave-inbox")({ component: LeaveInbox });

interface LR { id: string; employee_id: string; status: string; start_date: string; end_date: string; days: number; reason: string | null; approver_comment: string | null }

function LeaveInbox() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const allowed = hasRole("admin") || hasRole("hr_officer") || hasRole("hr_manager") || hasRole("dept_manager");

  const q = useQuery({
    queryKey: ["leave-inbox"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_requests" as never)
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as LR[]) ?? [];
    },
  });

  async function decide(id: string, status: string) {
    const comment = window.prompt(`Comment for ${status} (optional)`) ?? "";
    const { error } = await supabase.from("leave_requests" as never).update({
      status, approver_comment: comment || null, decided_by: user?.id, decided_at: new Date().toISOString(),
    } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["leave-inbox"] });
  }

  if (!allowed) return <p className="text-sm text-muted-foreground">Manager/HR access only.</p>;

  const pager = usePager(decided, 20);
  const pending = (q.data ?? []).filter((r) => r.status === "pending" || r.status === "clarification");
  const decided = (q.data ?? []).filter((r) => !["pending", "clarification"].includes(r.status));

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
                <Button size="sm" onClick={() => decide(r.id, "approved")}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => decide(r.id, "clarification")}>Request info</Button>
                <Button size="sm" variant="destructive" onClick={() => decide(r.id, "rejected")}>Reject</Button>
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
