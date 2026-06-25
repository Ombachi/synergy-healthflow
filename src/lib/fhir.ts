// Lightweight FHIR R4 mapping helpers. Generates downloadable resources/bundles
// for Patients, Lab Observations, and Insurance Claims so the system can integrate
// with external EMRs (DHIS2, OpenMRS, payer portals) using a world-standard format.

export type FhirResource = Record<string, unknown>;

export interface FhirPatientInput {
  id: string;
  full_name: string;
  mrn?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export function toFhirPatient(p: FhirPatientInput): FhirResource {
  const [given, ...family] = (p.full_name ?? "").trim().split(/\s+/);
  return {
    resourceType: "Patient",
    id: p.id,
    identifier: p.mrn ? [{ system: "urn:vitalis:mrn", value: p.mrn }] : [],
    name: [{ use: "official", family: family.join(" ") || given, given: [given] }],
    gender: (p.gender ?? "unknown").toLowerCase(),
    birthDate: p.date_of_birth ?? undefined,
    telecom: [
      p.phone ? { system: "phone", value: p.phone } : null,
      p.email ? { system: "email", value: p.email } : null,
    ].filter(Boolean),
    address: p.address ? [{ text: p.address }] : [],
  };
}

export interface FhirObservationParam {
  parameter_name: string;
  value_text: string | null;
  units: string | null;
  reference_range: string | null;
  abnormal_flag: string | null;
}

export function toFhirObservation(
  orderId: string,
  patientId: string,
  testName: string,
  performedAt: string | null,
  p: FhirObservationParam
): FhirResource {
  const numeric = p.value_text && !Number.isNaN(parseFloat(p.value_text)) ? parseFloat(p.value_text) : null;
  const interp = (() => {
    switch ((p.abnormal_flag ?? "").toLowerCase()) {
      case "high": return { code: "H", display: "High" };
      case "low": return { code: "L", display: "Low" };
      case "critical high": return { code: "HH", display: "Critical high" };
      case "critical low": return { code: "LL", display: "Critical low" };
      case "normal": return { code: "N", display: "Normal" };
      default: return null;
    }
  })();
  return {
    resourceType: "Observation",
    id: `${orderId}-${p.parameter_name.replace(/\W+/g, "_")}`,
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
    code: { text: `${testName} — ${p.parameter_name}` },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: performedAt ?? undefined,
    valueQuantity: numeric != null ? { value: numeric, unit: p.units ?? undefined } : undefined,
    valueString: numeric == null ? (p.value_text ?? undefined) : undefined,
    referenceRange: p.reference_range ? [{ text: p.reference_range }] : undefined,
    interpretation: interp ? [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", ...interp }] }] : undefined,
  };
}

export interface FhirClaimLine { description: string; billed_cents: number; approved_cents: number | null }
export interface FhirClaimInput {
  id: string;
  patient_id: string;
  insurer?: string | null;
  member_number?: string | null;
  preauth_code?: string | null;
  status: string;
  created_at: string;
  total_cents: number;
  approved_cents?: number | null;
  lines: FhirClaimLine[];
}

export function toFhirClaim(c: FhirClaimInput): FhirResource {
  return {
    resourceType: "Claim",
    id: c.id,
    status: c.status === "rejected" ? "cancelled" : c.status === "approved" || c.status === "paid" ? "active" : "draft",
    type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: "professional" }] },
    use: "claim",
    patient: { reference: `Patient/${c.patient_id}` },
    created: c.created_at,
    insurer: c.insurer ? { display: c.insurer } : undefined,
    priority: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/processpriority", code: "normal" }] },
    insurance: c.member_number ? [{ sequence: 1, focal: true, identifier: { value: c.member_number } }] : [],
    preAuthRef: c.preauth_code ? [c.preauth_code] : undefined,
    item: c.lines.map((l, i) => ({
      sequence: i + 1,
      productOrService: { text: l.description },
      unitPrice: { value: l.billed_cents / 100, currency: "KES" },
      net: { value: l.billed_cents / 100, currency: "KES" },
    })),
    total: { value: c.total_cents / 100, currency: "KES" },
  };
}

export function fhirBundle(entries: FhirResource[]): FhirResource {
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: entries.map((r) => ({ resource: r, fullUrl: `urn:uuid:${(r as { id?: string }).id ?? crypto.randomUUID()}` })),
  };
}

export function downloadFhir(filename: string, resource: FhirResource) {
  const blob = new Blob([JSON.stringify(resource, null, 2)], { type: "application/fhir+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
