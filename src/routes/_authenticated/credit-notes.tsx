import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Check, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/credit-notes")({ component: CreditNotesPage });

interface CreditNote {
  id: string;
  invoice_id: string;
  patient_id: string;
  amount_cents: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_by: string;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  refund_method: string | null;
  refund_reference: string | null;
}
interface Invoice { id: string; patient_id: string; total_cents: number; paid_cents: number; status: string; created_at: string }
interface Patient { id: string; full_name: string }

const money = (c: number) => (c/100).toLocaleString("en-GB", { style: "currency", currency: "KES" });

function CreditNotesPage() {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const canReview = roles.includes("admin") || roles.includes("billing_officer");

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ invoice_id: "", amount: "", reason: "" });
  const [reviewing, setReviewing] = useState<CreditNote | null>(null);
  const [reviewForm, setReviewForm] = useState({ method: "cash", reference: "", notes: "" });

  const notes = useQuery({
    queryKey: ["credit-notes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_notes" as never).select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data as unknown as CreditNote[]) ?? [];
    },
  });
  const invoices = useQuery({
    queryKey: ["cn-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices" as never).select("id, patient_id, total_cents, paid_cents, status, created_at")
        .gt("paid_cents", 0).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data as unknown as Invoice[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["cn-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name");
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const inv = invoices.data?.find((i) => i.id === form.invoice_id);
      if (!inv) throw new Error("Select an invoice");
      const cents = Math.round(parseFloat(form.amount) * 100);
      if (!cents || cents <= 0) throw new Error("Enter valid amount");
      if (cents > inv.paid_cents) throw new Error("Refund exceeds paid amount");
      if (!form.reason.trim()) throw new Error("Reason is required");
      const { error } = await supabase.from("credit_notes" as never).insert({
        invoice_id: inv.id, patient_id: inv.patient_id, amount_cents: cents,
        reason: form.reason, created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setCreating(false); setForm({ invoice_id: "", amount: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      toast.success("Credit note submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!reviewing) return;
      const { error } = await supabase.rpc("approve_credit_note" as never, {
        _credit_note_id: reviewing.id,
        _refund_method: reviewForm.method,
        _refund_reference: reviewForm.reference || null,
        _notes: reviewForm.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setReviewing(null);
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Credit note approved and refund posted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const reason = prompt("Rejection reason?") ?? "";
      if (!reason) throw new Error("Reason required");
      const { error } = await supabase.rpc("reject_credit_note" as never, {
        _credit_note_id: id, _notes: reason,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["credit-notes"] }); toast.success("Rejected"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Receipt className="h-6 w-6 text-primary" /> Credit notes & refunds</h1>
          <p className="text-sm text-muted-foreground">Raise refunds against paid invoices. Billing officers or admins approve.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New credit note</Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b p-3 font-medium">All credit notes</div>
        <div className="divide-y">
          {notes.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">None yet.</div>}
          {notes.data?.map((n) => (
            <div key={n.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{patientName(n.patient_id)} · {money(n.amount_cents)}</div>
                  <div className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("en-GB")}</div>
                  <div className="mt-1 text-xs">Reason: {n.reason}</div>
                  {n.review_notes && <div className="mt-1 text-xs text-muted-foreground">Review: {n.review_notes}</div>}
                  {n.status === "approved" && n.refund_method && (
                    <div className="mt-1 text-xs text-muted-foreground">Refunded via {n.refund_method}{n.refund_reference ? ` · ${n.refund_reference}` : ""}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${
                    n.status === "approved" ? "bg-green-500/10 text-green-700" :
                    n.status === "rejected" ? "bg-rose-500/10 text-rose-700" :
                    "bg-amber-500/10 text-amber-700"
                  }`}>{n.status}</span>
                  {n.status === "pending" && canReview && (
                    <>
                      <Button size="sm" onClick={() => { setReviewing(n); setReviewForm({ method: "cash", reference: "", notes: "" }); }}>
                        <Check className="h-4 w-4" />Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reject.mutate(n.id)}>
                        <X className="h-4 w-4" />Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>New credit note</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Invoice</Label>
              <Select value={form.invoice_id} onValueChange={(v) => setForm({ ...form, invoice_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select paid invoice" /></SelectTrigger>
                <SelectContent>
                  {invoices.data?.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {patientName(i.patient_id)} · Paid {money(i.paid_cents)} / {money(i.total_cents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewing} onOpenChange={(v) => !v && setReviewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve credit note</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded bg-muted/40 p-2 text-sm">
              {reviewing && <>Refund {money(reviewing.amount_cents)} to {patientName(reviewing.patient_id)}</>}
            </div>
            <div>
              <Label>Refund method</Label>
              <Select value={reviewForm.method} onValueChange={(v) => setReviewForm({ ...reviewForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card reversal</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference</Label><Input value={reviewForm.reference} onChange={(e) => setReviewForm({ ...reviewForm, reference: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={reviewForm.notes} onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => approve.mutate()} disabled={approve.isPending}>Approve & post refund</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
