// FHIR R4 read-only API gateway.
//
// GET /api/public/fhir/metadata
// GET /api/public/fhir/Patient/{id} | /Patient?identifier=|name=
// GET /api/public/fhir/Encounter?patient={id}
// GET /api/public/fhir/Observation?patient={id}
// GET /api/public/fhir/MedicationRequest?patient={id}
//
// Auth:          Authorization: Bearer <access token> (validated server-side).
// Authorization: clinical/admin roles may read any patient; a patient user may
//                read only their own chart. Everything else is 403.
// Audit:         every request (including denials) is written to
//                public.fhir_access_log.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  bundle,
  mapEncounter,
  mapMedicationRequest,
  mapObservation,
  mapPatient,
  operationOutcome,
  type FhirResource,
} from "@/lib/interop/fhir/resources";
import { validateResource } from "@/lib/interop/fhir/validate";

const FHIR_JSON = { "content-type": "application/fhir+json" };

const STAFF_ROLES = new Set([
  "admin", "doctor", "nurse", "pharmacist", "lab_tech",
  "radiologist", "physio", "nutritionist", "admissions_officer",
]);

interface Actor {
  userId: string;
  roles: string[];
  isStaff: boolean;
  patientIds: string[];
}

function outcome(status: number, code: string, message: string) {
  return new Response(JSON.stringify(operationOutcome("error", code, message)), {
    status,
    headers: FHIR_JSON,
  });
}

function fhirJson(resource: FhirResource, status = 200) {
  return new Response(JSON.stringify(resource), { status, headers: FHIR_JSON });
}

async function authenticate(request: Request): Promise<Actor | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;

  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles" as never)
    .select("role")
    .eq("user_id", userId);
  const roles = ((roleRows as { role: string }[] | null) ?? []).map((r) => r.role);

  const { data: ownPatients } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("user_id", userId);

  return {
    userId,
    roles,
    isStaff: roles.some((r) => STAFF_ROLES.has(r)),
    patientIds: ((ownPatients as { id: string }[] | null) ?? []).map((p) => p.id),
  };
}

async function audit(entry: {
  actor: Actor | null;
  request: Request;
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  patientId: string | null;
  status: number;
  outcomeText: string;
  count: number | null;
  startedAt: number;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const u = new URL(entry.request.url);
    await supabaseAdmin.from("fhir_access_log" as never).insert({
      actor_id: entry.actor?.userId ?? null,
      actor_roles: entry.actor?.roles ?? null,
      method: entry.request.method,
      path: entry.path,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      patient_id: entry.patientId,
      query: u.search || null,
      status_code: entry.status,
      outcome: entry.outcomeText,
      record_count: entry.count,
      ip_address: entry.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: entry.request.headers.get("user-agent"),
      duration_ms: Date.now() - entry.startedAt,
    } as never);
  } catch {
    // Audit must never break the clinical response path; failures are silent
    // here but visible in server logs of the insert call itself.
  }
}

const CAPABILITY: FhirResource = {
  resourceType: "CapabilityStatement",
  status: "active",
  date: "2026-01-01",
  publisher: "Litu Vault",
  kind: "instance",
  fhirVersion: "4.0.1",
  format: ["application/fhir+json"],
  rest: [
    {
      mode: "server",
      security: { service: [{ text: "Bearer token (OAuth2 / Litu Vault session)" }] },
      resource: [
        { type: "Patient", interaction: [{ code: "read" }, { code: "search-type" }], searchParam: [{ name: "identifier", type: "token" }, { name: "name", type: "string" }] },
        { type: "Encounter", interaction: [{ code: "read" }, { code: "search-type" }], searchParam: [{ name: "patient", type: "reference" }] },
        { type: "Observation", interaction: [{ code: "search-type" }], searchParam: [{ name: "patient", type: "reference" }] },
        { type: "MedicationRequest", interaction: [{ code: "search-type" }], searchParam: [{ name: "patient", type: "reference" }] },
      ],
    },
  ],
};

async function handle(request: Request, splat: string): Promise<Response> {
  const startedAt = Date.now();
  const segments = splat.split("/").filter(Boolean);
  const url = new URL(request.url);
  const resourceType = segments[0] ?? null;
  const resourceId = segments[1] ?? null;
  const path = `/api/public/fhir/${splat}`;

  const finish = async (
    res: Response,
    info: { patientId?: string | null; count?: number | null; outcomeText: string },
    actor: Actor | null,
  ) => {
    await audit({
      actor,
      request,
      path,
      resourceType,
      resourceId,
      patientId: info.patientId ?? null,
      status: res.status,
      outcomeText: info.outcomeText,
      count: info.count ?? null,
      startedAt,
    });
    return res;
  };

  if (resourceType === "metadata") return fhirJson(CAPABILITY);

  const actor = await authenticate(request);
  if (!actor)
    return finish(outcome(401, "login", "A valid bearer token is required"), { outcomeText: "unauthenticated" }, null);

  const patientParam =
    url.searchParams.get("patient")?.replace(/^Patient\//, "") ??
    url.searchParams.get("subject")?.replace(/^Patient\//, "") ??
    null;

  const mayRead = (patientId: string | null) =>
    actor.isStaff || (patientId != null && actor.patientIds.includes(patientId));

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  try {
    /* ------------------------------------------------------------ Patient */
    if (resourceType === "Patient") {
      if (resourceId) {
        if (!mayRead(resourceId))
          return finish(outcome(403, "forbidden", "Not authorised for this patient"), { patientId: resourceId, outcomeText: "forbidden" }, actor);
        const { data } = await supabaseAdmin
          .from("patients")
          .select("id, full_name, medical_record_number, gender, date_of_birth, phone, email, address, id_number")
          .eq("id", resourceId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!data)
          return finish(outcome(404, "not-found", "Patient not found"), { patientId: resourceId, outcomeText: "not-found" }, actor);
        const resource = mapPatient({ ...data, national_id: data.id_number });
        const check = validateResource(resource);
        if (!check.valid)
          return finish(fhirJson(check.outcome!, 500), { patientId: resourceId, outcomeText: "invalid-resource" }, actor);
        return finish(fhirJson(resource), { patientId: resourceId, count: 1, outcomeText: "ok" }, actor);
      }

      let q = supabaseAdmin
        .from("patients")
        .select("id, full_name, medical_record_number, gender, date_of_birth, phone, email, address, id_number")
        .is("deleted_at", null)
        .limit(50);
      if (!actor.isStaff) {
        if (actor.patientIds.length === 0)
          return finish(fhirJson(bundle([], "searchset")), { count: 0, outcomeText: "ok" }, actor);
        q = q.in("id", actor.patientIds);
      }
      const identifier = url.searchParams.get("identifier");
      const name = url.searchParams.get("name");
      if (identifier) q = q.eq("medical_record_number", identifier.split("|").pop()!);
      if (name) q = q.ilike("full_name", `%${name}%`);
      const { data } = await q;
      const rows = data ?? [];
      const resources = rows.map((p) => mapPatient({ ...p, national_id: p.id_number }));
      return finish(fhirJson(bundle(resources, "searchset")), { count: resources.length, outcomeText: "ok" }, actor);
    }

    /* ---------------------------------------------------------- Encounter */
    if (resourceType === "Encounter") {
      const patientId = patientParam;
      if (!resourceId && !patientId)
        return finish(outcome(400, "required", "patient search parameter is required"), { outcomeText: "bad-request" }, actor);

      let q = supabaseAdmin
        .from("visits")
        .select("id, patient_id, status, created_at, closed_at, reason, assigned_doctor_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (resourceId) q = q.eq("id", resourceId);
      if (patientId) q = q.eq("patient_id", patientId);
      const { data } = await q;
      const rows = (data ?? []) as Record<string, unknown>[];
      const subject = (rows[0]?.["patient_id"] as string | undefined) ?? patientId;
      if (!mayRead(subject ?? null))
        return finish(outcome(403, "forbidden", "Not authorised for this patient"), { patientId: subject ?? null, outcomeText: "forbidden" }, actor);

      const resources = rows.map((v) =>
        mapEncounter({
          id: v["id"] as string,
          patient_id: v["patient_id"] as string,
          encounter_type: (v["encounter_type"] as string | null) ?? "outpatient",
          status: v["status"] as string | null,
          created_at: v["created_at"] as string,
          ended_at: v["closed_at"] as string | null,
          reason: v["reason"] as string | null,
          attending_id: v["assigned_doctor_id"] as string | null,
        }),
      );
      if (resourceId && resources[0])
        return finish(fhirJson(resources[0]), { patientId: subject ?? null, count: 1, outcomeText: "ok" }, actor);
      return finish(fhirJson(bundle(resources, "searchset")), { patientId: subject ?? null, count: resources.length, outcomeText: "ok" }, actor);
    }

    /* -------------------------------------------------------- Observation */
    if (resourceType === "Observation") {
      if (!patientParam)
        return finish(outcome(400, "required", "patient search parameter is required"), { outcomeText: "bad-request" }, actor);
      if (!mayRead(patientParam))
        return finish(outcome(403, "forbidden", "Not authorised for this patient"), { patientId: patientParam, outcomeText: "forbidden" }, actor);

      const { data: orders } = await supabaseAdmin
        .from("lab_orders")
        .select("id, test_id, encounter_id")
        .eq("patient_id", patientParam)
        .limit(200);
      const orderRows = (orders ?? []) as { id: string; test_id: string; encounter_id: string | null }[];
      if (orderRows.length === 0)
        return finish(fhirJson(bundle([], "searchset")), { patientId: patientParam, count: 0, outcomeText: "ok" }, actor);

      const { data: catalog } = await supabaseAdmin
        .from("lab_tests_catalog")
        .select("id, name")
        .in("id", orderRows.map((o) => o.test_id));
      const testName = new Map(((catalog ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));

      const { data: values } = await supabaseAdmin
        .from("lab_result_values")
        .select("id, order_id, parameter_name, value_text, units, reference_range, abnormal_flag, performed_at, performed_by")
        .in("order_id", orderRows.map((o) => o.id))
        .order("performed_at", { ascending: false })
        .limit(500);

      const orderById = new Map(orderRows.map((o) => [o.id, o]));
      const resources = ((values ?? []) as Record<string, unknown>[]).map((v) => {
        const order = orderById.get(v["order_id"] as string);
        return mapObservation({
          id: v["id"] as string,
          patient_id: patientParam,
          encounter_id: order?.encounter_id ?? null,
          test_name: (order && testName.get(order.test_id)) ?? "Laboratory test",
          parameter_name: v["parameter_name"] as string,
          value_text: (v["value_text"] as string | null) ?? null,
          units: v["units"] as string | null,
          reference_range: v["reference_range"] as string | null,
          abnormal_flag: v["abnormal_flag"] as string | null,
          performed_at: v["performed_at"] as string | null,
          performer_id: v["performed_by"] as string | null,
          status: "final",
        });
      });
      return finish(fhirJson(bundle(resources, "searchset")), { patientId: patientParam, count: resources.length, outcomeText: "ok" }, actor);
    }

    /* --------------------------------------------------- MedicationRequest */
    if (resourceType === "MedicationRequest") {
      if (!patientParam)
        return finish(outcome(400, "required", "patient search parameter is required"), { outcomeText: "bad-request" }, actor);
      if (!mayRead(patientParam))
        return finish(outcome(403, "forbidden", "Not authorised for this patient"), { patientId: patientParam, outcomeText: "forbidden" }, actor);

      const { data: visits } = await supabaseAdmin
        .from("visits")
        .select("id")
        .eq("patient_id", patientParam)
        .limit(200);
      const visitIds = ((visits ?? []) as { id: string }[]).map((v) => v.id);

      const resources: FhirResource[] = [];

      if (visitIds.length > 0) {
        const { data: rx } = await supabaseAdmin
          .from("prescriptions")
          .select("id, visit_id, encounter_id, medication, dose, frequency, duration, instructions, created_at, created_by")
          .in("visit_id", visitIds)
          .order("created_at", { ascending: false })
          .limit(300);
        for (const r of ((rx ?? []) as Record<string, unknown>[])) {
          resources.push(
            mapMedicationRequest({
              id: r["id"] as string,
              patient_id: patientParam,
              encounter_id: (r["encounter_id"] as string | null) ?? (r["visit_id"] as string),
              medication: r["medication"] as string,
              dose: r["dose"] as string | null,
              frequency: r["frequency"] as string | null,
              duration: r["duration"] as string | null,
              instructions: r["instructions"] as string | null,
              created_at: r["created_at"] as string,
              prescriber_id: r["created_by"] as string | null,
              status: "active",
            }),
          );
        }
      }

      // Chronic care orders (may not exist before the chronic-care migration runs).
      const { data: chronic } = await supabaseAdmin
        .from("chronic_medications" as never)
        .select("*")
        .eq("patient_id", patientParam)
        .limit(200);
      for (const c of ((chronic ?? []) as Record<string, unknown>[])) {
        resources.push(
          mapMedicationRequest({
            id: c["id"] as string,
            patient_id: patientParam,
            encounter_id: c["encounter_id"] as string | null,
            medication: c["medication"] as string,
            dose: c["dose"] as string | null,
            route: c["route"] as string | null,
            frequency: c["frequency"] as string | null,
            quantity: c["quantity"] as number | null,
            status: c["status"] as string | null,
            created_at: c["created_at"] as string | null,
            prescriber_id: c["prescriber_id"] as string | null,
            expected_completion: c["expected_completion"] as string | null,
          }),
        );
      }

      return finish(fhirJson(bundle(resources, "searchset")), { patientId: patientParam, count: resources.length, outcomeText: "ok" }, actor);
    }

    return finish(
      outcome(404, "not-supported", `Resource type "${resourceType ?? ""}" is not supported`),
      { outcomeText: "not-supported" },
      actor,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected server error";
    return finish(outcome(500, "exception", message), { outcomeText: "exception" }, actor);
  }
}

export const Route = createFileRoute("/api/public/fhir/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, (params as { _splat?: string })._splat ?? ""),
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "authorization, content-type",
          },
        }),
    },
  },
});
