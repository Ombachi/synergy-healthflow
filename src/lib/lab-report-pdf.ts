import jsPDF from "jspdf";

export interface LabParam {
  parameter_name: string;
  value_text: string | null;
  units: string | null;
  reference_range: string | null;
  abnormal_flag: string | null;
}

export interface LabReportInput {
  test_name: string;
  order_id: string;
  ordered_at: string;
  performed_at?: string | null;
  patient_name: string;
  mrn: string | null;
  age?: string | null;
  gender?: string | null;
  pathologist?: string | null;
  parameters: LabParam[];
  comments?: string | null;
  facility?: string;
}

const FACILITY = "Vitalis Medical Centre · Nairobi, Kenya";

export function exportLabReportPDF(r: LabReportInput) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Header bar
  doc.setFillColor(15, 76, 117);
  doc.rect(0, 0, w, 22, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(14);
  doc.text(r.facility ?? FACILITY, 14, 10);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Laboratory Report", 14, 17);
  doc.setTextColor(0);

  let y = 32;
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(r.test_name.toUpperCase(), 14, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  doc.text(`Ref: ${r.order_id.slice(0, 8).toUpperCase()}`, w - 14, y, { align: "right" });
  doc.setTextColor(0);
  y += 7;

  // Patient block
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.rect(14, y, w - 28, 22);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold").text("Patient:", 18, y + 6);
  doc.setFont("helvetica", "normal").text(r.patient_name, 38, y + 6);
  doc.setFont("helvetica", "bold").text("MRN:", 18, y + 12);
  doc.setFont("helvetica", "normal").text(r.mrn ?? "—", 38, y + 12);
  doc.setFont("helvetica", "bold").text("Age/Sex:", 18, y + 18);
  doc.setFont("helvetica", "normal").text(`${r.age ?? "—"} · ${r.gender ?? "—"}`, 38, y + 18);

  doc.setFont("helvetica", "bold").text("Ordered:", w / 2 + 4, y + 6);
  doc.setFont("helvetica", "normal").text(new Date(r.ordered_at).toLocaleString(), w / 2 + 26, y + 6);
  doc.setFont("helvetica", "bold").text("Reported:", w / 2 + 4, y + 12);
  doc.setFont("helvetica", "normal").text(r.performed_at ? new Date(r.performed_at).toLocaleString() : "—", w / 2 + 26, y + 12);
  doc.setFont("helvetica", "bold").text("Facility:", w / 2 + 4, y + 18);
  doc.setFont("helvetica", "normal").text("Main Lab", w / 2 + 26, y + 18);
  y += 28;

  // Result table header
  const cols = [
    { x: 16, w: 70, label: "Parameter" },
    { x: 90, w: 30, label: "Result" },
    { x: 122, w: 22, label: "Units" },
    { x: 146, w: 30, label: "Reference" },
    { x: 178, w: 18, label: "Flag" },
  ];
  doc.setFillColor(240, 244, 248);
  doc.rect(14, y, w - 28, 8, "F");
  doc.setFont("helvetica", "bold").setFontSize(9);
  cols.forEach((c) => doc.text(c.label, c.x, y + 5.5));
  y += 8;

  doc.setFont("helvetica", "normal").setFontSize(9);
  for (const p of r.parameters) {
    if (y > h - 50) { doc.addPage(); y = 20; }
    const flagColor: [number, number, number] =
      p.abnormal_flag === "critical low" || p.abnormal_flag === "critical high" ? [200, 30, 30]
      : p.abnormal_flag === "low" || p.abnormal_flag === "high" ? [200, 110, 0]
      : [60, 130, 60];
    doc.text(p.parameter_name, cols[0].x, y + 5);
    doc.text(p.value_text ?? "—", cols[1].x, y + 5);
    doc.text(p.units ?? "—", cols[2].x, y + 5);
    doc.text(p.reference_range ?? "—", cols[3].x, y + 5);
    if (p.abnormal_flag) {
      doc.setTextColor(...flagColor).setFont("helvetica", "bold");
      doc.text(p.abnormal_flag.toUpperCase().replace("CRITICAL ", "!"), cols[4].x, y + 5);
      doc.setTextColor(0).setFont("helvetica", "normal");
    }
    doc.setDrawColor(235);
    doc.line(14, y + 8, w - 14, y + 8);
    y += 8;
  }

  if (r.comments) {
    y += 6;
    doc.setFont("helvetica", "bold").text("Comments / Interpretation", 14, y); y += 5;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(r.comments, w - 28);
    doc.text(lines, 14, y);
    y += lines.length * 5;
  }

  // Signature block
  const sigY = Math.max(y + 20, h - 40);
  doc.setDrawColor(120);
  doc.line(14, sigY, 90, sigY);
  doc.setFontSize(9).text("Pathologist / Lab Scientist", 14, sigY + 5);
  if (r.pathologist) doc.text(r.pathologist, 14, sigY + 11);

  doc.line(w - 90, sigY, w - 14, sigY);
  doc.text("Verified by", w - 90, sigY + 5);

  // Footer
  doc.setFontSize(8).setTextColor(120);
  doc.text(
    "This report is generated electronically. Reference ranges may vary by age, sex, and method. Clinical correlation is advised.",
    w / 2, h - 10, { align: "center" }
  );

  doc.save(`lab-${r.test_name.replace(/\s+/g, "_")}-${r.order_id.slice(0, 8)}.pdf`);
}
