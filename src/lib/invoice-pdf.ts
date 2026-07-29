import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawBrandHeader, drawVerifyQR, siteOrigin } from "./pdf-brand";

export interface InvoiceLine {
  description: string;
  kind: string;
  qty: number;
  unit_price_cents: number;
  amount_cents: number;
}
export interface InvoicePayment {
  received_at: string;
  method: string;
  reference: string | null;
  cashier: string;
  amount_cents: number;
}
export interface InvoiceData {
  id: string;
  created_at: string;
  status: string;
  total_cents: number;
  patient_name: string;
  patient_mrn: string | null;
  clinician: string;
  items: InvoiceLine[];
  payments: InvoicePayment[];
}

const money = (c: number) => (c / 100).toLocaleString(undefined, { style: "currency", currency: "KES" });

/**
 * Generates a dedicated invoice PDF from structured data.
 * Does NOT capture DOM or the surrounding page — pure jsPDF render.
 */
export async function exportInvoicePDF(d: InvoiceData) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const invNo = `INV-${d.id.slice(0, 8).toUpperCase()}`;
  let y = await drawBrandHeader(doc, { title: "Tax Invoice", accent: [30, 90, 168] });
  y += 4;

  // Invoice meta row
  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(80);
  doc.text(`Invoice #: ${invNo}`, 14, y);
  doc.text(`Issued: ${new Date(d.created_at).toLocaleDateString()}`, w - 14, y, { align: "right" });
  y += 4;
  doc.text(`Status: ${d.status.replace(/_/g, " ")}`, 14, y);
  doc.setTextColor(0);
  y += 6;

  // Bill-to + clinician
  autoTable(doc, {
    startY: y,
    head: [["Bill to", "MRN", "Attending clinician"]],
    body: [[d.patient_name, d.patient_mrn ?? "—", d.clinician]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
  });
  // @ts-expect-error lastAutoTable types
  y = doc.lastAutoTable.finalY + 4;

  // Line items
  autoTable(doc, {
    startY: y,
    head: [["Description", "Kind", "Qty", "Unit price", "Amount"]],
    body: d.items.length
      ? d.items.map((i) => [
          i.description,
          i.kind,
          String(i.qty),
          money(i.unit_price_cents),
          money(i.amount_cents),
        ])
      : [["No line items", "", "", "", ""]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });
  // @ts-expect-error lastAutoTable types
  y = doc.lastAutoTable.finalY + 4;

  // Totals block (right-aligned)
  const paid = d.payments.reduce((s, p) => s + p.amount_cents, 0);
  const balance = d.total_cents - paid;
  const subtotal = d.items.reduce((s, i) => s + i.amount_cents, 0);
  const totalsX = w - 80;
  doc.setFontSize(9).setFont("helvetica", "normal");
  const row = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, totalsX, y);
    doc.text(val, w - 14, y, { align: "right" });
    y += 5;
  };
  row("Subtotal", money(subtotal));
  row("Grand total", money(d.total_cents), true);
  row("Payments received", `-${money(paid)}`);
  doc.setDrawColor(200); doc.line(totalsX, y - 1, w - 14, y - 1);
  row("Balance due", money(balance), true);
  y += 4;

  // Payments table (optional)
  if (d.payments.length) {
    if (y > 230) { doc.addPage(); y = 16; }
    doc.setFontSize(10).setFont("helvetica", "bold").text("Payments", 14, y); y += 2;
    autoTable(doc, {
      startY: y,
      head: [["Date", "Method", "Receipt #", "Cashier", "Amount"]],
      body: d.payments.map((p) => [
        new Date(p.received_at).toLocaleString(),
        p.method,
        p.reference ?? "—",
        p.cashier,
        money(p.amount_cents),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      columnStyles: { 4: { halign: "right" } },
    });
    // @ts-expect-error lastAutoTable types
    y = doc.lastAutoTable.finalY + 4;
  }

  // Footer + verify QR
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8).setTextColor(120);
  doc.text("Thank you for choosing Litu Vault Hospital. This is a computer-generated invoice.", 14, pageH - 12);
  await drawVerifyQR(doc, `${siteOrigin()}/verify/invoice/${d.id}`);

  doc.save(`${invNo}-${d.patient_name.replace(/\s+/g, "_")}.pdf`);
}
