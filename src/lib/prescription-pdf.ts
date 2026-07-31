import jsPDF from "jspdf";
import { drawBrandHeader, drawVerifyQR, siteOrigin, ORG_NAME } from "./pdf-brand";

export interface RxLine {
  medication: string;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
}

export interface PrescriptionPdfInput {
  rx_id: string;
  created_at: string;
  patient_name: string;
  mrn: string | null;
  age?: string | null;
  gender?: string | null;
  prescriber?: string | null;
  items: RxLine[];
}

export async function exportPrescriptionPDF(r: PrescriptionPdfInput) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  let y = await drawBrandHeader(doc, { title: "Prescription", accent: [21, 128, 61] });
  y += 4;

  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("PRESCRIPTION (℞)", 14, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  doc.text(`Ref: ${r.rx_id.slice(0, 8).toUpperCase()}`, w - 14, y, { align: "right" });
  doc.setTextColor(0);
  y += 6;

  doc.setDrawColor(220);
  doc.rect(14, y, w - 28, 22);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold").text("Patient:", 18, y + 6);
  doc.setFont("helvetica", "normal").text(r.patient_name, 38, y + 6);
  doc.setFont("helvetica", "bold").text("MRN:", 18, y + 12);
  doc.setFont("helvetica", "normal").text(r.mrn ?? "—", 38, y + 12);
  doc.setFont("helvetica", "bold").text("Age/Sex:", 18, y + 18);
  doc.setFont("helvetica", "normal").text(`${r.age ?? "—"} · ${r.gender ?? "—"}`, 38, y + 18);
  doc.setFont("helvetica", "bold").text("Issued:", w / 2 + 4, y + 6);
  doc.setFont("helvetica", "normal").text(new Date(r.created_at).toLocaleString("en-GB"), w / 2 + 26, y + 6);
  doc.setFont("helvetica", "bold").text("Facility:", w / 2 + 4, y + 12);
  doc.setFont("helvetica", "normal").text(ORG_NAME, w / 2 + 26, y + 12);
  y += 30;

  doc.setFillColor(240, 244, 248);
  doc.rect(14, y, w - 28, 8, "F");
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("Medication", 16, y + 5.5);
  doc.text("Dose", 90, y + 5.5);
  doc.text("Frequency", 118, y + 5.5);
  doc.text("Duration", 158, y + 5.5);
  y += 8;

  doc.setFont("helvetica", "normal").setFontSize(9);
  for (const it of r.items) {
    if (y > h - 55) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold").text(it.medication, 16, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(it.dose ?? "—", 90, y + 5);
    doc.text(it.frequency ?? "—", 118, y + 5);
    doc.text(it.duration ?? "—", 158, y + 5);
    y += 6;
    if (it.instructions) {
      const lines = doc.splitTextToSize(`Instructions: ${it.instructions}`, w - 32);
      doc.setFontSize(8).setTextColor(90);
      doc.text(lines, 18, y + 4);
      doc.setFontSize(9).setTextColor(0);
      y += lines.length * 4 + 2;
    }
    doc.setDrawColor(235);
    doc.line(14, y + 2, w - 14, y + 2);
    y += 4;
  }

  const sigY = Math.max(y + 20, h - 55);
  doc.setDrawColor(120);
  doc.line(14, sigY, 90, sigY);
  doc.setFontSize(9).text("Prescriber signature", 14, sigY + 5);
  if (r.prescriber) doc.text(r.prescriber, 14, sigY + 11);

  doc.setFontSize(8).setTextColor(120);
  doc.text("Dispense only against valid prescription. Keep this document for your records.", w / 2, h - 8, { align: "center" });
  doc.setTextColor(0);

  await drawVerifyQR(doc, `${siteOrigin()}/verify/rx/${r.rx_id}`);
  doc.save(`prescription-${r.rx_id.slice(0, 8)}.pdf`);
}
