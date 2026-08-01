import jsPDF from "jspdf";
import { drawBrandHeader, ORG_NAME } from "./pdf-brand";

export interface SickOff {
  id: string;
  patient_name: string;
  mrn: string | null;
  doctor_name?: string | null;
  diagnosis: string | null;
  recommendation: string | null;
  days: number;
  start_date: string;
  end_date: string;
  created_at: string;
}

const DEFAULT_DOCTOR = "Dr Dan";

function fmt(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-GB");
}

export async function exportSickOffPDF(s: SickOff) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  let y = await drawBrandHeader(doc, { title: "Medical Sick-Off Certificate", accent: [30, 90, 168] });

  y += 4;
  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(120);
  doc.text(`Issued ${fmt(s.created_at)}  ·  Ref ${s.id.slice(0, 8).toUpperCase()}`, w / 2, y, { align: "center" });
  y += 10;
  doc.setTextColor(0);

  doc.setFontSize(11).setFont("helvetica", "bold").text("Patient", 14, y); y += 6;
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text(`Name: ${s.patient_name}`, 14, y); y += 5;
  if (s.mrn) { doc.text(`MRN: ${s.mrn}`, 14, y); y += 5; }
  y += 4;

  doc.setFontSize(11).setFont("helvetica", "bold").text("Recommendation", 14, y); y += 7;
  doc.setFontSize(10).setFont("helvetica", "normal");

  const name = s.patient_name;
  const paragraphs = [
    `This certificate serves to certify that ${name} was under our professional medical care.`,
    `Following our clinical examination conducted on ${fmt(s.created_at)}, ${name} requires immediate rest and recovery for ${s.days} day(s), from ${fmt(s.start_date)} to ${fmt(s.end_date)}.`,
    `${name} is advised to take a formal medical leave from all occupational / educational duties.`,
    `Please excuse their absence during this specified timeframe. For additional clearance or verification, do not hesitate to contact us.`,
  ];
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(p, w - 28);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 4;
  }

  // Diagnosis and clinical notes are intentionally omitted (medical confidentiality).


  y = Math.max(y + 24, 200);
  doc.line(14, y, 90, y);
  doc.setFontSize(9).text("Attending physician", 14, y + 5);
  doc.text(s.doctor_name || DEFAULT_DOCTOR, 14, y + 11);

  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8).setTextColor(120);
  doc.text(`Issued by ${ORG_NAME}  ·  +254 781 872670  ·  litudiagnostics.com`, w / 2, h - 8, { align: "center" });
  doc.setTextColor(0);

  doc.save(`sick-off-${s.patient_name.replace(/\s+/g, "_")}-${s.id.slice(0, 8)}.pdf`);
}
