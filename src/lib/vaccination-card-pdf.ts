import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawBrandHeader, drawVerifyQR, siteOrigin, ORG_NAME } from "./pdf-brand";

export interface CardPatient {
  id: string;
  full_name: string;
  medical_record_number: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
}

export interface CardDose {
  id: string;
  vaccine_name: string;
  antigen: string | null;
  dose_number: number;
  route: string | null;
  site: string | null;
  administered_at: string;
  batch_number: string | null;
  manufacturer: string | null;
  vaccinator_name: string | null;
  facility: string | null;
  immediate_reaction?: string | null;
}

const d = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB") : "—");

/** Digital vaccination card / immunization report as a print-ready PDF. */
export async function exportVaccinationCardPDF(
  patient: CardPatient,
  doses: CardDose[],
  due: string[] = [],
) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  let y = await drawBrandHeader(doc, { title: "Digital Vaccination Card", accent: [16, 122, 87] });

  y += 4;
  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(120);
  doc.text(`Issued ${new Date().toLocaleDateString("en-GB")}`, w / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 6;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [16, 122, 87] },
    head: [["Patient", "MRN", "Date of birth", "Sex"]],
    body: [[
      patient.full_name,
      patient.medical_record_number ?? "—",
      patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString("en-GB") : "—",
      patient.gender ?? "—",
    ]],
    margin: { left: 14, right: 14 },
  });
  // @ts-expect-error jspdf-autotable internal
  y = doc.lastAutoTable.finalY + 8;

  const sorted = [...doses].sort(
    (a, b) => new Date(a.administered_at).getTime() - new Date(b.administered_at).getTime(),
  );

  autoTable(doc, {
    startY: y,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [16, 122, 87] },
    head: [["Date", "Vaccine", "Antigen", "Dose", "Route / site", "Batch", "Vaccinator"]],
    body: sorted.length
      ? sorted.map((i) => [
          d(i.administered_at),
          i.vaccine_name,
          i.antigen ?? "—",
          String(i.dose_number),
          `${i.route ?? "—"} / ${i.site ?? "—"}`,
          i.batch_number ?? "—",
          i.vaccinator_name ?? "—",
        ])
      : [["—", "No vaccinations recorded", "—", "—", "—", "—", "—"]],
    margin: { left: 14, right: 14 },
  });
  // @ts-expect-error jspdf-autotable internal
  y = doc.lastAutoTable.finalY + 10;

  if (due.length) {
    doc.setFont("helvetica", "bold").setFontSize(10).text("Doses due / overdue", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal").setFontSize(9);
    const lines = doc.splitTextToSize(due.join("  •  "), w - 28);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 4;
  }

  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8).setTextColor(120);
  doc.text(
    `Issued by ${ORG_NAME}. This immunization record is verifiable via the QR code below.`,
    w / 2,
    h - 8,
    { align: "center" },
  );
  doc.setTextColor(0);
  await drawVerifyQR(doc, `${siteOrigin()}/verify/immunization/${patient.id}`);

  doc.save(`vaccination-card-${patient.full_name.replace(/\s+/g, "_")}.pdf`);
}

/** CSV export of an immunization registry selection. */
export function immunizationsToCSV(
  rows: Array<CardDose & { patient_name: string; mrn: string | null }>,
): string {
  const head = [
    "Patient", "MRN", "Date", "Vaccine", "Antigen", "Dose", "Route", "Site",
    "Batch", "Manufacturer", "Vaccinator", "Facility",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.patient_name, r.mrn ?? "", d(r.administered_at), r.vaccine_name, r.antigen ?? "",
      r.dose_number, r.route ?? "", r.site ?? "", r.batch_number ?? "",
      r.manufacturer ?? "", r.vaccinator_name ?? "", r.facility ?? "",
    ].map(esc).join(","),
  );
  return [head.map(esc).join(","), ...lines].join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Opens the user's mail client with a summary of the vaccination record. */
export function emailVaccinationCard(patient: CardPatient, doses: CardDose[], to?: string | null) {
  const body = [
    `Vaccination record for ${patient.full_name} (MRN ${patient.medical_record_number ?? "—"})`,
    "",
    ...doses.map((i) => `${d(i.administered_at)} — ${i.vaccine_name} dose ${i.dose_number}`),
    "",
    `Issued by ${ORG_NAME}. Please find the printable card attached from the portal download.`,
  ].join("\n");
  const href = `mailto:${to ?? ""}?subject=${encodeURIComponent(
    `Vaccination record — ${patient.full_name}`,
  )}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}
