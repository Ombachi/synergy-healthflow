// FHIR R4 resource mapping layer.
// Vitalis/Litu Vault internal records -> FHIR resources. Internal IDs are kept
// as the resource id, with business identifiers (MRN, order no.) exposed as
// FHIR identifiers. Nothing here touches the database directly.

import {
  SYSTEM_URI,
  lookupLoinc,
  resolveConditionCodings,
  toCoding,
  toUcum,
} from "@/lib/terminology";

export type FhirResource = Record<string, unknown>;

const BASE = "urn:litu";
const ref = (type: string, id: string | null | undefined) =>
  id ? { reference: `${type}/${id}` } : undefined;

const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

/* ------------------------------------------------------------------ Patient */

export interface PatientRow {
  id: string;
  full_name: string;
  medical_record_number?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  national_id?: string | null;
  deceased?: boolean | null;
}

export function mapPatient(p: PatientRow): FhirResource {
  const parts = (p.full_name ?? "").trim().split(/\s+/);
  const given = parts.slice(0, -1);
  const family = parts.length > 1 ? parts[parts.length - 1]! : parts[0] ?? "";
  return clean({
    resourceType: "Patient",
    id: p.id,
    identifier: [
      p.medical_record_number
        ? { use: "usual", system: `${BASE}:mrn`, value: p.medical_record_number }
        : null,
      p.national_id ? { use: "official", system: `${BASE}:national-id`, value: p.national_id } : null,
    ].filter(Boolean),
    active: true,
    name: [{ use: "official", family, given: given.length ? given : [family] }],
    gender: (p.gender ?? "unknown").toLowerCase(),
    birthDate: p.date_of_birth ?? undefined,
    deceasedBoolean: p.deceased ?? undefined,
    telecom: [
      p.phone ? { system: "phone", value: p.phone, use: "mobile" } : null,
      p.email ? { system: "email", value: p.email } : null,
    ].filter(Boolean),
    address: p.address ? [{ text: p.address }] : undefined,
  });
}

/* ------------------------------------------------------------- Practitioner */

export interface PractitionerRow {
  id: string;
  full_name: string | null;
  role?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function mapPractitioner(u: PractitionerRow): FhirResource {
  return clean({
    resourceType: "Practitioner",
    id: u.id,
    identifier: u.licence_number
      ? [{ system: `${BASE}:licence`, value: u.licence_number }]
      : undefined,
    name: [{ text: u.full_name ?? "Unknown" }],
    telecom: [
      u.phone ? { system: "phone", value: u.phone } : null,
      u.email ? { system: "email", value: u.email } : null,
    ].filter(Boolean),
  });
}

export function mapOrganization(o: {
  id: string;
  name: string;
  type?: string | null;
  phone?: string | null;
  address?: string | null;
}): FhirResource {
  return clean({
    resourceType: "Organization",
    id: o.id,
    active: true,
    name: o.name,
    type: o.type ? [{ text: o.type }] : undefined,
    telecom: o.phone ? [{ system: "phone", value: o.phone }] : undefined,
    address: o.address ? [{ text: o.address }] : undefined,
  });
}

/* ---------------------------------------------------------------- Encounter */

export interface EncounterRow {
  id: string;
  patient_id: string;
  encounter_type?: string | null; // outpatient | inpatient | emergency
  status?: string | null; // open | closed | cancelled
  created_at: string;
  ended_at?: string | null;
  reason?: string | null;
  attending_id?: string | null;
}

const ENCOUNTER_CLASS: Record<string, { code: string; display: string }> = {
  outpatient: { code: "AMB", display: "ambulatory" },
  inpatient: { code: "IMP", display: "inpatient encounter" },
  emergency: { code: "EMER", display: "emergency" },
};

export function mapEncounter(e: EncounterRow): FhirResource {
  const cls = ENCOUNTER_CLASS[(e.encounter_type ?? "outpatient").toLowerCase()] ?? ENCOUNTER_CLASS["outpatient"]!;
  const status =
    e.status === "closed" || e.status === "completed"
      ? "finished"
      : e.status === "cancelled"
        ? "cancelled"
        : "in-progress";
  return clean({
    resourceType: "Encounter",
    id: e.id,
    status,
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", ...cls },
    subject: ref("Patient", e.patient_id),
    period: clean({ start: e.created_at, end: e.ended_at ?? undefined }),
    reasonCode: e.reason ? [{ text: e.reason }] : undefined,
    participant: e.attending_id
      ? [{ individual: ref("Practitioner", e.attending_id) }]
      : undefined,
  });
}

/* ---------------------------------------------------------------- Condition */

export function mapCondition(c: {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  name: string;
  icd_code?: string | null;
  clinical_status?: string | null;
  onset_date?: string | null;
  recorded_at?: string | null;
}): FhirResource {
  const codings = resolveConditionCodings(c.name).map(toCoding);
  if (c.icd_code && !codings.some((x) => x.code === c.icd_code))
    codings.unshift({ system: SYSTEM_URI["ICD-10"], code: c.icd_code, display: c.name });
  return clean({
    resourceType: "Condition",
    id: c.id,
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: (c.clinical_status ?? "active").toLowerCase(),
        },
      ],
    },
    code: { coding: codings, text: c.name },
    subject: ref("Patient", c.patient_id),
    encounter: ref("Encounter", c.encounter_id),
    onsetDateTime: c.onset_date ?? undefined,
    recordedDate: c.recorded_at ?? undefined,
  });
}

/* -------------------------------------------------------------- Observation */

export interface ObservationRow {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  test_name: string;
  parameter_name: string;
  value_text: string | null;
  units?: string | null;
  reference_range?: string | null;
  abnormal_flag?: string | null;
  performed_at?: string | null;
  performer_id?: string | null;
  status?: string | null;
}

const INTERPRETATION: Record<string, { code: string; display: string }> = {
  high: { code: "H", display: "High" },
  low: { code: "L", display: "Low" },
  "critical high": { code: "HH", display: "Critical high" },
  "critical low": { code: "LL", display: "Critical low" },
  normal: { code: "N", display: "Normal" },
  positive: { code: "POS", display: "Positive" },
  negative: { code: "NEG", display: "Negative" },
  reactive: { code: "POS", display: "Reactive" },
  "non reactive": { code: "NEG", display: "Non reactive" },
};

export function mapObservation(o: ObservationRow): FhirResource {
  const loinc = lookupLoinc(o.parameter_name) ?? lookupLoinc(o.test_name);
  const numeric =
    o.value_text && !Number.isNaN(parseFloat(o.value_text)) ? parseFloat(o.value_text) : null;
  const interp = INTERPRETATION[(o.abnormal_flag ?? "").toLowerCase()];
  return clean({
    resourceType: "Observation",
    id: o.id,
    status: o.status === "amended" ? "amended" : o.status === "preliminary" ? "preliminary" : "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "laboratory",
          },
        ],
      },
    ],
    code: {
      coding: loinc ? [toCoding(loinc)] : [],
      text: `${o.test_name} — ${o.parameter_name}`,
    },
    subject: ref("Patient", o.patient_id),
    encounter: ref("Encounter", o.encounter_id),
    effectiveDateTime: o.performed_at ?? undefined,
    performer: o.performer_id ? [ref("Practitioner", o.performer_id)] : undefined,
    valueQuantity:
      numeric != null
        ? clean({ value: numeric, unit: o.units ?? undefined, system: SYSTEM_URI.UCUM, code: toUcum(o.units) })
        : undefined,
    valueString: numeric == null ? (o.value_text ?? undefined) : undefined,
    referenceRange: o.reference_range ? [{ text: o.reference_range }] : undefined,
    interpretation: interp
      ? [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                ...interp,
              },
            ],
          },
        ]
      : undefined,
  });
}

/* --------------------------------------------------------- DiagnosticReport */

export function mapDiagnosticReport(r: {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  test_name: string;
  status?: string | null;
  issued_at?: string | null;
  conclusion?: string | null;
  performer_id?: string | null;
  category?: "LAB" | "RAD";
  observation_ids?: string[];
}): FhirResource {
  const loinc = lookupLoinc(r.test_name);
  return clean({
    resourceType: "DiagnosticReport",
    id: r.id,
    status: r.status === "amended" ? "amended" : r.status === "preliminary" ? "preliminary" : "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: r.category ?? "LAB",
          },
        ],
      },
    ],
    code: { coding: loinc ? [toCoding(loinc)] : [], text: r.test_name },
    subject: ref("Patient", r.patient_id),
    encounter: ref("Encounter", r.encounter_id),
    issued: r.issued_at ?? undefined,
    performer: r.performer_id ? [ref("Practitioner", r.performer_id)] : undefined,
    result: (r.observation_ids ?? []).map((id) => ref("Observation", id)),
    conclusion: r.conclusion ?? undefined,
  });
}

/* ------------------------------------------------------------ ServiceRequest */

export function mapServiceRequest(s: {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  name: string;
  intent?: string | null;
  status?: string | null;
  priority?: string | null;
  requested_at?: string | null;
  requester_id?: string | null;
  category?: "laboratory" | "imaging" | "procedure" | "referral";
  note?: string | null;
}): FhirResource {
  const loinc = s.category === "laboratory" ? lookupLoinc(s.name) : null;
  const statusMap: Record<string, string> = {
    ordered: "active",
    pending: "active",
    in_progress: "active",
    completed: "completed",
    cancelled: "revoked",
  };
  return clean({
    resourceType: "ServiceRequest",
    id: s.id,
    status: statusMap[(s.status ?? "ordered").toLowerCase()] ?? "active",
    intent: s.intent ?? "order",
    priority: (s.priority ?? "routine").toLowerCase(),
    category: s.category ? [{ text: s.category }] : undefined,
    code: { coding: loinc ? [toCoding(loinc)] : [], text: s.name },
    subject: ref("Patient", s.patient_id),
    encounter: ref("Encounter", s.encounter_id),
    authoredOn: s.requested_at ?? undefined,
    requester: ref("Practitioner", s.requester_id),
    note: s.note ? [{ text: s.note }] : undefined,
  });
}

/* ---------------------------------------------------------- MedicationRequest */

export function mapMedicationRequest(m: {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  medication: string;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: number | null;
  instructions?: string | null;
  status?: string | null;
  created_at?: string | null;
  prescriber_id?: string | null;
  expected_completion?: string | null;
}): FhirResource {
  const statusMap: Record<string, string> = {
    active: "active",
    pending: "active",
    dispensed: "completed",
    completed: "completed",
    cancelled: "cancelled",
    stopped: "stopped",
    "on-hold": "on-hold",
    "needs-review": "on-hold",
  };
  return clean({
    resourceType: "MedicationRequest",
    id: m.id,
    status: statusMap[(m.status ?? "active").toLowerCase()] ?? "active",
    intent: "order",
    medicationCodeableConcept: { text: m.medication },
    subject: ref("Patient", m.patient_id),
    encounter: ref("Encounter", m.encounter_id),
    authoredOn: m.created_at ?? undefined,
    requester: ref("Practitioner", m.prescriber_id),
    dosageInstruction: [
      clean({
        text: [m.dose, m.frequency, m.duration, m.instructions].filter(Boolean).join(" · ") || undefined,
        route: m.route ? { text: m.route } : undefined,
        timing: m.frequency ? { code: { text: m.frequency } } : undefined,
      }),
    ],
    dispenseRequest: clean({
      quantity: m.quantity != null ? { value: m.quantity } : undefined,
      validityPeriod: m.expected_completion
        ? { start: m.created_at ?? undefined, end: m.expected_completion }
        : undefined,
    }),
  });
}

/* --------------------------------------------------------- MedicationDispense */

export function mapMedicationDispense(d: {
  id: string;
  patient_id: string;
  prescription_id?: string | null;
  medication: string;
  quantity?: number | null;
  units?: string | null;
  dispensed_at?: string | null;
  dispenser_id?: string | null;
  status?: string | null;
  batch_number?: string | null;
}): FhirResource {
  return clean({
    resourceType: "MedicationDispense",
    id: d.id,
    status: d.status === "cancelled" ? "cancelled" : "completed",
    medicationCodeableConcept: { text: d.medication },
    subject: ref("Patient", d.patient_id),
    authorizingPrescription: d.prescription_id
      ? [ref("MedicationRequest", d.prescription_id)]
      : undefined,
    quantity:
      d.quantity != null
        ? clean({ value: d.quantity, unit: d.units ?? undefined, code: toUcum(d.units) })
        : undefined,
    whenHandedOver: d.dispensed_at ?? undefined,
    performer: d.dispenser_id ? [{ actor: ref("Practitioner", d.dispenser_id) }] : undefined,
    identifier: d.batch_number ? [{ system: `${BASE}:batch`, value: d.batch_number }] : undefined,
  });
}

/* -------------------------------------------------------- AllergyIntolerance */

export function mapAllergyIntolerance(a: {
  id: string;
  patient_id: string;
  substance: string;
  criticality?: string | null;
  reaction?: string | null;
  recorded_at?: string | null;
}): FhirResource {
  return clean({
    resourceType: "AllergyIntolerance",
    id: a.id,
    clinicalStatus: {
      coding: [
        { system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" },
      ],
    },
    code: { text: a.substance },
    patient: ref("Patient", a.patient_id),
    criticality: (a.criticality ?? "unable-to-assess").toLowerCase(),
    recordedDate: a.recorded_at ?? undefined,
    reaction: a.reaction ? [{ manifestation: [{ text: a.reaction }] }] : undefined,
  });
}

/* ---------------------------------------------------------------- Procedure */

export function mapProcedure(p: {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  name: string;
  status?: string | null;
  performed_at?: string | null;
  performer_id?: string | null;
  outcome?: string | null;
}): FhirResource {
  return clean({
    resourceType: "Procedure",
    id: p.id,
    status: p.status === "cancelled" ? "not-done" : p.status === "completed" ? "completed" : "in-progress",
    code: { text: p.name },
    subject: ref("Patient", p.patient_id),
    encounter: ref("Encounter", p.encounter_id),
    performedDateTime: p.performed_at ?? undefined,
    performer: p.performer_id ? [{ actor: ref("Practitioner", p.performer_id) }] : undefined,
    outcome: p.outcome ? { text: p.outcome } : undefined,
  });
}

/* ------------------------------------------------------------- Immunization */

export function mapImmunization(i: {
  id: string;
  patient_id: string;
  vaccine: string;
  dose_number?: number | null;
  administered_at?: string | null;
  lot_number?: string | null;
  site?: string | null;
  route?: string | null;
  administered_by?: string | null;
  status?: string | null;
}): FhirResource {
  return clean({
    resourceType: "Immunization",
    id: i.id,
    status: i.status === "not-done" ? "not-done" : "completed",
    vaccineCode: { text: i.vaccine },
    patient: ref("Patient", i.patient_id),
    occurrenceDateTime: i.administered_at ?? undefined,
    lotNumber: i.lot_number ?? undefined,
    site: i.site ? { text: i.site } : undefined,
    route: i.route ? { text: i.route } : undefined,
    performer: i.administered_by
      ? [{ actor: ref("Practitioner", i.administered_by) }]
      : undefined,
    protocolApplied: i.dose_number != null ? [{ doseNumberPositiveInt: i.dose_number }] : undefined,
  });
}

/* ----------------------------------------------------------------- CarePlan */

export function mapCarePlan(c: {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
  activities?: string[];
}): FhirResource {
  return clean({
    resourceType: "CarePlan",
    id: c.id,
    status: c.status === "completed" ? "completed" : c.status === "cancelled" ? "revoked" : "active",
    intent: "plan",
    title: c.title,
    description: c.description ?? undefined,
    subject: ref("Patient", c.patient_id),
    encounter: ref("Encounter", c.encounter_id),
    created: c.created_at ?? undefined,
    activity: (c.activities ?? []).map((a) => ({ detail: { status: "in-progress", description: a } })),
  });
}

/* -------------------------------------------------------- DocumentReference */

export function mapDocumentReference(d: {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  title: string;
  content_type?: string | null;
  url?: string | null;
  created_at?: string | null;
  author_id?: string | null;
  category?: string | null;
}): FhirResource {
  return clean({
    resourceType: "DocumentReference",
    id: d.id,
    status: "current",
    type: { text: d.title },
    category: d.category ? [{ text: d.category }] : undefined,
    subject: ref("Patient", d.patient_id),
    date: d.created_at ?? undefined,
    author: d.author_id ? [ref("Practitioner", d.author_id)] : undefined,
    context: d.encounter_id ? { encounter: [ref("Encounter", d.encounter_id)] } : undefined,
    content: [
      { attachment: clean({ contentType: d.content_type ?? "application/pdf", url: d.url ?? undefined, title: d.title }) },
    ],
  });
}

/* ------------------------------------------------------------------ Invoice */

export function mapInvoice(inv: {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  currency?: string;
  total_cents: number;
  lines?: { description: string; amount_cents: number; quantity?: number }[];
}): FhirResource {
  const cur = inv.currency ?? "KES";
  const statusMap: Record<string, string> = {
    draft: "draft",
    issued: "issued",
    paid: "balanced",
    partially_paid: "issued",
    cancelled: "cancelled",
  };
  return clean({
    resourceType: "Invoice",
    id: inv.id,
    status: statusMap[(inv.status ?? "issued").toLowerCase()] ?? "issued",
    subject: ref("Patient", inv.patient_id),
    date: inv.created_at ?? undefined,
    lineItem: (inv.lines ?? []).map((l, i) => ({
      sequence: i + 1,
      chargeItemCodeableConcept: { text: l.description },
      priceComponent: [
        { type: "base", amount: { value: l.amount_cents / 100, currency: cur }, factor: l.quantity ?? 1 },
      ],
    })),
    totalGross: { value: inv.total_cents / 100, currency: cur },
  });
}

/* ------------------------------------------------- PaymentReconciliation */

export function mapPaymentReconciliation(p: {
  id: string;
  invoice_id: string;
  amount_cents: number;
  currency?: string;
  paid_at?: string | null;
  method?: string | null;
  reference?: string | null;
  status?: string | null;
}): FhirResource {
  const cur = p.currency ?? "KES";
  return clean({
    resourceType: "PaymentReconciliation",
    id: p.id,
    status: p.status === "cancelled" ? "cancelled" : "active",
    created: p.paid_at ?? undefined,
    paymentDate: p.paid_at ? p.paid_at.slice(0, 10) : undefined,
    paymentAmount: { value: p.amount_cents / 100, currency: cur },
    paymentIdentifier: p.reference ? { system: `${BASE}:payment`, value: p.reference } : undefined,
    detail: [
      clean({
        type: { text: p.method ?? "payment" },
        request: ref("Invoice", p.invoice_id),
        amount: { value: p.amount_cents / 100, currency: cur },
      }),
    ],
  });
}

/* ------------------------------------------------------------------ Bundles */

export function bundle(
  entries: FhirResource[],
  type: "collection" | "searchset" | "transaction" = "collection",
): FhirResource {
  return {
    resourceType: "Bundle",
    type,
    timestamp: new Date().toISOString(),
    total: entries.length,
    entry: entries.map((r) => ({
      fullUrl: `${BASE}:${(r as { resourceType?: string }).resourceType}/${(r as { id?: string }).id ?? ""}`,
      resource: r,
    })),
  };
}

export function operationOutcome(
  severity: "error" | "warning" | "information",
  code: string,
  diagnostics: string,
): FhirResource {
  return {
    resourceType: "OperationOutcome",
    issue: [{ severity, code, diagnostics }],
  };
}
