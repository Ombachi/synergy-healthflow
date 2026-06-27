import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PayslipPDFInput {
  id: string;
  employee_name: string;
  employee_no?: string | null;
  position?: string | null;
  department?: string | null;
  period_label: string;
  period_start: string;
  period_end: string;
  basic_cents: number;
  allowances_cents: number;
  overtime_cents: number;
  paye_cents: number;
  nhif_cents: number;
  nssf_cents: number;
  housing_levy_cents: number;
  other_deductions_cents: number;
  net_cents: number;
  notes?: string | null;
  lines?: { kind: string; label: string; amount_cents: number }[];
}

function kes(cents: number) {
  return "KES " + (cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function exportPayslipPDF(p: PayslipPDFInput) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  let y = 18;

  doc.setFontSize(16).setFont("helvetica", "bold");
  doc.text("Payslip", w / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(120);
  doc.text(`Period ${p.period_label}  (${p.period_start} → ${p.period_end})`, w / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 10;

  doc.setFontSize(11).setFont("helvetica", "bold").text("Employee", 14, y); y += 5;
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text(`Name: ${p.employee_name}`, 14, y); y += 5;
  if (p.employee_no) { doc.text(`Employee No: ${p.employee_no}`, 14, y); y += 5; }
  if (p.position) { doc.text(`Position: ${p.position}`, 14, y); y += 5; }
  if (p.department) { doc.text(`Department: ${p.department}`, 14, y); y += 5; }
  y += 4;

  const earnings: [string, string][] = [
    ["Basic salary", kes(p.basic_cents)],
    ["Allowances", kes(p.allowances_cents)],
    ["Overtime", kes(p.overtime_cents)],
    ...(p.lines ?? []).filter((l) => l.kind === "earning").map<[string, string]>((l) => [l.label, kes(l.amount_cents)]),
  ];
  const deductions: [string, string][] = [
    ["PAYE", kes(p.paye_cents)],
    ["NHIF", kes(p.nhif_cents)],
    ["NSSF", kes(p.nssf_cents)],
    ["Housing levy", kes(p.housing_levy_cents)],
    ["Other deductions", kes(p.other_deductions_cents)],
    ...(p.lines ?? []).filter((l) => l.kind === "deduction").map<[string, string]>((l) => [l.label, kes(l.amount_cents)]),
  ];

  autoTable(doc, {
    startY: y,
    head: [["Earnings", "Amount"]],
    body: earnings,
    theme: "striped",
    headStyles: { fillColor: [30, 64, 175] },
    margin: { left: 14, right: w / 2 + 2 },
    tableWidth: w / 2 - 16,
  });
  autoTable(doc, {
    startY: y,
    head: [["Deductions", "Amount"]],
    body: deductions,
    theme: "striped",
    headStyles: { fillColor: [185, 28, 28] },
    margin: { left: w / 2 + 2, right: 14 },
    tableWidth: w / 2 - 16,
  });

  // @ts-expect-error jspdf-autotable internal
  const lastY = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(`Net Pay: ${kes(p.net_cents)}`, w - 14, lastY, { align: "right" });

  if (p.notes) {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(80);
    const lines = doc.splitTextToSize(p.notes, w - 28);
    doc.text(lines, 14, lastY + 10);
  }

  doc.setFontSize(8).setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}  ·  Ref ${p.id.slice(0, 8)}`, 14, doc.internal.pageSize.getHeight() - 8);

  doc.save(`payslip-${p.employee_name.replace(/\s+/g, "_")}-${p.period_label.replace(/\s+/g, "_")}.pdf`);
}
