import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawBrandHeader, ORG_NAME } from "./pdf-brand";

export interface QcReportRun {
  run_at: string;
  analyte: string;
  qc_level: string;
  lot_number: string | null;
  target_value: number | null;
  sd: number | null;
  observed_value: number | null;
  z_score: number | null;
  result: string;
  comments: string | null;
}

export interface QcReportInput {
  instrument: { name: string; manufacturer: string | null; model: string | null; serial_number: string | null; lab_section: string; location: string | null };
  filters: string;
  runs: QcReportRun[];
}

export async function exportQcHistoryPDF(r: QcReportInput): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape" });
  const w = doc.internal.pageSize.getWidth();
  let y = await drawBrandHeader(doc, { title: "QC History Report", accent: [15, 76, 117] });
  y += 4;

  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(r.instrument.name.toUpperCase(), 14, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  doc.text(`Generated ${new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}`, w - 14, y, { align: "right" });
  doc.setTextColor(0);
  y += 6;

  doc.setFontSize(8.5).setTextColor(90);
  doc.text(
    `${r.instrument.manufacturer ?? "—"} ${r.instrument.model ?? ""} · S/N ${r.instrument.serial_number ?? "—"} · ${r.instrument.lab_section} · ${r.instrument.location ?? "—"}`,
    14,
    y,
  );
  y += 5;
  doc.text(`Filters: ${r.filters}`, 14, y);
  y += 5;

  const pass = r.runs.filter((x) => x.result === "pass").length;
  const warn = r.runs.filter((x) => x.result === "warn").length;
  const fail = r.runs.filter((x) => x.result === "fail").length;
  const rate = r.runs.length ? Math.round((pass / r.runs.length) * 100) : 0;
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(9);
  doc.text(`Runs: ${r.runs.length}    Pass: ${pass}    Warn: ${warn}    Fail: ${fail}    Pass rate: ${rate}%`, 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Run at", "Analyte", "Level", "Lot", "Target", "SD", "Observed", "Z (SDI)", "Result", "Comments"]],
    body: r.runs.map((x) => [
      new Date(x.run_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }),
      x.analyte,
      x.qc_level,
      x.lot_number ?? "—",
      x.target_value ?? "—",
      x.sd ?? "—",
      x.observed_value ?? "—",
      x.z_score == null ? "—" : Number(x.z_score).toFixed(2),
      x.result.toUpperCase(),
      x.comments ?? "",
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.6 },
    headStyles: { fillColor: [15, 76, 117], textColor: 255 },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 8) {
        const v = String(data.cell.raw);
        if (v === "FAIL") data.cell.styles.textColor = [190, 30, 45];
        else if (v === "WARN") data.cell.styles.textColor = [180, 120, 10];
        else data.cell.styles.textColor = [20, 130, 80];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(120);
  doc.text(`${ORG_NAME} — internal quality control record.`, 14, doc.internal.pageSize.getHeight() - 8);

  doc.save(`qc-history-${r.instrument.name.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}
