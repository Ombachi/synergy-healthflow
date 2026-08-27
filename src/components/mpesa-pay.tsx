import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initiateMpesaPayment, getMpesaPaymentStatus } from "@/lib/mpesa.functions";

/**
 * Reusable M-Pesa (Daraja STK push) panel for any payment point — billing desk,
 * patient self-service bills, mobility/transport fares, pharmacy, etc.
 * Every payment point settles against an invoice, so it only needs the invoice id.
 */
export function MpesaPayPanel({
  invoiceId,
  defaultPhone,
  invalidateKeys = [["invoices"], ["payments"]],
  onSettled,
  label = "Send M-Pesa prompt",
}: {
  invoiceId: string;
  defaultPhone?: string | null;
  invalidateKeys?: readonly (readonly unknown[])[];
  onSettled?: (status: string) => void;
  label?: string;
}) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [tx, setTx] = useState<{ checkoutRequestId: string; status: string; resultDesc?: string | null } | null>(null);
  const sendStkPush = useServerFn(initiateMpesaPayment);
  const pollStatus = useServerFn(getMpesaPaymentStatus);

  const push = useMutation({
    mutationFn: async () => {
      if (!phone.trim()) throw new Error("Enter the M-Pesa phone number");
      return sendStkPush({ data: { invoiceId, phone: phone.trim() } });
    },
    onSuccess: (res) => {
      setTx({ checkoutRequestId: res.checkoutRequestId, status: "pending" });
      toast.success("M-Pesa prompt sent", { description: res.message });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!tx || tx.status !== "pending") return;
    const timer = setInterval(async () => {
      try {
        const res = await pollStatus({ data: { checkoutRequestId: tx.checkoutRequestId } });
        if (res.status !== "pending") {
          setTx({ checkoutRequestId: tx.checkoutRequestId, status: res.status, resultDesc: res.resultDesc });
          clearInterval(timer);
          invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k as unknown[] }));
          if (res.status === "success") {
            toast.success(`M-Pesa payment received${res.receipt ? ` · ${res.receipt}` : ""}`);
          } else {
            toast.error(res.resultDesc ?? "M-Pesa payment failed or was cancelled");
          }
          onSettled?.(res.status);
        }
      } catch {
        // transient errors are fine; keep polling
      }
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, pollStatus, qc]);

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div>
        <Label>M-Pesa phone</Label>
        <Input
          placeholder="e.g. 0712 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={!!tx && tx.status === "pending"}
        />
      </div>
      {!tx && (
        <Button variant="secondary" className="w-full" onClick={() => push.mutate()} disabled={push.isPending || !phone.trim()}>
          {push.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending prompt…</>
          ) : (
            <><Smartphone className="mr-2 h-4 w-4" /> {label}</>
          )}
        </Button>
      )}
      {tx?.status === "pending" && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the M-Pesa PIN to be entered…
        </div>
      )}
      {tx?.status === "success" && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
          Payment confirmed and posted to this invoice automatically.
        </div>
      )}
      {tx && tx.status !== "pending" && tx.status !== "success" && (
        <div className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
          {tx.resultDesc ?? "Payment failed or was cancelled."}
        </div>
      )}
    </div>
  );
}
