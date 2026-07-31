import jsPDF from "jspdf";

export interface ClaimLine {
  description: string;
  billed_cents: number;
  approved_cents?: number | null;
}

export interface ClaimInput {
  claim_id: string;
  created_at: string;
  patient_name: string;
  mrn: string | null;
  insurer: string;
  member_number: string | null;
  scheme?: string | null;
  preauth_code?: string | null;
  invoice_no: string;
  total_cents: number;
  approved_cents?: number | null;
  notes?: string | null;
  lines: ClaimLine[];
  diagnoses?: string[];
  provider_name?: string;
}

const FACILITY = "Vitalis Medical Centre · Nairobi, Kenya";
const money = (c?: number | null) => `KES ${((c ?? 0) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

export function exportClaimPDF(c: ClaimInput) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  doc.setFillColor(15, 76, 117);
  doc.rect(0, 0, w, 22, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(14);
  doc.text(FACILITY, 14, 10);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Insurance Claim Form", 14, 17);
  doc.setTextColor(0);

  let y = 30;
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(`Claim ${c.claim_id.slice(0, 8).toUpperCase()}`, 14, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  doc.text(new Date(c.created_at).toLocaleString("en-GB"), w - 14, y, { align: "right" });
  doc.setTextColor(0);
  y += 6;

  doc.setLineWidth(0.2).setDrawColor(220);
  doc.rect(14, y, w - 28, 28);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold").text("Patient:", 18, y + 6);
  doc.setFont("helvetica", "normal").text(c.patient_name, 38, y + 6);
  doc.setFont("helvetica", "bold").text("MRN:", 18, y + 12);
  doc.setFont("helvetica", "normal").text(c.mrn ?? "—", 38, y + 12);
  doc.setFont("helvetica", "bold").text("Invoice:", 18, y + 18);
  doc.setFont("helvetica", "normal").text(c.invoice_no, 38, y + 18);
  doc.setFont("helvetica", "bold").text("Provider:", 18, y + 24);
  doc.setFont("helvetica", "normal").text(c.provider_name ?? FACILITY, 38, y + 24);

  doc.setFont("helvetica", "bold").text("Insurer:", w / 2 + 4, y + 6);
  doc.setFont("helvetica", "normal").text(c.insurer, w / 2 + 26, y + 6);
  doc.setFont("helvetica", "bold").text("Member #:", w / 2 + 4, y + 12);
  doc.setFont("helvetica", "normal").text(c.member_number ?? "—", w / 2 + 26, y + 12);
  doc.setFont("helvetica", "bold").text("Scheme:", w / 2 + 4, y + 18);
  doc.setFont("helvetica", "normal").text(c.scheme ?? "—", w / 2 + 26, y + 18);
  doc.setFont("helvetica", "bold").text("Pre-auth:", w / 2 + 4, y + 24);
  doc.setFont("helvetica", "normal").text(c.preauth_code ?? "—", w / 2 + 26, y + 24);
  y += 34;

  if (c.diagnoses?.length) {
    doc.setFont("helvetica", "bold").text("Diagnoses (ICD):", 14, y);
    doc.setFont("helvetica", "normal").text(c.diagnoses.join(", "), 50, y);
    y += 8;
  }

  // Lines
  doc.setFillColor(240, 244, 248).rect(14, y, w - 28, 8, "F");
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("Description", 16, y + 5.5);
  doc.text("Billed", w - 70, y + 5.5);
  doc.text("Approved", w - 30, y + 5.5);
  y += 8;
  doc.setFont("helvetica", "normal");
  for (const ln of c.lines) {
    if (y > h - 50) { doc.addPage(); y = 20; }
    doc.text(ln.description, 16, y + 5);
    doc.text(money(ln.billed_cents), w - 70, y + 5);
    doc.text(ln.approved_cents != null ? money(ln.approved_cents) : "—", w - 30, y + 5);
    doc.setDrawColor(235).line(14, y + 8, w - 14, y + 8);
    y += 8;
  }
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Total billed", w - 105, y + 5);
  doc.text(money(c.total_cents), w - 70, y + 5);
  doc.text("Approved", w - 55, y + 5);
  doc.text(money(c.approved_cents), w - 30, y + 5);

  if (c.notes) {
    y += 14;
    doc.setFont("helvetica", "bold").text("Clinical notes / Justification", 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(c.notes, w - 28);
    doc.text(lines, 14, y);
    y += lines.length * 5;
  }

  const sigY = Math.max(y + 24, h - 40);
  doc.setDrawColor(120);
  doc.line(14, sigY, 90, sigY);
  doc.setFontSize(9).text("Provider signature & stamp", 14, sigY + 5);
  doc.line(w - 90, sigY, w - 14, sigY);
  doc.text("Insurer use only", w - 90, sigY + 5);

  doc.setFontSize(8).setTextColor(120);
  doc.text("Submit to insurer claims portal or via authorised admin (Minet / Sedgwick / Liaison).", w / 2, h - 10, { align: "center" });

  doc.save(`claim-${c.claim_id.slice(0, 8)}.pdf`);
}

export function exportClaimsBatchCSV(rows: Array<{
  claim_id: string; created_at: string; insurer: string; member_number: string | null;
  patient_name: string; mrn: string | null; invoice_no: string; total_cents: number;
  approved_cents: number | null; status: string; preauth_code: string | null;
}>) {
  const header = ["claim_id","date","insurer","member_no","patient","mrn","invoice","total_kes","approved_kes","status","preauth"];
  const body = rows.map((r) => [
    r.claim_id, r.created_at.slice(0, 10), r.insurer, r.member_number ?? "",
    r.patient_name, r.mrn ?? "", r.invoice_no,
    (r.total_cents / 100).toFixed(2), r.approved_cents != null ? (r.approved_cents / 100).toFixed(2) : "",
    r.status, r.preauth_code ?? "",
  ]);
  const csv = [header, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `claims-batch-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
