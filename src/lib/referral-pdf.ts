import jsPDF from "jspdf";
import { drawBrandHeader, ORG_NAME } from "@/lib/pdf-brand";

export interface ReferralLetterData {
  patientName: string;
  mrn?: string | null;
  age?: string | null;
  gender?: string | null;
  specialty: string;
  urgency: string;
  referredToName?: string | null;
  externalFacility?: string | null;
  reason: string;
  clinicalSummary?: string | null;
  investigations?: string | null;
  currentMedications?: string | null;
  referringClinician: string;
  date: Date;
}

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** Builds a printable referral / consult-request letter. */
export async function generateReferralLetter(data: ReferralLetterData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const left = 16;
  const right = w - 16;
  let y = await drawBrandHeader(doc, { title: "Referral Letter" });

  y += 4;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(`Date: ${fmt(data.date)}`, right, y, { align: "right" });
  doc.setTextColor(0);

  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("To:", left, y);
  doc.setFont("helvetica", "normal");
  const to = [data.referredToName, data.externalFacility].filter(Boolean).join(" — ") || "The Consultant";
  doc.text(`${to}`, left + 12, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Specialty:", left, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.specialty, left + 22, y);
  doc.setFont("helvetica", "bold");
  doc.text("Urgency:", left + 90, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.urgency.toUpperCase(), left + 112, y);
  y += 8;

  // Patient block
  doc.setDrawColor(220).setFillColor(246, 248, 251);
  doc.roundedRect(left, y, right - left, 18, 2, 2, "FD");
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text(data.patientName, left + 4, y + 7);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(80);
  const meta = [
    data.mrn ? `MRN: ${data.mrn}` : null,
    data.age ? `Age: ${data.age}` : null,
    data.gender ? `Sex: ${data.gender}` : null,
  ].filter(Boolean).join("   ·   ");
  doc.text(meta || "—", left + 4, y + 13);
  doc.setTextColor(0);
  y += 26;

  const section = (title: string, body?: string | null) => {
    if (!body || !body.trim()) return;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(title, left, y);
    y += 5;
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    const lines = doc.splitTextToSize(body.trim(), right - left);
    doc.text(lines, left, y);
    y += lines.length * 4.6 + 5;
  };

  doc.setFont("helvetica", "normal").setFontSize(9.5);
  const intro = doc.splitTextToSize(
    `Thank you for seeing ${data.patientName}, whom I am referring for your expert opinion and further management.`,
    right - left,
  );
  doc.text(intro, left, y);
  y += intro.length * 4.6 + 6;

  section("Reason for referral", data.reason);
  section("Clinical summary", data.clinicalSummary);
  section("Investigations to date", data.investigations);
  section("Current medications", data.currentMedications);

  if (y > 240) { doc.addPage(); y = 20; }
  y += 4;
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  const outro = doc.splitTextToSize(
    "Kindly review and advise. I would be grateful for a copy of your assessment and recommendations for continuity of care. Please do not hesitate to contact us should you require any further information.",
    right - left,
  );
  doc.text(outro, left, y);
  y += outro.length * 4.6 + 14;

  doc.setDrawColor(150);
  doc.line(left, y, left + 60, y);
  y += 5;
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text(data.referringClinician, left, y);
  y += 5;
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(90);
  doc.text(`Referring clinician · ${ORG_NAME}`, left, y);

  return doc;
}
