import jsPDF from "jspdf";

export interface WadaTest {
  tested_at: string;
  test_type: string;
  in_competition: boolean;
  result: string;
  wada_code?: string | null;
  collecting_authority?: string | null;
  substances_detected?: string | null;
}

export interface WadaTUE {
  substance: string;
  diagnosis?: string | null;
  status: string;
  decision_reference?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  created_at: string;
}

export interface WadaTrend {
  marker: string;
  units?: string | null;
  points: { measured_at: string; value: number; flag?: string | null }[];
  baseline?: { personal_low: number | null; personal_high: number | null; mean: number | null } | null;
}

export interface WadaReportInput {
  athlete_name: string;
  athlete_sport?: string | null;
  dob?: string | null;
  passport_id?: string | null;
  facility?: string;
  tests: WadaTest[];
  tues: WadaTUE[];
  trends: WadaTrend[];
  passport_url?: string;
}

const FACILITY = "Vitalis Medical Centre · WADA-compliant athlete passport";

export function exportWadaReportPDF(r: WadaReportInput) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Header
  doc.setFillColor(15, 76, 117);
  doc.rect(0, 0, w, 22, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(14);
  doc.text(r.facility ?? FACILITY, 14, 10);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Athlete Biological Passport & Anti-Doping Report", 14, 17);
  doc.setTextColor(0);

  let y = 30;
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(r.athlete_name, 14, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  if (r.passport_id) doc.text(`Passport ID: ${r.passport_id}`, w - 14, y, { align: "right" });
  y += 5;
  doc.text(
    [r.athlete_sport ? `Sport: ${r.athlete_sport}` : null, r.dob ? `DOB: ${r.dob}` : null]
      .filter(Boolean)
      .join(" · "),
    14, y,
  );
  doc.setTextColor(0);
  y += 8;

  // Testing history
  doc.setFont("helvetica", "bold").setFontSize(11).text("Testing history", 14, y);
  y += 4; doc.setDrawColor(220); doc.line(14, y, w - 14, y); y += 5;
  doc.setFont("helvetica", "bold").setFontSize(8);
  ["Date", "Type", "IC", "Authority", "WADA", "Result", "Substances"].forEach((c, i) =>
    doc.text(c, [14, 38, 56, 64, 100, 120, 140][i], y),
  );
  y += 3; doc.line(14, y, w - 14, y); y += 4;
  doc.setFont("helvetica", "normal").setFontSize(8);
  if (r.tests.length === 0) {
    doc.setTextColor(120).text("No tests on record.", 14, y); doc.setTextColor(0); y += 5;
  }
  for (const t of r.tests) {
    if (y > h - 30) { doc.addPage(); y = 20; }
    doc.text(new Date(t.tested_at).toLocaleDateString(), 14, y);
    doc.text(t.test_type, 38, y);
    doc.text(t.in_competition ? "Y" : "N", 56, y);
    doc.text((t.collecting_authority ?? "—").slice(0, 18), 64, y);
    doc.text((t.wada_code ?? "—").slice(0, 12), 100, y);
    if (["positive", "adverse"].includes(t.result)) doc.setTextColor(190, 30, 30);
    else if (t.result === "atypical") doc.setTextColor(200, 130, 0);
    doc.text(t.result, 120, y);
    doc.setTextColor(0);
    doc.text((t.substances_detected ?? "—").slice(0, 30), 140, y);
    y += 5;
  }
  y += 4;

  // TUEs
  if (y > h - 40) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold").setFontSize(11).text("Therapeutic Use Exemptions", 14, y);
  y += 4; doc.line(14, y, w - 14, y); y += 5;
  doc.setFont("helvetica", "bold").setFontSize(8);
  ["Submitted", "Substance", "Diagnosis", "Valid", "Status", "Reference"].forEach((c, i) =>
    doc.text(c, [14, 40, 75, 115, 145, 165][i], y),
  );
  y += 3; doc.line(14, y, w - 14, y); y += 4;
  doc.setFont("helvetica", "normal").setFontSize(8);
  if (r.tues.length === 0) {
    doc.setTextColor(120).text("No TUEs on record.", 14, y); doc.setTextColor(0); y += 5;
  }
  for (const u of r.tues) {
    if (y > h - 25) { doc.addPage(); y = 20; }
    doc.text(new Date(u.created_at).toLocaleDateString(), 14, y);
    doc.text((u.substance ?? "—").slice(0, 22), 40, y);
    doc.text((u.diagnosis ?? "—").slice(0, 26), 75, y);
    doc.text(`${u.valid_from ?? "—"}→${u.valid_to ?? "—"}`, 115, y);
    if (u.status === "approved") doc.setTextColor(30, 130, 60);
    else if (u.status === "denied") doc.setTextColor(190, 30, 30);
    else doc.setTextColor(200, 130, 0);
    doc.text(u.status, 145, y);
    doc.setTextColor(0);
    doc.text((u.decision_reference ?? "—").slice(0, 18), 165, y);
    y += 5;
  }
  y += 4;

  // Trends / passport visualization (compact mini-charts)
  for (const tr of r.trends) {
    if (y > h - 70) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(`${tr.marker}${tr.units ? ` (${tr.units})` : ""}`, 14, y);
    y += 3;
    const chartX = 14, chartY = y, chartW = w - 28, chartH = 38;
    doc.setDrawColor(220).rect(chartX, chartY, chartW, chartH);

    const values = tr.points.map((p) => p.value);
    const bLow = tr.baseline?.personal_low ?? null;
    const bHigh = tr.baseline?.personal_high ?? null;
    const min = Math.min(...values, bLow ?? Infinity);
    const max = Math.max(...values, bHigh ?? -Infinity);
    const range = max - min || 1;

    // Baseline band
    if (bLow !== null && bHigh !== null) {
      const y1 = chartY + chartH - ((bHigh - min) / range) * chartH;
      const y2 = chartY + chartH - ((bLow - min) / range) * chartH;
      doc.setFillColor(220, 240, 220);
      doc.rect(chartX, y1, chartW, y2 - y1, "F");
    }

    // Polyline
    doc.setDrawColor(15, 76, 117).setLineWidth(0.6);
    for (let i = 1; i < tr.points.length; i++) {
      const x0 = chartX + ((i - 1) / Math.max(1, tr.points.length - 1)) * chartW;
      const x1 = chartX + (i / Math.max(1, tr.points.length - 1)) * chartW;
      const y0 = chartY + chartH - ((tr.points[i - 1].value - min) / range) * chartH;
      const yy = chartY + chartH - ((tr.points[i].value - min) / range) * chartH;
      doc.line(x0, y0, x1, yy);
    }
    // Dots
    doc.setFillColor(15, 76, 117);
    tr.points.forEach((p, i) => {
      const x = chartX + (i / Math.max(1, tr.points.length - 1)) * chartW;
      const yy = chartY + chartH - ((p.value - min) / range) * chartH;
      doc.circle(x, yy, 0.8, "F");
    });
    doc.setFontSize(7).setTextColor(110).setFont("helvetica", "normal");
    doc.text(`min ${min.toFixed(2)} · max ${max.toFixed(2)} · n=${tr.points.length}`, chartX + 2, chartY + chartH - 2);
    doc.setTextColor(0);
    y += chartH + 6;
  }

  // Footer with passport link
  doc.setFontSize(8).setTextColor(120);
  doc.text(
    `Generated ${new Date().toLocaleString()}${r.passport_url ? ` · Passport: ${r.passport_url}` : ""}`,
    14, h - 8,
  );

  doc.save(`WADA-Report-${r.athlete_name.replace(/\s+/g, "_")}.pdf`);
}
