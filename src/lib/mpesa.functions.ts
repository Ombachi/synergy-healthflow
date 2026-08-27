import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMpesaConfig, normalizeKenyanPhone, stkPush } from "./mpesa.server";

const FINANCE_ROLES = ["cashier", "billing_officer", "admin"] as const;

async function hasFinanceRole(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  return roles.some((r) => (FINANCE_ROLES as readonly string[]).includes(r));
}

async function assertFinanceRole(supabase: any, userId: string) {
  if (!(await hasFinanceRole(supabase, userId))) {
    throw new Error("Only billing staff can initiate M-Pesa payments");
  }
}

/** Billing staff, or the patient paying their own invoice. */
async function assertCanPayInvoice(supabase: any, userId: string, patientId: string) {
  if (await hasFinanceRole(supabase, userId)) return;
  const { data } = await supabase
    .from("patients")
    .select("id")
    .eq("user_id", userId)
    .eq("id", patientId)
    .maybeSingle();
  if (!data) throw new Error("You are not allowed to pay this invoice");
}

/**
 * Post a successful M-Pesa transaction into payments + update the invoice.
 * Guarded by posted_payment_id so the callback and the poller can't double-post.
 * Runs with the service role so it works from the public Daraja callback too.
 */
export async function settleMpesaTransaction(tx: {
  id: string;
  invoice_id: string;
  amount_cents: number;
  mpesa_receipt: string | null;
  initiated_by: string;
  posted_payment_id: string | null;
  status: string;
}) {
  if (tx.status !== "success" || tx.posted_payment_id) return { posted: false };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payment, error: payErr } = await supabaseAdmin
    .from("payments")
    .insert({
      invoice_id: tx.invoice_id,
      amount_cents: tx.amount_cents,
      method: "mpesa",
      reference: tx.mpesa_receipt,
      received_by: tx.initiated_by,
    } as never)
    .select("id")
    .single();
  if (payErr) throw payErr;
  const paymentId = (payment as { id: string }).id;

  const { error: txErr } = await supabaseAdmin
    .from("mpesa_transactions" as never)
    .update({ posted_payment_id: paymentId } as never)
    .eq("id", tx.id)
    .is("posted_payment_id", null);
  if (txErr) throw txErr;

  const { data: invoice } = await supabaseAdmin
    .from("invoices")
    .select("total_cents, paid_cents")
    .eq("id", tx.invoice_id)
    .single();
  if (invoice) {
    const inv = invoice as { total_cents: number; paid_cents: number };
    const paid = inv.paid_cents + tx.amount_cents;
    const status = paid >= inv.total_cents ? "paid" : "partially_paid";
    await supabaseAdmin
      .from("invoices")
      .update({ paid_cents: paid, status } as never)
      .eq("id", tx.invoice_id);
  }
  return { posted: true };
}

export const initiateMpesaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        phone: z.string().min(9).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const cfg = getMpesaConfig();
    if (!cfg) {
      throw new Error(
        "M-Pesa is not configured yet. Add the Daraja keys (MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY) to enable phone prompts.",
      );
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, patient_id, total_cents, paid_cents, status")
      .eq("id", data.invoiceId)
      .single();
    if (invErr || !invoice) throw new Error("Invoice not found");
    const inv = invoice as {
      id: string;
      patient_id: string;
      total_cents: number;
      paid_cents: number;
      status: string;
    };
    await assertCanPayInvoice(supabase, userId, inv.patient_id);
    const dueCents = inv.total_cents - inv.paid_cents;
    if (dueCents <= 0) throw new Error("Invoice is already fully paid");
    if (inv.status === "void") throw new Error("Invoice is void");

    const phone = normalizeKenyanPhone(data.phone);
    const origin = new URL(getRequest().url).origin;
    const accountRef = `INV-${inv.id.slice(0, 8).toUpperCase()}`;

    const stk = await stkPush(cfg, {
      phone,
      amountKes: dueCents / 100,
      accountRef,
      callbackUrl: `${origin}/api/public/payments/daraja-callback`,
    });

    const { error: txErr } = await supabase.from("mpesa_transactions").insert({
      invoice_id: inv.id,
      patient_id: inv.patient_id,
      phone,
      amount_cents: dueCents,
      merchant_request_id: stk.merchantRequestId,
      checkout_request_id: stk.checkoutRequestId,
      status: "pending",
      initiated_by: userId,
    } as never);
    if (txErr) throw txErr;

    return { checkoutRequestId: stk.checkoutRequestId, message: stk.customerMessage };
  });

export const getMpesaPaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ checkoutRequestId: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertFinanceRole(supabase, userId);

    const { data: tx, error } = await supabase
      .from("mpesa_transactions")
      .select("id, invoice_id, amount_cents, mpesa_receipt, initiated_by, posted_payment_id, status, result_desc")
      .eq("checkout_request_id", data.checkoutRequestId)
      .single();
    if (error || !tx) throw new Error("Transaction not found");
    const row = tx as {
      id: string;
      invoice_id: string;
      amount_cents: number;
      mpesa_receipt: string | null;
      initiated_by: string;
      posted_payment_id: string | null;
      status: string;
      result_desc: string | null;
    };

    if (row.status === "success" && !row.posted_payment_id) {
      await settleMpesaTransaction(row);
    }
    return {
      status: row.status,
      resultDesc: row.result_desc,
      receipt: row.mpesa_receipt,
      settled: row.status === "success",
    };
  });
