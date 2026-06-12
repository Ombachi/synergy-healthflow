import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/billing")({ component: BillingPage });

interface Invoice { id: string; visit_id: string | null; patient_id: string; total_cents: number; paid_cents: number; status: string; created_at: string }
interface InvoiceItem { id: string; invoice_id: string; description: string; kind: string; qty: number; unit_price_cents: number; amount_cents: number }
interface Payment { id: string; invoice_id: string; amount_cents: number; method: string; reference: string | null; received_at: string }
interface Patient { id: string; full_name: string }

const money = (c: number) => (c/100).toLocaleString(undefined, { style: "currency", currency: "KES" });

function BillingPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [payOpen, setPayOpen] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cash", reference: "" });

  const invoices = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices" as never).select("*").order("created_at", { ascending: false }).limit(200);
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
      const { data, error } = await supabase.from("payments" as never).select("*").order("received_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data as unknown as Payment[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["bill-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name");
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
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

  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";
  const today = new Date(); today.setHours(0,0,0,0);
  const todayPayments = payments.data?.filter((p) => new Date(p.received_at) >= today) ?? [];
  const todayTotal = todayPayments.reduce((s, p) => s + p.amount_cents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Receipt className="h-6 w-6 text-primary" /> Billing</h1>
        <p className="text-sm text-muted-foreground">Issue invoices, take payments, and reconcile.</p>
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

      <div className="rounded-lg border bg-card">
        <div className="border-b p-3 font-medium">Invoices</div>
        <div className="divide-y">
          {invoices.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No invoices.</div>}
          {invoices.data?.map((inv) => {
            const lines = items.data?.filter((i) => i.invoice_id === inv.id) ?? [];
            const due = inv.total_cents - inv.paid_cents;
            return (
              <div key={inv.id} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{patientName(inv.patient_id)}</div>
                    <div className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleString()} · {lines.length} item(s)</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold">{money(inv.total_cents)}</div>
                      {inv.paid_cents > 0 && <div className="text-xs text-muted-foreground">Paid: {money(inv.paid_cents)}</div>}
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs ${
                      inv.status === "paid" ? "bg-green-500/10 text-green-700" :
                      inv.status === "partially_paid" ? "bg-amber-500/10 text-amber-700" :
                      inv.status === "issued" ? "bg-blue-500/10 text-blue-700" :
                      inv.status === "void" ? "bg-rose-500/10 text-rose-700" :
                      "bg-muted text-muted-foreground"
                    }`}>{inv.status}</span>
                    <div className="flex gap-1">
                      {inv.status === "draft" && <Button size="sm" variant="outline" onClick={() => issue.mutate(inv.id)}>Issue</Button>}
                      {inv.status !== "paid" && inv.status !== "void" && due > 0 && (
                        <Button size="sm" onClick={() => { setPayOpen(inv); setPayForm({ amount: (due/100).toFixed(2), method: "cash", reference: "" }); }}>
                          <DollarSign className="h-4 w-4" />Take payment
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {lines.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded bg-muted/30 p-2 text-xs md:grid-cols-3">
                    {lines.map((l) => (
                      <div key={l.id} className="flex justify-between">
                        <span className="truncate">{l.description}</span>
                        <span className="font-medium">{money(l.amount_cents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
