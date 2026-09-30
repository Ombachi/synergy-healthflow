// Builds an International Patient Summary (IPS) FHIR R4 document Bundle.
// Pure function: callers load already-mapped resources, this assembles the
// Composition with the IPS-required LOINC sections and returns the Bundle.
import type { FhirResource } from "@/lib/interop/fhir/resources";

const LOINC = "http://loinc.org";

interface IpsInput {
  patient: FhirResource;
  author?: { reference?: string; display: string };
  conditions?: FhirResource[];
  medications?: FhirResource[];
  allergies?: FhirResource[];
  immunizations?: FhirResource[];
  observations?: FhirResource[];
  procedures?: FhirResource[];
  encounters?: FhirResource[];
}

const SECTIONS: { key: keyof IpsInput; code: string; title: string; required: boolean }[] = [
  { key: "conditions", code: "11450-4", title: "Problem list", required: true },
  { key: "medications", code: "10160-0", title: "Medication summary", required: true },
  { key: "allergies", code: "48765-2", title: "Allergies and intolerances", required: true },
  { key: "immunizations", code: "11369-6", title: "History of immunizations", required: false },
  { key: "observations", code: "30954-2", title: "Results", required: false },
  { key: "procedures", code: "47519-4", title: "History of procedures", required: false },
  { key: "encounters", code: "46240-8", title: "History of encounters", required: false },
];

const ref = (r: FhirResource) => `${r["resourceType"] as string}/${r["id"] as string}`;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export function buildIpsBundle(input: IpsInput): FhirResource {
  const now = new Date().toISOString();
  const all: FhirResource[] = [input.patient];
  const section = SECTIONS.flatMap((s) => {
    const items = (input[s.key] as FhirResource[] | undefined) ?? [];
    if (!items.length && !s.required) return [];
    all.push(...items);
    return [{
      title: s.title,
      code: { coding: [{ system: LOINC, code: s.code, display: s.title }] },
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml">${items.length ? `${items.length} entr${items.length === 1 ? "y" : "ies"}` : esc("No information available")}</div>`,
      },
      ...(items.length
        ? { entry: items.map((i) => ({ reference: ref(i) })) }
        : { emptyReason: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/list-empty-reason", code: "unavailable" }] } }),
    }];
  });

  const compositionId = crypto.randomUUID();
  const composition: FhirResource = {
    resourceType: "Composition",
    id: compositionId,
    meta: { profile: ["http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips"] },
    status: "final",
    type: { coding: [{ system: LOINC, code: "60591-5", display: "Patient summary Document" }] },
    subject: { reference: ref(input.patient) },
    date: now,
    author: [input.author ?? { display: "Litu Vault" }],
    title: "International Patient Summary",
    confidentiality: "N",
    section,
  };

  return {
    resourceType: "Bundle",
    id: crypto.randomUUID(),
    meta: { profile: ["http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"] },
    identifier: { system: "urn:ietf:rfc:3986", value: `urn:uuid:${crypto.randomUUID()}` },
    type: "document",
    timestamp: now,
    entry: [composition, ...all].map((r) => ({ fullUrl: `urn:uuid:${r["id"] as string}`, resource: r })),
  };
}
