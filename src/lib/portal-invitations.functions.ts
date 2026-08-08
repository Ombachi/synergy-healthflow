import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MIN_PASSWORD_LENGTH = 12;

function requestMeta() {
  const req = getRequest();
  const h = req.headers;
  const origin =
    h.get("origin") ??
    (h.get("x-forwarded-host") ? `https://${h.get("x-forwarded-host")}` : new URL(req.url).origin);
  return {
    origin,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  const { data: isRecep } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "receptionist",
  });
  if (!isAdmin && !isRecep) throw new Error("Forbidden");
  return { isAdmin: !!isAdmin };
}

/** Admin/reception list of patients with their latest invitation state. */
export const listPortalInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: patients, error } = await supabaseAdmin
      .from("patients")
      .select("id, full_name, email, phone, medical_record_number, user_id")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const { data: invites } = await supabaseAdmin
      .from("patient_portal_invitations" as never)
      .select("*")
      .order("created_at", { ascending: false });

    const latest = new Map<string, any>();
    for (const inv of (invites ?? []) as any[]) {
      if (!latest.has(inv.patient_id)) latest.set(inv.patient_id, inv);
    }

    return (patients ?? []).map((p) => {
      const inv = latest.get(p.id);
      const now = Date.now();
      let status: "active_account" | "activated" | "pending" | "expired" | "none" = "none";
      if (p.user_id) status = "active_account";
      else if (inv?.used_at) status = "activated";
      else if (inv && !inv.invalidated_at && new Date(inv.expires_at).getTime() > now) status = "pending";
      else if (inv) status = "expired";
      return {
        patient_id: p.id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        mrn: p.medical_record_number,
        has_account: !!p.user_id,
        status,
        invitation_id: inv?.id ?? null,
        expires_at: inv?.expires_at ?? null,
        last_sent_at: inv?.last_sent_at ?? null,
        send_count: inv?.send_count ?? 0,
        channel: inv?.channel ?? null,
      };
    });
  });

/**
 * Issues (or re-issues) an invitation. Any previous live token for the patient
 * is invalidated first, so a resend always kills the old link.
 */
export const issuePortalInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patientId: string; channel?: "email" | "sms" }) => d)
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      mintToken, activationUrl, deliverActivationLink, logInvitationEvent, INVITE_TTL_HOURS,
    } = await import("./portal-invitations.server");
    const meta = requestMeta();

    const { data: patient, error: pErr } = await supabaseAdmin
      .from("patients")
      .select("id, full_name, email, phone, user_id")
      .eq("id", data.patientId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!patient) throw new Error("Patient not found");

    if (patient.user_id) {
      await logInvitationEvent({
        patient_id: patient.id, event: "invitation_skipped",
        reason: "account_already_active", actor_id: context.userId,
        ip_address: meta.ip, user_agent: meta.userAgent,
      });
      return { status: "already_active" as const, link: null, delivered: false, reason: "account_already_active" };
    }

    if (!patient.email && !patient.phone) {
      await logInvitationEvent({
        patient_id: patient.id, event: "invitation_failed", reason: "no_contact_on_file",
        actor_id: context.userId, ip_address: meta.ip, user_agent: meta.userAgent,
      });
      return { status: "no_contact" as const, link: null, delivered: false, reason: "no_contact_on_file" };
    }

    // Invalidate every live token for this patient.
    const { data: killed } = await supabaseAdmin
      .from("patient_portal_invitations" as never)
      .update({ invalidated_at: new Date().toISOString() } as never)
      .eq("patient_id", patient.id)
      .is("used_at", null)
      .is("invalidated_at", null)
      .select("id");
    for (const k of (killed ?? []) as any[]) {
      await logInvitationEvent({
        invitation_id: k.id, patient_id: patient.id, event: "invitation_invalidated",
        reason: "superseded_by_resend", actor_id: context.userId,
        ip_address: meta.ip, user_agent: meta.userAgent,
      });
    }

    const { token, tokenHash } = mintToken();
    const preferred = data.channel ?? (patient.email ? "email" : "sms");
    const expires = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString();

    const { data: inv, error: iErr } = await supabaseAdmin
      .from("patient_portal_invitations" as never)
      .insert({
        patient_id: patient.id,
        email: patient.email,
        phone: patient.phone,
        channel: preferred,
        token_hash: tokenHash,
        expires_at: expires,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);
    const invitationId = (inv as any).id as string;

    await logInvitationEvent({
      invitation_id: invitationId, patient_id: patient.id, event: "invitation_created",
      channel: preferred, actor_id: context.userId, ip_address: meta.ip,
      user_agent: meta.userAgent, metadata: { expires_at: expires },
    });

    const link = activationUrl(meta.origin, token);
    const delivery = await deliverActivationLink({
      origin: meta.origin,
      email: patient.email,
      phone: patient.phone,
      patientName: patient.full_name ?? "there",
      link,
      preferred,
    });

    await supabaseAdmin
      .from("patient_portal_invitations" as never)
      .update({ last_sent_at: new Date().toISOString(), send_count: 1 } as never)
      .eq("id", invitationId);

    await logInvitationEvent({
      invitation_id: invitationId, patient_id: patient.id,
      event: delivery.delivered ? "invitation_sent" : "invitation_send_failed",
      reason: delivery.reason ?? null, channel: delivery.channel,
      actor_id: context.userId, ip_address: meta.ip, user_agent: meta.userAgent,
    });

    return {
      status: "issued" as const,
      // The raw link is only ever returned to the staff member who issued it,
      // so it can be handed over manually while email/SMS delivery is pending.
      link,
      delivered: delivery.delivered,
      reason: delivery.reason ?? null,
      channel: delivery.channel,
    };
  });

/** Bulk issue for every registered patient without a portal account. */
export const issueAllPortalInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await assertStaff(context as never);
    if (!isAdmin) throw new Error("Admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      mintToken, activationUrl, deliverActivationLink, logInvitationEvent, INVITE_TTL_HOURS,
    } = await import("./portal-invitations.server");
    const meta = requestMeta();

    const { data: patients } = await supabaseAdmin
      .from("patients")
      .select("id, full_name, email, phone, user_id")
      .is("user_id", null)
      .limit(500);

    let issued = 0, sent = 0, skipped = 0;
    const links: { patient: string; email: string | null; link: string }[] = [];

    for (const p of patients ?? []) {
      if (!p.email && !p.phone) { skipped++; continue; }
      await supabaseAdmin
        .from("patient_portal_invitations" as never)
        .update({ invalidated_at: new Date().toISOString() } as never)
        .eq("patient_id", p.id)
        .is("used_at", null)
        .is("invalidated_at", null);

      const { token, tokenHash } = mintToken();
      const preferred = p.email ? "email" : "sms";
      const { data: inv } = await supabaseAdmin
        .from("patient_portal_invitations" as never)
        .insert({
          patient_id: p.id, email: p.email, phone: p.phone, channel: preferred,
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + INVITE_TTL_HOURS * 3600_000).toISOString(),
          created_by: context.userId,
        } as never)
        .select("id")
        .single();
      const invitationId = (inv as any)?.id ?? null;
      issued++;

      const link = activationUrl(meta.origin, token);
      const delivery = await deliverActivationLink({
        origin: meta.origin, email: p.email, phone: p.phone,
        patientName: p.full_name ?? "there", link, preferred,
      });
      if (delivery.delivered) sent++;
      else links.push({ patient: p.full_name ?? p.id, email: p.email, link });

      await supabaseAdmin
        .from("patient_portal_invitations" as never)
        .update({ last_sent_at: new Date().toISOString(), send_count: 1 } as never)
        .eq("id", invitationId);

      await logInvitationEvent({
        invitation_id: invitationId, patient_id: p.id,
        event: delivery.delivered ? "invitation_sent" : "invitation_send_failed",
        reason: delivery.reason ?? null, channel: delivery.channel,
        actor_id: context.userId, ip_address: meta.ip, user_agent: meta.userAgent,
        metadata: { bulk: true },
      });
    }

    return { issued, sent, skipped, links };
  });

/** Security audit trail (admin only). */
export const listInvitationEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await assertStaff(context as never);
    if (!isAdmin) throw new Error("Admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("portal_invitation_events" as never)
      .select("id, event, reason, channel, ip_address, created_at, patient_id")
      .order("created_at", { ascending: false })
      .limit(300);

    const ids = [...new Set(((data ?? []) as any[]).map((e) => e.patient_id).filter(Boolean))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: pts } = await supabaseAdmin.from("patients").select("id, full_name").in("id", ids);
      for (const p of pts ?? []) names.set(p.id, p.full_name ?? "");
    }
    return ((data ?? []) as any[]).map((e) => ({ ...e, patient_name: names.get(e.patient_id) ?? null }));
  });

/** PUBLIC — validates a token for the activation page. Logs the click. */
export const validateActivationToken = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashToken, logInvitationEvent } = await import("./portal-invitations.server");
    const meta = requestMeta();
    const hash = hashToken(data.token);

    const { data: inv } = await supabaseAdmin
      .from("patient_portal_invitations" as never)
      .select("id, patient_id, email, expires_at, used_at, invalidated_at")
      .eq("token_hash", hash)
      .maybeSingle();

    if (!inv) {
      await logInvitationEvent({
        event: "activation_failed", reason: "unknown_token",
        ip_address: meta.ip, user_agent: meta.userAgent,
      });
      return { valid: false as const, reason: "invalid" as const };
    }
    const i = inv as any;
    await logInvitationEvent({
      invitation_id: i.id, patient_id: i.patient_id, event: "link_clicked",
      ip_address: meta.ip, user_agent: meta.userAgent,
    });

    if (i.used_at) return { valid: false as const, reason: "used" as const };
    if (i.invalidated_at) return { valid: false as const, reason: "revoked" as const };
    if (new Date(i.expires_at).getTime() <= Date.now()) {
      await logInvitationEvent({
        invitation_id: i.id, patient_id: i.patient_id, event: "invitation_expired",
        ip_address: meta.ip, user_agent: meta.userAgent,
      });
      return { valid: false as const, reason: "expired" as const };
    }

    const { data: p } = await supabaseAdmin
      .from("patients").select("full_name, email, phone").eq("id", i.patient_id).maybeSingle();

    return {
      valid: true as const,
      email: (i.email as string | null) ?? p?.email ?? null,
      fullName: p?.full_name ?? null,
      phoneHint: p?.phone ? `••••${String(p.phone).slice(-4)}` : null,
    };
  });

/** PUBLIC — single-use activation: verifies contact, creates the account. */
export const activatePortalAccount = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; password: string; verify: string; acceptedTerms: boolean }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashToken, logInvitationEvent } = await import("./portal-invitations.server");
    const meta = requestMeta();

    if (!data.acceptedTerms) throw new Error("You must accept the terms and privacy notice.");
    if (data.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const hash = hashToken(data.token);
    const { data: inv } = await supabaseAdmin
      .from("patient_portal_invitations" as never)
      .select("id, patient_id, email, expires_at, used_at, invalidated_at")
      .eq("token_hash", hash)
      .maybeSingle();

    const fail = async (reason: string, invId?: string, patientId?: string) => {
      await logInvitationEvent({
        invitation_id: invId ?? null, patient_id: patientId ?? null,
        event: "activation_failed", reason, ip_address: meta.ip, user_agent: meta.userAgent,
      });
      throw new Error(
        reason === "expired" ? "This activation link has expired. Ask reception to resend it."
          : reason === "used" ? "This activation link has already been used."
          : reason === "revoked" ? "This activation link is no longer valid."
          : reason === "contact_mismatch" ? "The details you entered do not match our records."
          : "This activation link is not valid.",
      );
    };

    if (!inv) return fail("unknown_token");
    const i = inv as any;
    if (i.used_at) return fail("used", i.id, i.patient_id);
    if (i.invalidated_at) return fail("revoked", i.id, i.patient_id);
    if (new Date(i.expires_at).getTime() <= Date.now()) return fail("expired", i.id, i.patient_id);

    const { data: patient } = await supabaseAdmin
      .from("patients").select("id, full_name, email, phone, user_id").eq("id", i.patient_id).maybeSingle();
    if (!patient) return fail("patient_missing", i.id, i.patient_id);
    if (patient.user_id) return fail("account_already_active", i.id, patient.id);

    // Identity check: the patient must confirm their email or phone on file.
    const entered = data.verify.trim().toLowerCase();
    const okEmail = patient.email && entered === patient.email.trim().toLowerCase();
    const digits = (s: string) => s.replace(/\D/g, "").slice(-9);
    const okPhone = patient.phone && digits(entered).length >= 9 && digits(entered) === digits(patient.phone);
    if (!okEmail && !okPhone) return fail("contact_mismatch", i.id, patient.id);

    const loginEmail = patient.email ?? i.email;
    if (!loginEmail) return fail("no_email_for_login", i.id, patient.id);

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: patient.full_name },
    });
    if (cErr || !created?.user) {
      await logInvitationEvent({
        invitation_id: i.id, patient_id: patient.id, event: "activation_failed",
        reason: `auth_create_${cErr?.message ?? "unknown"}`.slice(0, 180),
        ip_address: meta.ip, user_agent: meta.userAgent,
      });
      throw new Error(cErr?.message ?? "Could not create the account.");
    }

    const uid = created.user.id;
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "patient" } as never);
    await supabaseAdmin.from("patients").update({ user_id: uid }).eq("id", patient.id);
    await supabaseAdmin
      .from("patient_portal_invitations" as never)
      .update({ used_at: new Date().toISOString() } as never)
      .eq("id", i.id);

    await logInvitationEvent({
      invitation_id: i.id, patient_id: patient.id, event: "activation_succeeded",
      ip_address: meta.ip, user_agent: meta.userAgent,
    });

    return { ok: true as const, email: loginEmail };
  });
