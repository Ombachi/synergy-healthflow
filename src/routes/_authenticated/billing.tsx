import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, DollarSign, Search, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { exportInvoicePDF } from "@/lib/invoice-pdf";

export const Route = createFileRoute("/_authenticated/billing")({ component: BillingPage });

interface Invoice { id: string; visit_id: string | null; patient_id: string; total_cents: number; paid_cents: number; status: string; created_at: string }
interface InvoiceItem { id: string; invoice_id: string; description: string; kind: string; qty: number; unit_price_cents: number; amount_cents: number }
interface Payment { id: string; invoice_id: string; amount_cents: number; method: string; reference: string | null; received_at: string; received_by: string | null }
interface Patient { id: string; full_name: string; medical_record_number: string | null }
interface Visit { id: string; assigned_doctor_id: string | null; current_stage: string | null }
interface Profile { id: string; full_name: string | null }

const money = (c: number) => (c/100).toLocaleString(undefined, { style: "currency", currency: "KES" });

function BillingPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [payOpen, setPayOpen] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cash", reference: "" });
  const [openInvoice, setOpenInvoice] = useState<Invoice | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const invoices = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices" as never).select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data as unknown as Invoice[]) ?? [];
    },
  });
  const items = useQuery({
    queryKey: ["invoice-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_items" as never).select("*");
      if (error) throw error;
      return (data as unknown as InvoiceItem[]) ?? [];
    },
  });
  const payments = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments" as never).select("*").order("received_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data as unknown as Payment[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["bill-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name, medical_record_number");
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });
  const visits = useQuery({
    queryKey: ["bill-visits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never).select("id, assigned_doctor_id, current_stage");
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });
  const profiles = useQuery({
    queryKey: ["bill-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles" as never).select("id, full_name");
      if (error) throw error;
      return (data as unknown as Profile[]) ?? [];
    },
  });

  const issue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices" as never).update({ status: "issued" } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast.success("Invoice issued"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const takePayment = useMutation({
    mutationFn: async () => {
      if (!payOpen) return;
      const amt = Math.round(parseFloat(payForm.amount) * 100);
      if (!amt || amt <= 0) throw new Error("Enter valid amount");
      const { error } = await supabase.from("payments" as never).insert({
        invoice_id: payOpen.id, amount_cents: amt, method: payForm.method,
        reference: payForm.reference || null, received_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setPayOpen(null); setPayForm({ amount: "", method: "cash", reference: "" });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payment recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patientById = (id: string) => patients.data?.find((p) => p.id === id);
  const patientName = (id: string) => patientById(id)?.full_name ?? "—";
  const patientMrn = (id: string) => patientById(id)?.medical_record_number ?? "";
  const profileName = (id: string | null | undefined) => id ? (profiles.data?.find((p) => p.id === id)?.full_name ?? "—") : "—";
  const doctorForVisit = (vid: string | null | undefined) => {
    if (!vid) return "—";
    const v = visits.data?.find((x) => x.id === vid);
    return profileName(v?.assigned_doctor_id ?? null);
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const todayPayments = payments.data?.filter((p) => new Date(p.received_at) >= today) ?? [];
  const todayTotal = todayPayments.reduce((s, p) => s + p.amount_cents, 0);

  const filtered = useMemo(() => {
    let list = invoices.data ?? [];
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => {
        const p = patientById(i.patient_id);
        return `${p?.full_name ?? ""} ${p?.medical_record_number ?? ""} ${i.id.slice(0,8)} ${i.status}`.toLowerCase().includes(q);
      });
    }
    return list;
  }, [invoices.data, patients.data, search, statusFilter]);

  const statusPill = (s: string) => (
    <span className={`rounded px-2 py-0.5 text-xs ${
      s === "paid" ? "bg-green-500/10 text-green-700" :
      s === "partially_paid" ? "bg-amber-500/10 text-amber-700" :
      s === "issued" ? "bg-blue-500/10 text-blue-700" :
      s === "void" ? "bg-rose-500/10 text-rose-700" :
      "bg-muted text-muted-foreground"
    }`}>{s.replace("_"," ")}</span>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Receipt className="h-6 w-6 text-primary" /> Billing</h1>
        <p className="text-sm text-muted-foreground">Document-centric invoice management. Click any invoice to view the full document.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Open invoices</div>
          <div className="text-2xl font-semibold">{invoices.data?.filter((i) => i.status !== "paid" && i.status !== "void").length ?? 0}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Collected today</div>
          <div className="text-2xl font-semibold">{money(todayTotal)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Payments today</div>
          <div className="text-2xl font-semibold">{todayPayments.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patient, MRN, invoice ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="partially_paid">Partially paid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} invoice{filtered.length === 1 ? "" : "s"}</span>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Invoice #</th>
              <th className="px-3 py-2">Patient</th>
              <th className="px-3 py-2">MRN</th>
              <th className="px-3 py-2">Doctor</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.isLoading && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading invoices…</td></tr>
            )}
            {!invoices.isLoading && filtered.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No invoices{search ? " match your search" : ""}.</td></tr>
            )}
            {filtered.map((inv) => {
              const due = inv.total_cents - inv.paid_cents;
              return (
                <tr
                  key={inv.id}
                  onClick={() => setOpenInvoice(inv)}
                  className="cursor-pointer border-t hover:bg-accent/40"
                >
                  <td className="px-3 py-2 font-mono text-xs">INV-{inv.id.slice(0,8).toUpperCase()}</td>
                  <td className="px-3 py-2 font-medium">{patientName(inv.patient_id)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{patientMrn(inv.patient_id) || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{doctorForVisit(inv.visit_id)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right font-semibold">{money(inv.total_cents)}</td>
                  <td className="px-3 py-2 text-right">{money(due)}</td>
                  <td className="px-3 py-2">{statusPill(inv.status)}</td>
                  <td className="px-3 py-2 text-right">
                    <FileText className="ml-auto h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openInvoice && (
        <InvoiceDocumentDialog
          invoice={openInvoice}
          patient={patientById(openInvoice.patient_id) ?? null}
          doctorName={doctorForVisit(openInvoice.visit_id)}
          items={(items.data ?? []).filter((i) => i.invoice_id === openInvoice.id)}
          payments={(payments.data ?? []).filter((p) => p.invoice_id === openInvoice.id)}
          cashierNameFor={(uid) => profileName(uid)}
          onClose={() => setOpenInvoice(null)}
          onIssue={() => issue.mutate(openInvoice.id)}
          onTakePayment={() => {
            const due = openInvoice.total_cents - openInvoice.paid_cents;
            setPayForm({ amount: (due/100).toFixed(2), method: "cash", reference: "" });
            setPayOpen(openInvoice);
          }}
        />
      )}

      <Dialog open={!!payOpen} onOpenChange={(v) => !v && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount</Label><Input type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
            <div>
              <Label>Method</Label>
              <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference</Label><Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => takePayment.mutate()} disabled={takePayment.isPending}>Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvoiceDocumentDialog({
  invoice, patient, doctorName, items, payments, cashierNameFor, onClose, onIssue, onTakePayment,
}: {
  invoice: Invoice;
  patient: Patient | null;
  doctorName: string;
  items: InvoiceItem[];
  payments: Payment[];
  cashierNameFor: (uid: string | null) => string;
  onClose: () => void;
  onIssue: () => void;
  onTakePayment: () => void;
}) {
  const subtotal = items.reduce((s, i) => s + i.amount_cents, 0);
  const paid = payments.reduce((s, p) => s + p.amount_cents, 0);
  const balance = invoice.total_cents - paid;

  async function handlePrint() {
    await exportInvoicePDF({
      id: invoice.id,
      created_at: invoice.created_at,
      status: invoice.status,
      total_cents: invoice.total_cents,
      patient_name: patient?.full_name ?? "—",
      patient_mrn: patient?.medical_record_number ?? null,
      clinician: doctorName,
      items: items.map((i) => ({
        description: i.description,
        kind: i.kind,
        qty: i.qty,
        unit_price_cents: i.unit_price_cents,
        amount_cents: i.amount_cents,
      })),
      payments: payments.map((p) => ({
        received_at: p.received_at,
        method: p.method,
        reference: p.reference,
        cashier: cashierNameFor(p.received_by),
        amount_cents: p.amount_cents,
      })),
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Invoice INV-{invoice.id.slice(0,8).toUpperCase()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 rounded-md border bg-background p-6 text-sm print:border-0 print:p-0">
          <div className="flex items-start justify-between gap-4 border-b pb-4">
            <div>
              <div className="text-lg font-semibold">Litu Vault Hospital</div>
              <div className="text-xs text-muted-foreground">Tax invoice</div>
            </div>
            <div className="text-right text-xs">
              <div className="font-mono">INV-{invoice.id.slice(0,8).toUpperCase()}</div>
              <div className="text-muted-foreground">Issued {new Date(invoice.created_at).toLocaleDateString()}</div>
              <div className="mt-1 text-muted-foreground capitalize">Status: {invoice.status.replace("_"," ")}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bill to</div>
              <div className="mt-1 font-medium">{patient?.full_name ?? "—"}</div>
              {patient?.medical_record_number && <div className="font-mono text-xs text-muted-foreground">MRN {patient.medical_record_number}</div>}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Attending clinician</div>
              <div className="mt-1 font-medium">{doctorName}</div>
              <div className="text-xs text-muted-foreground">Department: Outpatient</div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Services</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-1.5">Description</th>
                  <th className="px-2 py-1.5 text-right">Qty</th>
                  <th className="px-2 py-1.5 text-right">Unit price</th>
                  <th className="px-2 py-1.5 text-right">Discount</th>
                  <th className="px-2 py-1.5 text-right">Tax</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">No line items.</td></tr>
                )}
                {items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">{it.description}<span className="ml-2 text-[10px] uppercase text-muted-foreground">{it.kind}</span></td>
                    <td className="px-2 py-1.5 text-right">{it.qty}</td>
                    <td className="px-2 py-1.5 text-right">{money(it.unit_price_cents)}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{money(0)}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{money(0)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{money(it.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>{money(0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{money(0)}</span></div>
            <div className="flex justify-between border-t pt-1 font-semibold"><span>Grand total</span><span>{money(invoice.total_cents)}</span></div>
            <div className="flex justify-between text-emerald-700"><span>Payments</span><span>-{money(paid)}</span></div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Balance due</span><span>{money(balance)}</span></div>
          </div>

          {payments.length > 0 && (
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payments</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1.5">Date</th>
                    <th className="px-2 py-1.5">Method</th>
                    <th className="px-2 py-1.5">Receipt #</th>
                    <th className="px-2 py-1.5">Cashier</th>
                    <th className="px-2 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5">{new Date(p.received_at).toLocaleString()}</td>
                      <td className="px-2 py-1.5 capitalize">{p.method}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{p.reference ?? `RCP-${p.id.slice(0,6).toUpperCase()}`}</td>
                      <td className="px-2 py-1.5">{cashierNameFor(p.received_by)}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{money(p.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t pt-3 text-center text-xs text-muted-foreground">
            Thank you for choosing Litu Vault Hospital. This is a computer-generated invoice.
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 print:hidden">
          <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4" /> Print</Button>
          {invoice.status === "draft" && <Button variant="outline" onClick={onIssue}>Issue invoice</Button>}
          {invoice.status !== "paid" && invoice.status !== "void" && balance > 0 && (
            <Button onClick={onTakePayment}><DollarSign className="h-4 w-4" />Take payment</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
