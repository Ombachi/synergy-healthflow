import jsPDF from "jspdf";
import { drawBrandHeader, drawVerifyQR, siteOrigin, ORG_NAME } from "./pdf-brand";

export interface ImagingReportInput {
  order_id: string;
  modality: string;
  body_part?: string | null;
  clinical_history?: string | null;
  technique?: string | null;
  findings?: string | null;
  impression?: string | null;
  report?: string | null;
  performed_at?: string | null;
  ordered_at: string;
  patient_name: string;
  mrn: string | null;
  age?: string | null;
  gender?: string | null;
  radiologist?: string | null;
  image_data_url?: string | null; // optional inline image (base64)
  facility?: string;
}

const FACILITY = "Vitalis Medical Centre · Nairobi, Kenya";

export async function exportImagingReportPDF(r: ImagingReportInput) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  let y = await drawBrandHeader(doc, { title: "Diagnostic Imaging Report", accent: [17, 94, 89] });
  y += 4;

  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(`${r.modality.toUpperCase()}${r.body_part ? " — " + r.body_part : ""}`, 14, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  doc.text(`Ref: ${r.order_id.slice(0, 8).toUpperCase()}`, w - 14, y, { align: "right" });
  doc.setTextColor(0);
  y += 7;


  // Patient block
  doc.setDrawColor(220).setLineWidth(0.2);
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
  doc.setFont("helvetica", "bold").text("Performed:", w / 2 + 4, y + 12);
  doc.setFont("helvetica", "normal").text(r.performed_at ? new Date(r.performed_at).toLocaleString() : "—", w / 2 + 26, y + 12);
  doc.setFont("helvetica", "bold").text("Facility:", w / 2 + 4, y + 18);
  doc.setFont("helvetica", "normal").text(r.facility ?? ORG_NAME, w / 2 + 26, y + 18);
  y += 30;

  const section = (label: string, body?: string | null) => {
    if (!body) return;
    if (y > h - 40) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(label, 14, y); y += 5;
    doc.setFont("helvetica", "normal").setFontSize(9);
    const lines = doc.splitTextToSize(body, w - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 4;
  };

  section("Clinical history", r.clinical_history);
  section("Technique", r.technique);
  section("Findings", r.findings ?? r.report);
  section("Impression", r.impression);

  if (r.image_data_url) {
    if (y > h - 110) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold").setFontSize(10).text("Representative image", 14, y); y += 4;
    try {
      doc.addImage(r.image_data_url, "JPEG", 14, y, 80, 80);
      y += 84;
    } catch {
      // ignore unsupported formats
    }
  }

  // Signature
  const sigY = Math.max(y + 20, h - 60);
  doc.setDrawColor(120);
  doc.line(14, sigY, 90, sigY);
  doc.setFontSize(9).text("Reporting Radiologist", 14, sigY + 5);
  if (r.radiologist) doc.text(r.radiologist, 14, sigY + 11);
  doc.line(w - 90, sigY, w - 14, sigY);
  doc.text("Verified by", w - 90, sigY + 5);

  doc.setFontSize(8).setTextColor(120);
  doc.text("This report is generated electronically. Clinical correlation is advised.", w / 2, h - 8, { align: "center" });
  doc.setTextColor(0);

  await drawVerifyQR(doc, `${siteOrigin()}/verify/imaging/${r.order_id}`);

  doc.save(`imaging-${r.modality.replace(/\s+/g, "_")}-${r.order_id.slice(0, 8)}.pdf`);
}
