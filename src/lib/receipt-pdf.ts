import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawBrandHeader, ORG_NAME } from "./pdf-brand";

export interface ReceiptInput {
  payment_id: string;
  received_at: string;
  amount_cents: number;
  method: string;
  reference: string | null;
  patient_name: string;
  mrn: string | null;
  invoice_id: string;
  invoice_total_cents: number;
  invoice_paid_cents: number;
  items?: { description: string; qty: number; amount_cents: number }[];
}

const money = (c: number) =>
  `KES ${(c / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METHOD_LABEL: Record<string, string> = {
  mpesa: "M-Pesa",
  card: "Card",
  bank_transfer: "Bank transfer",
  insurance: "Insurance",
  cash: "Cash",
};

export async function exportReceiptPDF(r: ReceiptInput): Promise<void> {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  let y = await drawBrandHeader(doc, { title: "Payment Receipt", accent: [16, 122, 90] });
  y += 4;

  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(`RECEIPT ${r.payment_id.slice(0, 8).toUpperCase()}`, 14, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  doc.text(new Date(r.received_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }), w - 14, y, {
    align: "right",
  });
  doc.setTextColor(0);
  y += 6;

  doc.setDrawColor(220).setLineWidth(0.2);
  doc.rect(14, y, w - 28, 22);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold").text("Received from:", 18, y + 6);
  doc.setFont("helvetica", "normal").text(r.patient_name, 48, y + 6);
  doc.setFont("helvetica", "bold").text("MRN:", 18, y + 12);
  doc.setFont("helvetica", "normal").text(r.mrn ?? "—", 48, y + 12);
  doc.setFont("helvetica", "bold").text("Invoice:", 18, y + 18);
  doc.setFont("helvetica", "normal").text(r.invoice_id.slice(0, 8).toUpperCase(), 48, y + 18);
  doc.setFont("helvetica", "bold").text("Method:", w / 2 + 6, y + 6);
  doc.setFont("helvetica", "normal").text(METHOD_LABEL[r.method] ?? r.method, w / 2 + 30, y + 6);
  doc.setFont("helvetica", "bold").text("Reference:", w / 2 + 6, y + 12);
  doc.setFont("helvetica", "normal").text(r.reference || "—", w / 2 + 30, y + 12);
  y += 30;

  if (r.items?.length) {
    autoTable(doc, {
      startY: y,
      head: [["Billed item", "Qty", "Amount"]],
      body: r.items.map((i) => [i.description, String(i.qty), money(i.amount_cents)]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [16, 122, 90], textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  const balance = Math.max(0, r.invoice_total_cents - r.invoice_paid_cents);
  const rows: [string, string][] = [
    ["Amount paid", money(r.amount_cents)],
    ["Invoice total", money(r.invoice_total_cents)],
    ["Total paid to date", money(r.invoice_paid_cents)],
    ["Outstanding balance", money(balance)],
  ];
  doc.setFontSize(10);
  rows.forEach(([label, value], i) => {
    const bold = i === 0 || i === rows.length - 1;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, w - 90, y);
    doc.text(value, w - 14, y, { align: "right" });
    y += 6;
  });

  y += 4;
  doc.setDrawColor(220).line(14, y, w - 14, y);
  y += 6;
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(16, 122, 90);
  doc.text(balance === 0 ? "PAID IN FULL" : "PARTIALLY PAID", 14, y);
  doc.setTextColor(0);

  doc.setFont("helvetica", "italic").setFontSize(7.5).setTextColor(120);
  doc.text(
    `${ORG_NAME} — this is a computer-generated receipt and is valid without a signature.`,
    14,
    doc.internal.pageSize.getHeight() - 12,
  );

  doc.save(`receipt-${r.payment_id.slice(0, 8)}.pdf`);
}
