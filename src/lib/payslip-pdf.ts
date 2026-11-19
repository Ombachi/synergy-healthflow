import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PayslipLine { kind: string; label: string; amount_cents: number; balance_cents?: number | null }

export interface PayslipPDFInput {
  id: string;
  organisation_name: string;
  organisation_address?: string | null;
  organisation_contact?: string | null;
  employee_name: string;
  employee_no?: string | null;
  position?: string | null;
  department?: string | null;
  id_number?: string | null;
  kra_pin?: string | null;
  nssf_no?: string | null;
  sha_no?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account?: string | null;
  period_label: string;
  period_start: string;
  period_end: string;
  basic_cents: number;
  allowances_cents: number;
  overtime_cents: number;
  paye_cents: number;
  personal_relief_cents?: number | null;
  nhif_cents: number;
  nssf_cents: number;
  housing_levy_cents: number;
  other_deductions_cents: number;
  net_cents: number;
  lines?: PayslipLine[];
}

const money = (c: number) => (c / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Payslip laid out like the institutional (MKU-style) format: header, staff block, earnings, tax, deductions, net pay. */
export function exportPayslipPDF(p: PayslipPDFInput) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const L = 14, R = w - 14;
  let y = 16;

  doc.setFont("helvetica", "bold").setFontSize(15).text(p.organisation_name.toUpperCase(), w / 2, y, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  if (p.organisation_address) { y += 5; doc.text(p.organisation_address, w / 2, y, { align: "center" }); }
  if (p.organisation_contact) { y += 4; doc.text(p.organisation_contact, w / 2, y, { align: "center" }); }
  y += 7;
  doc.setFont("helvetica", "bold").setFontSize(11).text(`PAYSLIP FOR ${p.period_label.toUpperCase()}`, w / 2, y, { align: "center" });
  y += 3; doc.setLineWidth(0.4).line(L, y, R, y); y += 2;

  const info: [string, string, string, string][] = [
    ["Staff No", p.employee_no ?? "—", "ID No", p.id_number ?? "—"],
    ["Name", p.employee_name, "KRA PIN", p.kra_pin ?? "—"],
    ["Designation", p.position ?? "—", "NSSF No", p.nssf_no ?? "—"],
    ["Department", p.department ?? "—", "SHA No", p.sha_no ?? "—"],
  ];
  autoTable(doc, { startY: y, body: info, theme: "plain", styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 28 }, 2: { fontStyle: "bold", cellWidth: 24 } }, margin: { left: L, right: 14 } });

  const lines = p.lines ?? [];
  const extraEarn = lines.filter((l) => l.kind === "earning");
  const gross = p.basic_cents + p.allowances_cents + p.overtime_cents + extraEarn.reduce((a, l) => a + l.amount_cents, 0);
  const relief = p.personal_relief_cents ?? 240000;
  const health = p.period_start >= "2024-10-01" ? "SHA / SHIF" : "NHIF";
  const allowable = p.nssf_cents + p.nhif_cents + p.housing_levy_cents;
  const taxable = Math.max(0, gross - allowable);

  const section = (title: string, body: (string | number)[][], foot?: string[]) => {
    // @ts-expect-error autotable internal
    autoTable(doc, { startY: doc.lastAutoTable.finalY + 3, head: [[title, "KES"]], body: body as string[][], foot: foot ? [foot] : undefined,
      theme: "grid", styles: { fontSize: 9, cellPadding: 1.4 }, headStyles: { fillColor: [235, 235, 235], textColor: 20 },
      footStyles: { fillColor: [245, 245, 245], textColor: 20 }, columnStyles: { 1: { halign: "right", cellWidth: 40 } }, margin: { left: L, right: 14 } });
  };

  section("EARNINGS", [
    ["Basic Pay", money(p.basic_cents)],
    ...(p.allowances_cents ? [["Allowances", money(p.allowances_cents)]] : []),
    ...(p.overtime_cents ? [["Overtime", money(p.overtime_cents)]] : []),
    ...extraEarn.map((l) => [l.label, money(l.amount_cents)]),
  ], ["GROSS PAY", money(gross)]);

  section("TAX CALCULATION", [
    ["Gross Pay", money(gross)],
    ["Less allowable deductions (NSSF, " + health + ", Housing Levy)", money(allowable)],
    ["Taxable Pay", money(taxable)],
    ["Tax Charged", money(p.paye_cents + relief)],
    ["Personal Relief", money(relief)],
  ], ["PAYE", money(p.paye_cents)]);

  const extraDed = lines.filter((l) => l.kind === "deduction");
  const totalDed = p.paye_cents + p.nhif_cents + p.nssf_cents + p.housing_levy_cents + p.other_deductions_cents + extraDed.reduce((a, l) => a + l.amount_cents, 0);
  section("DEDUCTIONS", [
    ["PAYE", money(p.paye_cents)],
    ["NSSF", money(p.nssf_cents)],
    [health, money(p.nhif_cents)],
    ["Affordable Housing Levy", money(p.housing_levy_cents)],
    ...extraDed.map((l) => [l.balance_cents != null ? `${l.label} (Bal ${money(l.balance_cents)})` : l.label, money(l.amount_cents)]),
    ...(p.other_deductions_cents ? [["Other deductions", money(p.other_deductions_cents)]] : []),
  ], ["TOTAL DEDUCTIONS", money(totalDed)]);

  // @ts-expect-error autotable internal
  y = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(230, 230, 230).rect(L, y - 5, R - L, 8, "F");
  doc.setFont("helvetica", "bold").setFontSize(11).text("NET PAY", L + 2, y);
  doc.text(`KES ${money(p.net_cents)}`, R - 2, y, { align: "right" });
  y += 10;

  if (p.bank_name || p.bank_account) {
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text(`Bank: ${p.bank_name ?? "—"}   Branch: ${p.bank_branch ?? "—"}   Account: ${p.bank_account ?? "—"}`, L, y);
    y += 6;
  }

  doc.setFontSize(8).setTextColor(110);
  doc.text(`This is a computer-generated payslip. Ref ${p.id.slice(0, 8).toUpperCase()}  ·  ${p.period_start} to ${p.period_end}`, L, doc.internal.pageSize.getHeight() - 8);

  doc.save(`payslip-${p.employee_name.replace(/\s+/g, "_")}-${p.period_label.replace(/\s+/g, "_")}.pdf`);
}
