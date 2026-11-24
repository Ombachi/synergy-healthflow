import { calculateMonthlyPayroll } from "./payroll";

export type BatchEmployee = {
  id: string; full_name: string; employee_no: string | null; national_id: string | null; kra_pin: string | null;
  employment_status: string; basic_salary_cents: number; allowances_cents: number; tax_resident: boolean;
  bank_name: string | null; bank_branch: string | null; bank_account: string | null;
};

export type BatchLine = { employee: BatchEmployee; calc: ReturnType<typeof calculateMonthlyPayroll> };
export type BatchResult = { lines: BatchLine[]; skipped: { employee: BatchEmployee; reason: string }[] };

/** Builds payslips for active staff with a salary who do not already have one for the period. */
export function buildPayrollBatch(employees: BatchEmployee[], month: string, alreadyPaidIds: ReadonlySet<string>): BatchResult {
  const lines: BatchLine[] = []; const skipped: BatchResult["skipped"] = [];
  for (const e of employees) {
    if (e.employment_status !== "active") continue;
    if (alreadyPaidIds.has(e.id)) { skipped.push({ employee: e, reason: "Payslip already exists" }); continue; }
    if (!(e.basic_salary_cents > 0)) { skipped.push({ employee: e, reason: "No basic salary set" }); continue; }
    try {
      const calc = calculateMonthlyPayroll({ month, basicCents: e.basic_salary_cents, allowancesCents: e.allowances_cents ?? 0,
        overtimeCents: 0, otherDeductionsCents: 0, resident: e.tax_resident !== false });
      lines.push({ employee: e, calc });
    } catch (err) { skipped.push({ employee: e, reason: (err as Error).message }); }
  }
  return { lines, skipped };
}

const shillings = (c: number) => (c / 100).toFixed(2);

/** Neutralises spreadsheet formulas and quotes a CSV cell. */
export function csvCell(v: unknown) {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}

/** KRA P10 (iTax PAYE) employee sheet layout for primary employees paid cash salaries. */
export function p10Csv(lines: BatchLine[]) {
  const head = ["PIN of Employee", "Name of Employee", "Residential Status", "Type of Employee", "Basic Salary", "Housing Allowance",
    "Other Allowances", "Gross Pay", "NSSF Contribution", "SHIF Contribution", "Affordable Housing Levy", "Taxable Pay",
    "Tax Charged", "Personal Relief", "PAYE Tax"];
  const rows = lines.map(({ employee: e, calc: c }) => [
    csvCell(e.kra_pin ?? ""), csvCell(e.full_name), csvCell(e.tax_resident === false ? "Non-Resident" : "Resident"), csvCell("Primary Employee"),
    shillings(e.basic_salary_cents), "0.00", shillings(e.allowances_cents ?? 0), shillings(c.grossCents),
    shillings(c.nssf.employeeCents), shillings(c.shifCents), shillings(c.employeeHousingCents), shillings(c.taxableCents),
    shillings(c.taxBeforeReliefCents), shillings(c.personalReliefCents), shillings(c.payeCents),
  ].join(","));
  return [head.map(csvCell).join(","), ...rows].join("\r\n");
}

/** Pipe-delimited bank bulk payment file: account|name|bank|branch|amount|reference. */
export function bankPaymentTxt(lines: BatchLine[], reference: string) {
  const clean = (v: string | null | undefined) => String(v ?? "").replace(/[|\r\n]/g, " ").trim();
  const body = lines.filter((l) => l.employee.bank_account).map(({ employee: e, calc }) =>
    [clean(e.bank_account), clean(e.full_name), clean(e.bank_name), clean(e.bank_branch), shillings(calc.netCents), clean(reference)].join("|"));
  const total = lines.filter((l) => l.employee.bank_account).reduce((s, l) => s + l.calc.netCents, 0);
  return [`H|${clean(reference)}|${body.length}|${shillings(total)}`, ...body].join("\r\n");
}
