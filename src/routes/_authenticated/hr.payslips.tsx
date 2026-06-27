import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { exportPayslipPDF } from "@/lib/payslip-pdf";

export const Route = createFileRoute("/_authenticated/hr/payslips")({
  component: () => (
    <RoleGate path="/hr/payslips">
      <PayslipsPage />
    </RoleGate>
  ),
});

type Period = { id: string; label: string; period_start: string; period_end: string; status: string };
type EmpRef = { id: string; full_name: string; employee_no: string | null; position: string | null };
type Slip = {
  id: string; employee_id: string; period_id: string;
  basic_cents: number; allowances_cents: number; overtime_cents: number;
  paye_cents: number; nhif_cents: number; nssf_cents: number; housing_levy_cents: number;
  other_deductions_cents: number; net_cents: number; notes: string | null; published: boolean;
  payroll_periods: Period | null;
  employees: EmpRef | null;
};

function kes(c: number) { return "KES " + (c / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 }); }

function PayslipsPage() {
  const { user, hasAnyRole } = useAuth();
  const isHR = hasAnyRole(["admin", "hr_officer", "hr_manager"]);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      let q = supabase.from("payslips" as never)
        .select("*, payroll_periods(*), employees!payslips_employee_id_fkey(id,full_name,employee_no,position)")
        .order("created_at", { ascending: false }).limit(200);
      if (!isHR) q = q.eq("employee_id", user.id).eq("published", true);
      const { data } = await q;
      setSlips((data ?? []) as Slip[]);
      const { data: pp } = await supabase.from("payroll_periods" as never).select("*").order("period_end", { ascending: false });
      setPeriods((pp ?? []) as Period[]);
    })();
  }, [user, isHR, refresh]);

  function recalcNet(s: Partial<Slip>): number {
    return (s.basic_cents ?? 0) + (s.allowances_cents ?? 0) + (s.overtime_cents ?? 0)
      - (s.paye_cents ?? 0) - (s.nhif_cents ?? 0) - (s.nssf_cents ?? 0) - (s.housing_levy_cents ?? 0) - (s.other_deductions_cents ?? 0);
  }

  async function togglePublished(s: Slip) {
    const { error } = await supabase.from("payslips" as never).update({ published: !s.published } as never).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    setRefresh((x) => x + 1);
  }

  function download(s: Slip) {
    if (!s.employees || !s.payroll_periods) return;
    exportPayslipPDF({
      id: s.id,
      employee_name: s.employees.full_name,
      employee_no: s.employees.employee_no,
      position: s.employees.position,
      period_label: s.payroll_periods.label,
      period_start: s.payroll_periods.period_start,
      period_end: s.payroll_periods.period_end,
      basic_cents: s.basic_cents,
      allowances_cents: s.allowances_cents,
      overtime_cents: s.overtime_cents,
      paye_cents: s.paye_cents,
      nhif_cents: s.nhif_cents,
      nssf_cents: s.nssf_cents,
      housing_levy_cents: s.housing_levy_cents,
      other_deductions_cents: s.other_deductions_cents,
      net_cents: s.net_cents,
      notes: s.notes,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payslips</h1>
          <p className="text-sm text-muted-foreground">{isHR ? "Manage payroll periods and per-employee payslips. Amounts in KES." : "Your payslip history. Click download to get the PDF."}</p>
        </div>
        {isHR && <HrPayrollActions periods={periods} onChange={() => setRefresh((x) => x + 1)} />}
      </div>

      <Card>
        <CardHeader><CardTitle>Payslips</CardTitle></CardHeader>
        <CardContent>
          {slips.length === 0 ? <p className="text-sm text-muted-foreground">No payslips yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  {isHR && <th className="text-left p-2">Employee</th>}
                  <th className="text-left p-2">Period</th>
                  <th className="text-right p-2">Basic</th>
                  <th className="text-right p-2">Allow.</th>
                  <th className="text-right p-2">Deduct.</th>
                  <th className="text-right p-2">Net</th>
                  <th className="text-left p-2">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {slips.map((s) => {
                  const deductions = s.paye_cents + s.nhif_cents + s.nssf_cents + s.housing_levy_cents + s.other_deductions_cents;
                  return (
                    <tr key={s.id} className="border-t">
                      {isHR && <td className="p-2">{s.employees?.full_name ?? "—"}</td>}
                      <td className="p-2">{s.payroll_periods?.label ?? "—"}</td>
                      <td className="p-2 text-right">{kes(s.basic_cents)}</td>
                      <td className="p-2 text-right">{kes(s.allowances_cents)}</td>
                      <td className="p-2 text-right">{kes(deductions)}</td>
                      <td className="p-2 text-right font-semibold">{kes(s.net_cents)}</td>
                      <td className="p-2"><Badge variant="outline">{s.published ? "published" : "draft"}</Badge></td>
                      <td className="p-2 text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => download(s)}>PDF</Button>
                        {isHR && <Button size="sm" variant="outline" onClick={() => togglePublished(s)}>{s.published ? "Unpublish" : "Publish"}</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  function HrPayrollActions({ periods, onChange }: { periods: Period[]; onChange: () => void }) {
    const [periodOpen, setPeriodOpen] = useState(false);
    const [slipOpen, setSlipOpen] = useState(false);
    const [label, setLabel] = useState("");
    const [pStart, setPStart] = useState("");
    const [pEnd, setPEnd] = useState("");
    const [periodId, setPeriodId] = useState("");
    const [empId, setEmpId] = useState("");
    const [employees, setEmployees] = useState<EmpRef[]>([]);
    const [form, setForm] = useState<Partial<Slip>>({});

    useEffect(() => {
      if (!slipOpen) return;
      void (async () => {
        const { data } = await supabase.from("employees" as never).select("id,full_name,employee_no,position").order("full_name");
        setEmployees((data ?? []) as EmpRef[]);
      })();
    }, [slipOpen]);

    async function addPeriod() {
      if (!label || !pStart || !pEnd) return;
      const { error } = await supabase.from("payroll_periods" as never).insert({ label, period_start: pStart, period_end: pEnd, status: "open" } as never);
      if (error) { toast.error(error.message); return; }
      setLabel(""); setPStart(""); setPEnd(""); setPeriodOpen(false); onChange();
    }

    async function addSlip() {
      if (!periodId || !empId) { toast.error("Pick period and employee"); return; }
      const net = recalcNet(form);
      const { error } = await supabase.from("payslips" as never).insert({
        employee_id: empId, period_id: periodId,
        basic_cents: form.basic_cents ?? 0, allowances_cents: form.allowances_cents ?? 0, overtime_cents: form.overtime_cents ?? 0,
        paye_cents: form.paye_cents ?? 0, nhif_cents: form.nhif_cents ?? 0, nssf_cents: form.nssf_cents ?? 0,
        housing_levy_cents: form.housing_levy_cents ?? 0, other_deductions_cents: form.other_deductions_cents ?? 0,
        net_cents: net, notes: form.notes ?? null, published: false,
      } as never);
      if (error) { toast.error(error.message); return; }
      toast.success("Payslip saved");
      setSlipOpen(false); setForm({}); setPeriodId(""); setEmpId(""); onChange();
    }

    function num(label: string, key: keyof Slip) {
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label} (KES)</Label>
          <Input type="number" min={0}
            value={String(((form[key] as number) ?? 0) / 100)}
            onChange={(e) => setForm({ ...form, [key]: Math.round(Number(e.target.value || 0) * 100) })} />
        </div>
      );
    }

    return (
      <div className="flex gap-2">
        <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
          <DialogTrigger asChild><Button variant="outline">New period</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New payroll period</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="June 2026" /></div>
              <div><Label>Start</Label><Input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} /></div>
              <div><Label>End</Label><Input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} /></div>
            </div>
            <DialogFooter><Button onClick={addPeriod}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={slipOpen} onOpenChange={setSlipOpen}>
          <DialogTrigger asChild><Button>New payslip</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New payslip</DialogTitle></DialogHeader>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Period</Label>
                <Select value={periodId} onValueChange={setPeriodId}>
                  <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                  <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Employee</Label>
                <Select value={empId} onValueChange={setEmpId}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}{e.employee_no ? ` · ${e.employee_no}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {num("Basic salary", "basic_cents")}
              {num("Allowances", "allowances_cents")}
              {num("Overtime", "overtime_cents")}
              {num("PAYE", "paye_cents")}
              {num("NHIF", "nhif_cents")}
              {num("NSSF", "nssf_cents")}
              {num("Housing levy", "housing_levy_cents")}
              {num("Other deductions", "other_deductions_cents")}
              <div className="md:col-span-2 text-sm">
                <span className="text-muted-foreground">Net pay: </span>
                <span className="font-semibold">{kes(recalcNet(form))}</span>
              </div>
            </div>
            <DialogFooter><Button onClick={addSlip}>Save as draft</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
}
