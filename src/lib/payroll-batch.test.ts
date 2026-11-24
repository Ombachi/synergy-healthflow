import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPayrollBatch, p10Csv, bankPaymentTxt, csvCell, type BatchEmployee } from "./payroll-batch";

const emp = (o: Partial<BatchEmployee>): BatchEmployee => ({ id: "e1", full_name: "Jane", employee_no: null, national_id: null, kra_pin: "A1",
  employment_status: "active", basic_salary_cents: 10000000, allowances_cents: 0, tax_resident: true, bank_name: "KCB", bank_branch: "CBD", bank_account: "123", ...o });

describe("one-click payroll batch", () => {
  it("pays active staff with a salary", () => assert.equal(buildPayrollBatch([emp({})], "2026-10", new Set()).lines.length, 1));
  it("never creates a second payslip for the same month", () => {
    const r = buildPayrollBatch([emp({})], "2026-10", new Set(["e1"]));
    assert.equal(r.lines.length, 0); assert.equal(r.skipped[0]?.reason, "Payslip already exists");
  });
  it("skips inactive staff", () => assert.equal(buildPayrollBatch([emp({ employment_status: "terminated" })], "2026-10", new Set()).lines.length, 0));
  it("skips staff without a salary", () => assert.equal(buildPayrollBatch([emp({ basic_salary_cents: 0 })], "2026-10", new Set()).skipped.length, 1));
  it("P10 row carries PAYE in shillings", () => {
    const r = buildPayrollBatch([emp({})], "2026-10", new Set());
    const paye = (r.lines[0]!.calc.payeCents / 100).toFixed(2);
    assert.ok(p10Csv(r.lines).split("\r\n")[1]!.endsWith("," + paye));
  });
  it("bank file totals net pay", () => {
    const r = buildPayrollBatch([emp({})], "2026-10", new Set());
    assert.equal(bankPaymentTxt(r.lines, "OCT").split("\r\n")[0], `H|OCT|1|${(r.lines[0]!.calc.netCents / 100).toFixed(2)}`);
  });
  it("neutralises formula cells", () => assert.equal(csvCell("=CMD()"), `"'=CMD()"`));
});
