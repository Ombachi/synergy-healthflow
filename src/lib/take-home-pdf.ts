import jsPDF from "jspdf";
import { drawBrandHeader, ORG_NAME } from "./pdf-brand";

export interface TakeHomePack {
  patient_name: string;
  mrn: string | null;
  admitted_at: string;
  discharged_at: string;
  diagnosis: string;
  medicines: { name: string; how: string }[];
  diet: string;
  red_flags: string[];
  follow_up: string;
  sick_off_days: number;
  doctor_name?: string | null;
}

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB");

export async function exportTakeHomePDF(p: TakeHomePack) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  let y = await drawBrandHeader(doc, { title: "Going Home — Your Discharge Instructions", accent: [20, 110, 90] });
  const ensure = (n: number) => { if (y + n > h - 20) { doc.addPage(); y = 20; } };
  const heading = (t: string) => { ensure(12); y += 4; doc.setFontSize(12).setFont("helvetica", "bold").text(t, 14, y); y += 6; doc.setFontSize(10).setFont("helvetica", "normal"); };
  const para = (t: string) => { const l = doc.splitTextToSize(t, w - 28); ensure(l.length * 5); doc.text(l, 14, y); y += l.length * 5 + 1; };

  y += 4;
  doc.setFontSize(10);
  para(`Name: ${p.patient_name}${p.mrn ? `   ·   MRN: ${p.mrn}` : ""}`);
  para(`In hospital: ${fmt(p.admitted_at)} to ${fmt(p.discharged_at)}`);
  if (p.diagnosis) para(`Reason for your stay: ${p.diagnosis}`);

  heading("Your medicines at home");
  if (p.medicines.length === 0) para("No new medicines.");
  p.medicines.forEach((m) => para(`•  ${m.name} — ${m.how}`));
  para("Finish the full course even if you feel better. Do not share your medicines.");

  heading("Food and drink");
  para(p.diet);

  heading("Come back to hospital immediately if you have:");
  doc.setTextColor(170, 30, 30);
  p.red_flags.forEach((f) => para(`!  ${f}`));
  doc.setTextColor(0);

  heading("Follow-up");
  para(p.follow_up);

  if (p.sick_off_days > 0) {
    doc.addPage(); y = await drawBrandHeader(doc, { title: "Certificate of Illness", accent: [30, 90, 168] });
    y += 10;
    const end = new Date(p.discharged_at); end.setDate(end.getDate() + p.sick_off_days - 1);
    para(`This is to certify that ${p.patient_name} was admitted under our care from ${fmt(p.admitted_at)} and discharged on ${fmt(p.discharged_at)}.`);
    y += 2;
    para(`They require a further ${p.sick_off_days} day(s) of rest, from ${fmt(p.discharged_at)} to ${fmt(end.toISOString())}, and should be excused from work or school during this period.`);
    y = Math.max(y + 30, 200);
    doc.line(14, y, 90, y);
    doc.setFontSize(9).text("Attending clinician", 14, y + 5);
    if (p.doctor_name) doc.text(p.doctor_name, 14, y + 11);
  }

  doc.setFontSize(8).setTextColor(120);
  doc.text(`${ORG_NAME} · Keep this sheet and bring it to your follow-up visit`, w / 2, h - 8, { align: "center" });
  doc.save(`going-home-${p.patient_name.replace(/\s+/g, "_")}.pdf`);
}
