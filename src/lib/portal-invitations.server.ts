// Server-only helpers for patient portal invitations: token minting/hashing,
// audit logging, and delivery (email today, SMS fallback when email is absent).
import { createHash, randomBytes } from "crypto";

/** Raw token given to the patient (never stored) + the hash we persist. */
export function mintToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const INVITE_TTL_HOURS = 72;

export function activationUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/activate?token=${encodeURIComponent(token)}`;
}

type EventInput = {
  invitation_id?: string | null;
  patient_id?: string | null;
  event: string;
  reason?: string | null;
  channel?: string | null;
  actor_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
};

/** Append-only security audit trail. Never throws — logging must not break flows. */
export async function logInvitationEvent(input: EventInput) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("portal_invitation_events" as never).insert({
      invitation_id: input.invitation_id ?? null,
      patient_id: input.patient_id ?? null,
      event: input.event,
      reason: input.reason ?? null,
      channel: input.channel ?? null,
      actor_id: input.actor_id ?? null,
      ip_address: input.ip_address ?? null,
      user_agent: input.user_agent ?? null,
      metadata: input.metadata ?? {},
    } as never);
  } catch {
    /* audit logging is best-effort */
  }
}

export type DeliveryResult = {
  delivered: boolean;
  channel: "email" | "sms" | "manual";
  reason?: string;
};

/**
 * Sends the activation link.
 *
 * Email goes through the project's transactional email route, which only
 * exists once a verified sender domain is configured. Until then this
 * degrades gracefully: the caller still gets the link back so staff can hand
 * it over in person, and the failure is written to the audit trail.
 */
export async function deliverActivationLink(opts: {
  origin: string;
  email: string | null;
  phone: string | null;
  patientName: string;
  link: string;
  preferred: "email" | "sms";
}): Promise<DeliveryResult> {
  const channel: "email" | "sms" =
    opts.preferred === "email" && opts.email ? "email" : opts.phone ? "sms" : "email";

  if (channel === "email") {
    if (!opts.email) return { delivered: false, channel: "manual", reason: "no_email_on_file" };
    try {
      const res = await fetch(`${opts.origin.replace(/\/$/, "")}/lovable/email/transactional/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: "portal-activation",
          recipientEmail: opts.email,
          idempotencyKey: `portal-activation-${hashToken(opts.link).slice(0, 24)}`,
          templateData: { name: opts.patientName, activationUrl: opts.link },
        }),
      });
      if (!res.ok) {
        return { delivered: false, channel: "manual", reason: `email_unavailable_${res.status}` };
      }
      return { delivered: true, channel: "email" };
    } catch (e) {
      return {
        delivered: false,
        channel: "manual",
        reason: `email_error_${e instanceof Error ? e.message : "unknown"}`.slice(0, 120),
      };
    }
  }

  // SMS fallback — no SMS gateway is connected yet, so the link is returned for
  // manual delivery and the attempt is recorded.
  if (!opts.phone) return { delivered: false, channel: "manual", reason: "no_phone_on_file" };
  return { delivered: false, channel: "manual", reason: "sms_gateway_not_configured" };
}
