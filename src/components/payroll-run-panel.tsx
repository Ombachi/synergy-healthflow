import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { buildPayrollBatch, p10Csv, bankPaymentTxt, type BatchEmployee } from "@/lib/payroll-batch";

type Period = { id: string; label: string; period_start: string };
const kes = (c: number) => "KES " + (c / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 });

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function PayrollRunPanel({ facilityId, periods, onDone }: { facilityId: string; periods: Period[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [periodId, setPeriodId] = useState("");
  const [edits, setEdits] = useState<Record<string, { basic?: string; allow?: string; pin?: string }>>({});
  const [busy, setBusy] = useState(false);
  const period = periods.find((p) => p.id === periodId);
  const month = period?.period_start.slice(0, 7) ?? "";

  const staff = useQuery({
    queryKey: ["payroll-run-staff", facilityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees" as never)
        .select("id,full_name,employee_no,national_id,kra_pin,employment_status,basic_salary_cents,allowances_cents,tax_resident,bank_name,bank_branch,bank_account")
        .eq("facility_id", facilityId).eq("employment_status", "active").order("full_name");
      if (error) throw new Error("Branch staff could not be loaded.");
      return (data ?? []) as unknown as BatchEmployee[];
    },
  });
  const existing = useQuery({
    queryKey: ["payroll-run-existing", facilityId, periodId], enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase.from("payslips" as never).select("employee_id").eq("period_id", periodId);
      if (error) throw new Error("Existing payslips could not be checked.");
      return new Set(((data ?? []) as { employee_id: string }[]).map((r) => r.employee_id));
    },
  });

  const employees = (staff.data ?? []).map((e) => {
    const x = edits[e.id];
    return { ...e,
      basic_salary_cents: x?.basic !== undefined ? Math.round(Number(x.basic) * 100) || 0 : e.basic_salary_cents,
      allowances_cents: x?.allow !== undefined ? Math.round(Number(x.allow) * 100) || 0 : e.allowances_cents,
      kra_pin: x?.pin !== undefined ? x.pin : e.kra_pin };
  });
  const preview = period && existing.data ? buildPayrollBatch(employees, month, existing.data) : null;
  const allLines = period ? buildPayrollBatch(employees, month, new Set()).lines : [];

  async function saveSalaries() {
    setBusy(true);
    for (const id of Object.keys(edits)) {
      const e = employees.find((x) => x.id === id); if (!e) continue;
      const { error } = await supabase.from("employees" as never).update({ basic_salary_cents: e.basic_salary_cents, allowances_cents: e.allowances_cents, kra_pin: e.kra_pin || null } as never).eq("id", id);
      if (error) { setBusy(false); toast.error(`Could not save ${e.full_name}: ${error.message}`); return; }
    }
    setBusy(false); setEdits({}); toast.success("Salaries saved"); qc.invalidateQueries({ queryKey: ["payroll-run-staff", facilityId] });
  }

  async function run() {
    if (!preview || !period) return;
    if (Object.keys(edits).length) { toast.error("Save salary changes first"); return; }
    if (!preview.lines.length) { toast.error("Nobody left to pay for this period"); return; }
    setBusy(true);
    const rows = preview.lines.map(({ employee: e, calc }) => ({
      facility_id: facilityId, employee_id: e.id, period_id: period.id,
      basic_cents: e.basic_salary_cents, allowances_cents: e.allowances_cents, overtime_cents: 0,
      paye_cents: calc.payeCents, nhif_cents: calc.shifCents, nssf_cents: calc.nssf.employeeCents,
      housing_levy_cents: calc.employeeHousingCents, other_deductions_cents: 0, net_cents: calc.netCents,
      notes: `Batch payroll (${calc.ruleVersion}). Employer: NSSF ${kes(calc.nssf.employerCents)}, AHL ${kes(calc.employerHousingCents)}.`,
      published: false,
    }));
    const { error } = await supabase.from("payslips" as never).insert(rows as never);
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "Some payslips already exist — refresh and try again." : error.message); return; }
    toast.success(`${rows.length} payslips created as drafts`);
    qc.invalidateQueries({ queryKey: ["payroll-run-existing", facilityId, periodId] }); onDone();
  }

  const totalNet = (preview?.lines ?? []).reduce((s, l) => s + l.calc.netCents, 0);
  const totalPaye = (preview?.lines ?? []).reduce((s, l) => s + l.calc.payeCents, 0);
  const noBank = allLines.filter((l) => !l.employee.bank_account).length;

  return (
    <Card>
      <CardHeader><CardTitle>Run monthly payroll</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 space-y-1"><Label className="text-xs">Payroll period</Label>
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger><SelectValue placeholder="Choose period" /></SelectTrigger>
              <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
            </Select></div>
          {Object.keys(edits).length > 0 && <Button variant="outline" disabled={busy} onClick={saveSalaries}>Save salary changes</Button>}
          <Button disabled={busy || !preview || !preview.lines.length} onClick={run}>Run payroll ({preview?.lines.length ?? 0} staff)</Button>
          <Button variant="outline" disabled={!allLines.length} onClick={() => download(p10Csv(allLines), `KRA-P10-${month}.csv`, "text/csv;charset=utf-8")}>KRA P10 CSV</Button>
          <Button variant="outline" disabled={!allLines.length} onClick={() => download(bankPaymentTxt(allLines, `SAL-${month}`), `bank-payments-${month}.txt`, "text/plain;charset=utf-8")}>Bank payment file</Button>
        </div>
        {staff.isError && <p role="alert" className="text-sm text-destructive">{(staff.error as Error).message}</p>}
        {preview && <p className="text-sm text-muted-foreground">To create: {preview.lines.length} · Total net {kes(totalNet)} · PAYE {kes(totalPaye)}{noBank ? ` · ${noBank} without bank account (left out of bank file)` : ""}</p>}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2">Employee</th><th className="p-2">KRA PIN</th><th className="p-2">Basic (KES)</th><th className="p-2">Allowances (KES)</th><th className="p-2">Net</th><th className="p-2">Status</th></tr></thead>
            <tbody>
              {employees.map((e) => {
                const line = preview?.lines.find((l) => l.employee.id === e.id);
                const skip = preview?.skipped.find((s) => s.employee.id === e.id);
                return (
                  <tr key={e.id} className="border-t">
                    <td className="p-2">{e.full_name}</td>
                    <td className="p-2"><Input className="h-8 w-32" value={e.kra_pin ?? ""} onChange={(v) => setEdits((s) => ({ ...s, [e.id]: { ...s[e.id], pin: v.target.value.toUpperCase() } }))} /></td>
                    <td className="p-2"><Input className="h-8 w-28" type="number" min={0} value={edits[e.id]?.basic ?? String(e.basic_salary_cents / 100)} onChange={(v) => setEdits((s) => ({ ...s, [e.id]: { ...s[e.id], basic: v.target.value } }))} /></td>
                    <td className="p-2"><Input className="h-8 w-28" type="number" min={0} value={edits[e.id]?.allow ?? String(e.allowances_cents / 100)} onChange={(v) => setEdits((s) => ({ ...s, [e.id]: { ...s[e.id], allow: v.target.value } }))} /></td>
                    <td className="p-2">{line ? kes(line.calc.netCents) : "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{line ? "Ready" : skip?.reason ?? (period ? "" : "Choose a period")}</td>
                  </tr>
                );
              })}
              {!staff.isPending && !employees.length && <tr><td className="p-3 text-muted-foreground" colSpan={6}>No active staff in this branch.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
