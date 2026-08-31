import { createFileRoute } from "@tanstack/react-router";
import { Pager, usePager } from "@/components/pager";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/leave")({
  component: () => (
    <RoleGate path="/hr/leave">
      <HrLeavePage />
    </RoleGate>
  ),
});

type LType = { id: string; name: string; code: string };
type LR = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  hr_notes: string | null;
  supervisor_notes: string | null;
  created_at: string;
  leave_types: { name: string } | null;
  employees: { full_name: string } | null;
};

function HrLeavePage() {
  const { user, hasAnyRole, roles } = useAuth();
  const isHR = hasAnyRole(["admin", "hr_officer", "hr_manager"]);
  const [types, setTypes] = useState<LType[]>([]);
  const [mine, setMine] = useState<LR[]>([]);
  const [forApproval, setForApproval] = useState<LR[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  const minePager = usePager(mine, 10);
  const approvalPager = usePager(forApproval, 10);
  // Form state
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const days = useMemo(() => {
    if (!start || !end) return 0;
    const s = new Date(start); const e = new Date(end);
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  }, [start, end]);

  useEffect(() => {
    void (async () => {
      const { data: t } = await supabase.from("leave_types" as never).select("id,name,code").order("name");
      setTypes((t ?? []) as LType[]);
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: m } = await supabase
        .from("leave_requests" as never)
        .select("*, leave_types(name), employees!leave_requests_employee_id_fkey(full_name)")
        .eq("employee_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setMine((m ?? []) as LR[]);

      // Approval queue: HR sees all submitted; supervisor sees their reports
      let q = supabase.from("leave_requests" as never)
        .select("*, leave_types(name), employees!leave_requests_employee_id_fkey(full_name)")
        .in("status", ["submitted"])
        .order("created_at", { ascending: false }).limit(100);
      if (!isHR) q = q.eq("supervisor_id", user.id);
      const { data: pq } = await q;
      setForApproval((pq ?? []) as LR[]);
    })();
  }, [user, isHR, refreshTick, roles]);

  async function submit() {
    if (!user || !typeId || !start || !end || days <= 0) { toast.error("Fill all leave fields"); return; }
    // Find supervisor
    const { data: emp } = await supabase.from("employees" as never).select("supervisor_id").eq("id", user.id).maybeSingle();
    const supervisor_id = (emp as { supervisor_id: string | null } | null)?.supervisor_id ?? null;
    const { error } = await supabase.from("leave_requests" as never).insert({
      employee_id: user.id, leave_type_id: typeId,
      start_date: start, end_date: end, days, reason: reason || null,
      supervisor_id, status: "submitted",
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Leave request submitted");
    setTypeId(""); setStart(""); setEnd(""); setReason("");
    setRefreshTick((x) => x + 1);
  }

  async function decide(id: string, status: "approved" | "rejected", asHR: boolean) {
    if (!user) return;
    const patch: Record<string, unknown> = { status };
    if (asHR) { patch.hr_id = user.id; patch.hr_decision_at = new Date().toISOString(); }
    else { patch.supervisor_id = user.id; patch.supervisor_decision_at = new Date().toISOString(); }
    const { error } = await supabase.from("leave_requests" as never).update(patch as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${status}`);
    setRefreshTick((x) => x + 1);
  }

  async function cancel(id: string) {
    const { error } = await supabase.from("leave_requests" as never).update({ status: "cancelled" } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Request cancelled");
    setRefreshTick((x) => x + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leave</h1>
        <p className="text-sm text-muted-foreground">Apply for leave, review your history, and act on pending approvals.</p>
      </div>

      <Tabs defaultValue="apply">
        <TabsList>
          <TabsTrigger value="apply">Apply</TabsTrigger>
          <TabsTrigger value="mine">My requests</TabsTrigger>
          <TabsTrigger value="approvals">Pending approvals ({forApproval.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="apply">
          <Card>
            <CardHeader><CardTitle>New leave request</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
                  <SelectContent>
                    {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Calculated days</Label>
                <Input value={days} readOnly />
              </div>
              <div className="space-y-1">
                <Label>Start date</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>End date</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Reason</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Brief reason for leave" />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={submit}>Submit request</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mine">
          <Card>
            <CardHeader><CardTitle>My leave requests</CardTitle></CardHeader>
            <CardContent>
              {mine.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> : (
                <>
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">From → To</th>
                      <th className="text-right p-2">Days</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Notes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {minePager.slice.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.leave_types?.name ?? "—"}</td>
                        <td className="p-2">{r.start_date} → {r.end_date}</td>
                        <td className="p-2 text-right">{r.days}</td>
                        <td className="p-2"><StatusPill s={r.status} /></td>
                        <td className="p-2 text-xs text-muted-foreground">{r.hr_notes || r.supervisor_notes || "—"}</td>
                        <td className="p-2 text-right">
                          {(r.status === "submitted" || r.status === "draft") && (
                            <Button size="sm" variant="outline" onClick={() => cancel(r.id)}>Cancel</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pager {...minePager} label="requests" />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals">
          <Card>
            <CardHeader><CardTitle>Pending approvals</CardTitle></CardHeader>
            <CardContent>
              {forApproval.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting on you.</p> : (
                <>
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Employee</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">From → To</th>
                      <th className="text-right p-2">Days</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalPager.slice.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.employees?.full_name ?? "—"}</td>
                        <td className="p-2">{r.leave_types?.name ?? "—"}</td>
                        <td className="p-2">{r.start_date} → {r.end_date}</td>
                        <td className="p-2 text-right">{r.days}</td>
                        <td className="p-2 text-right space-x-2">
                          <Button size="sm" onClick={() => decide(r.id, "approved", isHR)}>Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => decide(r.id, "rejected", isHR)}>Reject</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pager {...approvalPager} label="approvals" />
                </>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {isHR ? "You are approving as HR — approval decrements the employee's leave balance." : "You are approving as the supervisor; HR will finalise."}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusPill({ s }: { s: string }) {
  const color = s === "approved" ? "bg-emerald-500/15 text-emerald-700"
              : s === "rejected" ? "bg-red-500/15 text-red-700"
              : s === "cancelled" ? "bg-muted text-muted-foreground"
              : "bg-amber-500/15 text-amber-700";
  return <Badge variant="outline" className={color}>{s}</Badge>;
}
