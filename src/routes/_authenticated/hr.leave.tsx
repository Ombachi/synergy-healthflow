import { createFileRoute } from "@tanstack/react-router";
import { Pager, usePager } from "@/components/pager";
import { useEffect, useState } from "react";
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
import { useServerFn } from "@tanstack/react-start";
import { decideLeave, hrStaffOptions } from "@/lib/hr.functions";
import { useFacility } from "@/components/facility-context";
import { leaveCalendarDays } from "@/lib/hr-rules";

export const Route = createFileRoute("/_authenticated/hr/leave")({
  head: () => ({ meta: [{ title: "Hr Leave — Litu Vault" }, { name: "description", content: "Hr Leave workspace in Litu Vault, scoped to your active facility." }, { property: "og:title", content: "Hr Leave — Litu Vault" }, { property: "og:description", content: "Hr Leave workspace in Litu Vault, scoped to your active facility." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
  const { user } = useAuth();
  const { activeFacility, roles, error: facilityError, loading: facilityLoading } = useFacility();
  const saveDecision = useServerFn(decideLeave);
  const loadStaff = useServerFn(hrStaffOptions);
  const [deciding, setDeciding] = useState<string | null>(null);
  const isHR = roles.some(role => ["admin", "hr_officer", "hr_manager"].includes(role));
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
  const days = leaveCalendarDays(start, end);
  const crossYear = !!start && !!end && start.slice(0, 4) !== end.slice(0, 4);
  const [typeError, setTypeError] = useState("");
  const [mineError, setMineError] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTypeError("");
    void (async () => {
      const result = await supabase.from("leave_types" as never).select("id,name,code").order("name");
      if (result.error) throw new Error("Leave types could not be loaded.");
      if (!cancelled) setTypes((result.data ?? []) as LType[]);
    })().catch(e => { if (!cancelled) setTypeError(e.message); });
    return () => { cancelled = true; };
  }, [refreshTick]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setMine([]); setMineError(""); setLoadingMine(true);
    void (async () => {
      const result = await supabase.from("leave_requests" as never)
        .select("*, leave_types(name), employees!leave_requests_employee_id_fkey(full_name)")
        .eq("employee_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (result.error) throw new Error("Your leave requests could not be loaded.");
      if (!cancelled) setMine((result.data ?? []) as LR[]);
    })().catch(e => { if (!cancelled) setMineError(e.message); })
      .finally(() => { if (!cancelled) setLoadingMine(false); });
    return () => { cancelled = true; };
  }, [user, refreshTick]);

  useEffect(() => {
    let cancelled = false;
    setForApproval([]); setApprovalError("");
    if (!isHR || facilityLoading || facilityError) { setLoadingApprovals(false); return; }
    setLoadingApprovals(true);
    void (async () => {
      const ids = (await loadStaff({ data: { facilityId: activeFacility.id } })).map(r => r.id);
      if (!ids.length) return;
      const result = await supabase.from("leave_requests" as never)
        .select("*, leave_types(name), employees!leave_requests_employee_id_fkey(full_name)")
        .in("status", ["submitted", "pending", "clarification"]).in("employee_id", ids)
        .order("created_at", { ascending: false }).limit(100);
      if (result.error) throw new Error("Branch leave requests could not be loaded.");
      if (!cancelled) setForApproval((result.data ?? []) as LR[]);
    })().catch(e => { if (!cancelled) setApprovalError(e instanceof Error ? e.message : "Branch leave requests could not be loaded."); })
      .finally(() => { if (!cancelled) setLoadingApprovals(false); });
    return () => { cancelled = true; };
  }, [isHR, refreshTick, activeFacility.id, loadStaff, facilityLoading, facilityError]);

  async function submit() {
    if (submitting) return;
    if (!user || !typeId || days <= 0) { toast.error("Select a leave type and valid dates"); return; }
    if (crossYear) { toast.error("Split leave into separate requests for each calendar year"); return; }
    setSubmitting(true);
    try {
      const result = await supabase.from("employees" as never).select("supervisor_id").eq("id", user.id).maybeSingle();
      if (result.error || !result.data) throw new Error("Your employee record could not be loaded. Ask HR to check your onboarding.");
      const supervisor_id = (result.data as { supervisor_id: string | null }).supervisor_id;
      const { error } = await supabase.from("leave_requests" as never).insert({
        employee_id: user.id, leave_type_id: typeId, start_date: start, end_date: end,
        days, reason: reason || null, supervisor_id, status: "submitted",
      } as never);
      if (error) throw new Error("Leave request was not saved. Please try again.");
      toast.success("Leave request submitted");
      setTypeId(""); setStart(""); setEnd(""); setReason(""); setRefreshTick(x => x + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Leave request was not saved."); }
    finally { setSubmitting(false); }
  }

  async function decide(id: string, status: "approved" | "rejected", asHR: boolean) {
    if (!user) return;
    if (!asHR || deciding || facilityLoading || facilityError) return;
    setDeciding(id);
    try {
      await saveDecision({ data: { id, status, facilityId: activeFacility.id, comment: "" } });
      toast.success(status === "approved" ? "Leave approved and balance deducted" : "Leave rejected");
      setRefreshTick(x => x + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Decision was not saved"); }
    finally { setDeciding(null); }
  }

  async function cancel(id: string) {
    if (!user) return;
    const { data, error } = await supabase.from("leave_requests" as never).update({ status: "cancelled" } as never).eq("id", id).eq("employee_id", user.id).in("status", ["submitted", "draft"]).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("This request can no longer be cancelled."); return; }
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
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="apply">Apply</TabsTrigger>
          <TabsTrigger value="mine">My requests</TabsTrigger>
          {isHR && <TabsTrigger value="approvals">Pending approvals ({forApproval.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="apply">
          <Card>
            <CardHeader><CardTitle>New leave request</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {typeError && <div className="md:col-span-2"><p role="alert" className="text-sm text-destructive">{typeError}</p><Button variant="outline" onClick={() => setRefreshTick(x => x + 1)}>Retry</Button></div>}
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
              {start && end && (days <= 0 || crossYear) && <p role="alert" className="text-sm text-destructive md:col-span-2">{crossYear ? "Split leave into separate requests for each calendar year." : "End date must be on or after the start date."}</p>}
              <div className="md:col-span-2 flex justify-end">
                <Button disabled={submitting || !!typeError || !typeId || days <= 0 || crossYear} onClick={submit}>{submitting ? "Submitting…" : "Submit request"}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mine">
          <Card>
            <CardHeader><CardTitle>My leave requests</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {loadingMine ? <p role="status">Loading your leave requests…</p> : mineError ? <div><p role="alert" className="text-destructive">{mineError}</p><Button variant="outline" onClick={() => setRefreshTick(x => x + 1)}>Retry</Button></div> : mine.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> : (
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

        {isHR && <TabsContent value="approvals">
          <Card>
            <CardHeader><CardTitle>Pending approvals</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {loadingApprovals ? <p role="status">Loading branch leave requests…</p> : approvalError || facilityError ? <div><p role="alert" className="text-destructive">{approvalError || facilityError}</p><Button variant="outline" onClick={() => setRefreshTick(x => x + 1)}>Retry</Button></div> : forApproval.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting on you.</p> : (
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
                          <Button size="sm" disabled={!isHR || !!deciding || r.employee_id === user?.id} onClick={() => decide(r.id, "approved", isHR)}>Approve</Button>
                          <Button size="sm" variant="destructive" disabled={!isHR || !!deciding || r.employee_id === user?.id} onClick={() => decide(r.id, "rejected", isHR)}>Reject</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pager {...approvalPager} label="approvals" />
                </>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {isHR ? "You are approving as HR — approval decrements the employee's leave balance." : "Final approval is handled by branch HR."}
              </p>
            </CardContent>
          </Card>
        </TabsContent>}
      </Tabs>
    </div>
  );
}

function StatusPill({ s }: { s: string }) {
  return <Badge variant={s === "rejected" ? "destructive" : s === "approved" ? "default" : "outline"}>{s}</Badge>;
}
