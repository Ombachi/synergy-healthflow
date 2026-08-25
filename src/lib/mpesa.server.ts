// Server-only Daraja (M-Pesa) helpers. Never import from client code.

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  baseUrl: string;
}

/** Returns null when Daraja keys are not configured yet. */
export function getMpesaConfig(): MpesaConfig | null {
  const consumerKey = process.env["MPESA_CONSUMER_KEY"];
  const consumerSecret = process.env["MPESA_CONSUMER_SECRET"];
  const shortcode = process.env["MPESA_SHORTCODE"];
  const passkey = process.env["MPESA_PASSKEY"];
  if (!consumerKey || !consumerSecret || !shortcode || !passkey) return null;
  const baseUrl =
    process.env["MPESA_ENV"] === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  return { consumerKey, consumerSecret, shortcode, passkey, baseUrl };
}

/** Normalize Kenyan phone input to 2547XXXXXXXX. */
export function normalizeKenyanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  throw new Error("Enter a valid Kenyan phone number (e.g. 0712345678)");
}

async function getAccessToken(cfg: MpesaConfig): Promise<string> {
  const res = await fetch(
    `${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${btoa(`${cfg.consumerKey}:${cfg.consumerSecret}`)}`,
      },
    },
  );
  if (!res.ok) throw new Error(`Daraja auth failed (${res.status})`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Daraja did not return an access token");
  return json.access_token;
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  customerMessage: string;
}

export async function stkPush(
  cfg: MpesaConfig,
  opts: { phone: string; amountKes: number; accountRef: string; callbackUrl: string },
): Promise<StkPushResult> {
  const token = await getAccessToken(cfg);
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const password = btoa(`${cfg.shortcode}${cfg.passkey}${timestamp}`);

  const res = await fetch(`${cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.max(1, Math.round(opts.amountKes)),
      PartyA: opts.phone,
      PartyB: cfg.shortcode,
      PhoneNumber: opts.phone,
      CallBackURL: opts.callbackUrl,
      AccountReference: opts.accountRef.slice(0, 12),
      TransactionDesc: "Litu Vault invoice payment",
    }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.ResponseCode !== "0") {
    const msg =
      (json.errorMessage as string) ??
      (json.ResponseDescription as string) ??
      `STK push failed (${res.status})`;
    throw new Error(msg);
  }
  return {
    merchantRequestId: String(json.MerchantRequestID ?? ""),
    checkoutRequestId: String(json.CheckoutRequestID ?? ""),
    customerMessage: String(json.CustomerMessage ?? "Prompt sent"),
  };
}
