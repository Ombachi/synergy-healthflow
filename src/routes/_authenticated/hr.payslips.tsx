import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFacility } from "@/components/facility-context";
import { hrFacilityScope, requireBranchRecord } from "@/lib/hr-facility-rules";
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
import { calculateMonthlyPayroll, healthContributionLabel } from "@/lib/payroll";

export const Route = createFileRoute("/_authenticated/hr/payslips")({
  head: () => ({ meta: [{ title: "Hr Payslips — Litu Vault" }, { name: "description", content: "Hr Payslips workspace in Litu Vault, scoped to your active facility." }, { property: "og:title", content: "Hr Payslips — Litu Vault" }, { property: "og:description", content: "Hr Payslips workspace in Litu Vault, scoped to your active facility." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
  const { user } = useAuth();
  const { activeFacility, roles, loading: facilityLoading, error: facilityError, refresh: refreshFacility } = useFacility();
  const isHR = roles.some(role => ["admin", "hr_officer", "hr_manager"].includes(role));
  const [refresh, setRefresh] = useState(0);

  const ready = !!user && !facilityLoading && !facilityError;
  const records = useQuery({
    queryKey: ["hr-payslips", activeFacility.id, user?.id, isHR, refresh],
    enabled: ready,
    queryFn: async () => {
      const scope = hrFacilityScope(activeFacility.id, user?.id ?? "", isHR);
      let q = supabase.from("payslips" as never)
        .select("*, payroll_periods(*), employees!payslips_employee_id_fkey(id,full_name,employee_no,position)")
        .eq("facility_id", scope.facilityId).order("created_at", { ascending: false }).limit(200);
      if (scope.ownerId) q = q.eq("employee_id", scope.ownerId).eq("published", scope.publishedOnly);
      const { data, error } = await q;
      if (error) throw new Error("Payslips could not be loaded. Branch payroll setup requires an available database.");
      const pp = await supabase.from("payroll_periods" as never).select("*").eq("facility_id", scope.facilityId).order("period_end", { ascending: false });
      if (pp.error) throw new Error("Payroll periods could not be loaded for this facility.");
      return { slips: (data ?? []) as Slip[], periods: (pp.data ?? []) as Period[] };
    },
  });
  const slips = ready ? records.data?.slips ?? [] : [];
  const periods = ready ? records.data?.periods ?? [] : [];

  async function togglePublished(s: Slip) {
    if (!ready || !isHR) return;
    requireBranchRecord(s.id, slips);
    const { data, error } = await supabase.from("payslips" as never).update({ published: !s.published } as never).eq("id", s.id).eq("facility_id", activeFacility.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("Payslip was not updated in this facility."); return; }
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

  if (facilityLoading) return <p role="status">Loading your facility…</p>;
  if (facilityError) return <div role="alert" className="space-y-3"><p>{facilityError}</p><Button onClick={refreshFacility}>Retry</Button></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payslips</h1>
          <p className="text-sm text-muted-foreground">{isHR ? "Manage payroll periods and per-employee payslips. Amounts in KES." : "Your payslip history. Click download to get the PDF."}</p>
        </div>
        {isHR && !records.isPending && !records.isError && <HrPayrollActions key={activeFacility.id} facilityId={activeFacility.id} periods={periods} onChange={() => setRefresh((x) => x + 1)} />}
      </div>

      <Card>
        <CardHeader><CardTitle>Payslips</CardTitle></CardHeader>
        <CardContent>
          {records.isPending ? <p role="status">Loading payslips…</p> : records.isError ? <div role="alert" className="space-y-3"><p className="text-destructive">{records.error.message}</p><Button variant="outline" onClick={() => void records.refetch()}>Retry</Button></div> : slips.length === 0 ? <p className="text-sm text-muted-foreground">No payslips yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap">
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
            </table></div>
          )}
        </CardContent>
      </Card>
    </div>
  );

}

function HrPayrollActions({ facilityId, periods, onChange }: { facilityId: string; periods: Period[]; onChange: () => void }) {
    const [periodOpen, setPeriodOpen] = useState(false);
    const [slipOpen, setSlipOpen] = useState(false);
    const [label, setLabel] = useState("");
    const [pStart, setPStart] = useState("");
    const [pEnd, setPEnd] = useState("");
    const [periodId, setPeriodId] = useState("");
    const [empId, setEmpId] = useState("");
    const employeesQuery = useQuery({
      queryKey: ["payroll-employees", facilityId], enabled: slipOpen,
      queryFn: async () => {
        const { data, error } = await supabase.from("employees" as never).select("id,full_name,employee_no,position").eq("facility_id", facilityId).order("full_name");
        if (error) throw new Error("Staff could not be loaded for this facility.");
        return (data ?? []) as EmpRef[];
      },
    });
    const employees = employeesQuery.data ?? [];
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<Slip>>({});

    async function addPeriod() {
      if (!label || !pStart || !pEnd) return;
      if (saving) return;
      setSaving(true);
      const { error } = await supabase.from("payroll_periods" as never).insert({ facility_id: facilityId, label, period_start: pStart, period_end: pEnd, status: "open" } as never);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      setLabel(""); setPStart(""); setPEnd(""); setPeriodOpen(false); onChange();
    }

    const period = periods.find((p) => p.id === periodId);
    const month = period?.period_start?.slice(0, 7) ?? "";
    let calc: ReturnType<typeof calculateMonthlyPayroll> | null = null;
    let calcError = "";
    if (period) {
      try {
        calc = calculateMonthlyPayroll({ month, basicCents: form.basic_cents ?? 0, allowancesCents: form.allowances_cents ?? 0,
          overtimeCents: form.overtime_cents ?? 0, otherDeductionsCents: form.other_deductions_cents ?? 0, resident: true });
      } catch (e) { calcError = (e as Error).message; }
    }

    async function addSlip() {
      if (!periodId || !empId) { toast.error("Pick period and employee"); return; }
      if (saving || employeesQuery.isPending || employeesQuery.isError) return;
      try { requireBranchRecord(empId, employees); requireBranchRecord(periodId, periods); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Choose branch records"); return; }
      if (!calc) { toast.error(calcError || "Unable to calculate statutory deductions"); return; }
      setSaving(true);
      const { error } = await supabase.from("payslips" as never).insert({
        facility_id: facilityId,
        employee_id: empId, period_id: periodId,
        basic_cents: form.basic_cents ?? 0, allowances_cents: form.allowances_cents ?? 0, overtime_cents: form.overtime_cents ?? 0,
        paye_cents: calc.payeCents, nhif_cents: calc.shifCents, nssf_cents: calc.nssf.employeeCents,
        housing_levy_cents: calc.employeeHousingCents, other_deductions_cents: form.other_deductions_cents ?? 0,
        net_cents: calc.netCents,
        notes: [form.notes, `Auto-calculated (${calc.ruleVersion}). Employer: NSSF ${kes(calc.nssf.employerCents)}, AHL ${kes(calc.employerHousingCents)}.`].filter(Boolean).join("\n"),
        published: false,
      } as never);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Payslip saved");
      setSlipOpen(false); setForm({}); setPeriodId(""); setEmpId(""); onChange();
    }

    function shown(label: string, cents: number | undefined) {
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label} (auto)</Label>
          <Input readOnly value={cents === undefined ? "—" : kes(cents)} />
        </div>
      );
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
      <div className="flex flex-wrap gap-2">
        <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
          <DialogTrigger asChild><Button variant="outline">New period</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New payroll period</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="June 2026" /></div>
              <div><Label>Start</Label><Input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} /></div>
              <div><Label>End</Label><Input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} /></div>
            </div>
            <DialogFooter><Button onClick={addPeriod} disabled={saving}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={slipOpen} onOpenChange={setSlipOpen}>
          <DialogTrigger asChild><Button>New payslip</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
                {employeesQuery.isPending && <p role="status" className="text-sm text-muted-foreground">Loading staff…</p>}
                {employeesQuery.isError && <div role="alert"><p className="text-sm text-destructive">{employeesQuery.error.message}</p><Button variant="outline" size="sm" onClick={() => void employeesQuery.refetch()}>Retry</Button></div>}
                <Select value={empId} onValueChange={setEmpId}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}{e.employee_no ? ` · ${e.employee_no}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {num("Basic salary", "basic_cents")}
              {num("Allowances", "allowances_cents")}
              {num("Overtime", "overtime_cents")}
              {num("Other deductions", "other_deductions_cents")}
              {shown("PAYE", calc?.payeCents)}
              {shown(period ? healthContributionLabel(period.period_start) : "SHIF", calc?.shifCents)}
              {shown("NSSF (employee)", calc?.nssf.employeeCents)}
              {shown("Housing levy (employee)", calc?.employeeHousingCents)}
              <div className="md:col-span-2 text-sm space-y-1">
                {!period && <p className="text-muted-foreground">Select a period to calculate statutory deductions.</p>}
                {calcError && <p className="text-destructive">{calcError}</p>}
                {calc && <p className="text-muted-foreground">Taxable pay {kes(calc.taxableCents)} · relief {kes(calc.personalReliefCents)} · employer cost {kes(calc.employerCostCents)}</p>}
                <p><span className="text-muted-foreground">Net pay: </span><span className="font-semibold">{calc ? kes(calc.netCents) : "—"}</span></p>
              </div>
            </div>
            <DialogFooter><Button onClick={addSlip} disabled={saving || employeesQuery.isPending || employeesQuery.isError}>Save as draft</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
