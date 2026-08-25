import { createFileRoute } from "@tanstack/react-router";
import { settleMpesaTransaction } from "@/lib/mpesa.functions";

interface StkCallbackItem {
  Name: string;
  Value?: string | number;
}

/**
 * Safaricom Daraja STK callback. Public endpoint — the payload itself is the
 * proof (CheckoutRequestID must match a pending transaction we created).
 */
export const Route = createFileRoute("/api/public/payments/daraja-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ResultCode: 1, ResultDesc: "Bad request" }, { status: 400 });
        }

        const cb = body?.Body?.stkCallback;
        const checkoutRequestId: string | undefined = cb?.CheckoutRequestID;
        if (!checkoutRequestId) {
          return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tx } = await supabaseAdmin
          .from("mpesa_transactions")
          .select("id, invoice_id, amount_cents, mpesa_receipt, initiated_by, posted_payment_id, status")
          .eq("checkout_request_id", checkoutRequestId)
          .single();
        if (!tx) {
          return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        const resultCode: number = cb.ResultCode ?? -1;
        const resultDesc: string = cb.ResultDesc ?? "";
        const items: StkCallbackItem[] = cb?.CallbackMetadata?.Item ?? [];
        const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as
          | string
          | undefined;

        const status = resultCode === 0 ? "success" : "failed";
        await supabaseAdmin
          .from("mpesa_transactions")
          .update({
            status,
            result_code: resultCode,
            result_desc: resultDesc,
            mpesa_receipt: receipt ?? null,
          } as never)
          .eq("id", (tx as { id: string }).id);

        if (status === "success") {
          await settleMpesaTransaction({ ...(tx as any), status, mpesa_receipt: receipt ?? null });
        }

        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
