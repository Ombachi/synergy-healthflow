import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawBrandHeader } from "./pdf-brand";

interface LabTest {
  test: string;
  performed_at: string | null;
  overall_flag?: string | null;
  interpretation?: string | null;
  parameters: Array<{
    name: string;
    result: string | null;
    units: string | null;
    reference: string | null;
    flag: string | null;
  }>;
}

interface VisitData {
  visit: {
    id: string; opened_at: string; closed_at: string | null; status: string;
    reason: string | null; chief_complaint: string | null; triage_level: string | null;
    notes: string | null;
  };
  patient: {
    full_name: string;
    medical_record_number: string | null;
    date_of_birth: string | null;
    gender?: string | null;
    blood_type: string | null;
    allergies: string | null;
  };
  vitals: Array<{ captured_at: string; systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null; temperature_c: number | null; oxygen_saturation: number | null; respiratory_rate: number | null }>;
  diagnoses: Array<{ diagnosis: string; icd_code: string | null; is_primary: boolean }>;
  prescriptions: Array<{ medication: string; dose: string | null; frequency: string | null; duration: string | null; instructions: string | null }>;
  labs?: LabTest[];
  imaging?: Array<{ modality: string; body_part: string | null; report: string | null; performed_at: string | null }>;
  discharge: { summary: string; treatment_plan: string | null; follow_up: string | null } | null;
}

function ageFromDob(dob: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  if (isNaN(+d)) return "—";
  const y = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${y}y`;
}

export async function exportVisitPDF(d: VisitData) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  let y = await drawBrandHeader(doc, { title: "Visit Summary", accent: [30, 90, 168] });
  y += 4;

  // Patient block — tabulated like the lab report header
  autoTable(doc, {
    startY: y,
    head: [["Patient", "MRN", "Age / Sex", "DOB", "Blood", "Allergies"]],
    body: [[
      d.patient.full_name,
      d.patient.medical_record_number ?? "—",
      `${ageFromDob(d.patient.date_of_birth)} · ${d.patient.gender ?? "—"}`,
      d.patient.date_of_birth ?? "—",
      d.patient.blood_type ?? "—",
      d.patient.allergies ?? "—",
    ]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
  });
  // @ts-expect-error lastAutoTable types
  y = doc.lastAutoTable.finalY + 4;

  doc.setFontSize(11).setFont("helvetica", "bold").text("Visit", 14, y); y += 5;
  doc.setFontSize(9).setFont("helvetica", "normal");
  doc.text(`Opened: ${new Date(d.visit.opened_at).toLocaleString()}`, 14, y); y += 4;
  if (d.visit.closed_at) { doc.text(`Closed: ${new Date(d.visit.closed_at).toLocaleString()}`, 14, y); y += 4; }
  doc.text(`Status: ${d.visit.status}  ·  Triage: ${d.visit.triage_level ?? "—"}`, 14, y); y += 4;
  if (d.visit.reason) { doc.text(`Reason: ${d.visit.reason}`, 14, y); y += 4; }
  if (d.visit.chief_complaint) {
    const lines = doc.splitTextToSize(`Chief complaint: ${d.visit.chief_complaint}`, w - 28);
    doc.text(lines, 14, y); y += lines.length * 4;
  }
  y += 2;

  if (d.vitals.length) {
    autoTable(doc, {
      startY: y, head: [["When", "BP", "HR", "RR", "Temp °C", "SpO₂"]],
      body: d.vitals.map((v) => [
        new Date(v.captured_at).toLocaleString(),
        v.systolic_bp && v.diastolic_bp ? `${v.systolic_bp}/${v.diastolic_bp}` : "—",
        v.heart_rate ?? "—", v.respiratory_rate ?? "—",
        v.temperature_c ?? "—", v.oxygen_saturation ?? "—",
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [30, 64, 175] },
    });
    // @ts-expect-error lastAutoTable types
    y = doc.lastAutoTable.finalY + 6;
  }

  if (d.diagnoses.length) {
    doc.setFontSize(11).setFont("helvetica", "bold").text("Diagnoses", 14, y); y += 1;
    autoTable(doc, {
      startY: y + 2, head: [["Diagnosis", "ICD-11", "Primary"]],
      body: d.diagnoses.map((x) => [x.diagnosis, x.icd_code ?? "—", x.is_primary ? "Yes" : ""]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [30, 64, 175] },
    });
    // @ts-expect-error lastAutoTable types
    y = doc.lastAutoTable.finalY + 6;
  }

  if (d.prescriptions.length) {
    doc.setFontSize(11).setFont("helvetica", "bold").text("Prescriptions", 14, y); y += 1;
    autoTable(doc, {
      startY: y + 2, head: [["Medication", "Dose", "Frequency", "Duration", "Instructions"]],
      body: d.prescriptions.map((r) => [r.medication, r.dose ?? "—", r.frequency ?? "—", r.duration ?? "—", r.instructions ?? ""]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [30, 64, 175] },
    });
    // @ts-expect-error lastAutoTable types
    y = doc.lastAutoTable.finalY + 6;
  }

  if (d.labs && d.labs.length) {
    doc.setFontSize(11).setFont("helvetica", "bold").text("Laboratory results", 14, y); y += 4;
    for (const t of d.labs) {
      if (y > 250) { doc.addPage(); y = 16; }
      doc.setFontSize(10).setFont("helvetica", "bold").text(t.test, 14, y);
      if (t.performed_at) {
        doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(120);
        doc.text(new Date(t.performed_at).toLocaleString(), w - 14, y, { align: "right" });
        doc.setTextColor(0);
      }
      y += 2;
      if (t.parameters.length === 0) {
        doc.setFontSize(9).setFont("helvetica", "italic").setTextColor(120);
        doc.text("Pending result.", 14, y + 4); doc.setTextColor(0);
        y += 8; continue;
      }
      autoTable(doc, {
        startY: y + 2,
        head: [["Parameter", "Result", "Units", "Reference Range", "Flag"]],
        body: t.parameters.map((p) => [
          p.name,
          p.result ?? "—",
          p.units ?? "",
          p.reference ?? "",
          p.flag ? p.flag.toUpperCase() : "",
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 64, 175] },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: "bold" },
          1: { cellWidth: 30 },
          2: { cellWidth: 22 },
          3: { cellWidth: 45 },
          4: { cellWidth: 24 },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 4) {
            const raw = String(data.cell.raw ?? "").toLowerCase();
            if (raw.includes("critical")) data.cell.styles.textColor = [200, 30, 30];
            else if (raw === "high" || raw === "low") data.cell.styles.textColor = [200, 110, 0];
          }
        },
      });
      // @ts-expect-error lastAutoTable types
      y = doc.lastAutoTable.finalY + 3;
      if (t.interpretation) {
        doc.setFontSize(8).setFont("helvetica", "italic").setTextColor(80);
        const lines = doc.splitTextToSize(`Interpretation: ${t.interpretation}`, w - 28);
        doc.text(lines, 14, y + 2);
        y += lines.length * 4 + 2;
        doc.setTextColor(0);
      }
      y += 4;
    }
  }

  if (d.imaging && d.imaging.length) {
    if (y > 250) { doc.addPage(); y = 16; }
    doc.setFontSize(11).setFont("helvetica", "bold").text("Imaging", 14, y); y += 1;
    autoTable(doc, {
      startY: y + 2, head: [["Modality", "Body part", "Report", "When"]],
      body: d.imaging.map((i) => [i.modality, i.body_part ?? "", i.report ?? "pending", i.performed_at ? new Date(i.performed_at).toLocaleString() : ""]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [30, 64, 175] },
    });
    // @ts-expect-error lastAutoTable types
    y = doc.lastAutoTable.finalY + 6;
  }

  if (d.visit.notes) {
    if (y > 250) { doc.addPage(); y = 16; }
    doc.setFontSize(11).setFont("helvetica", "bold").text("Clinical notes", 14, y); y += 5;
    doc.setFontSize(9).setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(d.visit.notes, w - 28);
    doc.text(lines, 14, y); y += lines.length * 4 + 4;
  }

  if (d.discharge) {
    if (y > 230) { doc.addPage(); y = 16; }
    doc.setFontSize(11).setFont("helvetica", "bold").text("Discharge summary", 14, y); y += 5;
    doc.setFontSize(9).setFont("helvetica", "normal");
    const s = doc.splitTextToSize(d.discharge.summary, w - 28);
    doc.text(s, 14, y); y += s.length * 4 + 2;
    if (d.discharge.treatment_plan) {
      doc.setFont("helvetica", "bold").text("Treatment plan:", 14, y); y += 4;
      doc.setFont("helvetica", "normal");
      const t = doc.splitTextToSize(d.discharge.treatment_plan, w - 28);
      doc.text(t, 14, y); y += t.length * 4 + 2;
    }
    if (d.discharge.follow_up) {
      doc.setFont("helvetica", "bold").text("Follow-up:", 14, y); y += 4;
      doc.setFont("helvetica", "normal");
      const f = doc.splitTextToSize(d.discharge.follow_up, w - 28);
      doc.text(f, 14, y); y += f.length * 4;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(150);
    doc.text(`Page ${i} of ${pages}`, w - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }

  doc.save(`visit-${d.patient.full_name.replace(/\s+/g, "_")}-${d.visit.id.slice(0, 8)}.pdf`);
}
