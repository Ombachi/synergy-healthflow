// Validates FHIR Coding values against the canonical system URIs and the
// code formats those systems define. Structural checks only — no network.
import { SYSTEM_URI, type CodingSystem, type FhirCoding } from "./index";

const URI_TO_SYSTEM = new Map<string, CodingSystem>(
  (Object.entries(SYSTEM_URI) as [CodingSystem, string][]).map(([k, v]) => [v, k]),
);

const CODE_PATTERN: Partial<Record<CodingSystem, RegExp>> = {
  "ICD-10": /^[A-TV-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/,
  "ICD-11": /^(X?[0-9A-HJ-NP-Z]{2}[0-9A-HJ-NP-Z]{2}(\.[0-9A-HJ-NP-Z]{1,2})?|X[A-Z0-9]{3,})([&/].+)?$/,
  "SNOMED-CT": /^[1-9][0-9]{5,17}$/,
  LOINC: /^[0-9]{1,7}-[0-9]$/,
  RXNORM: /^[0-9]{1,10}$/,
  ATC: /^[A-Z]([0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?)?$/,
  GS1: /^[0-9]{8,14}$/,
  UCUM: /^[\x21-\x7e]+$/,
};

export interface CodingIssue {
  severity: "error" | "warning";
  message: string;
}

export function systemFromUri(uri: string): CodingSystem | null {
  return URI_TO_SYSTEM.get(uri) ?? null;
}

export function validateCoding(c: Partial<FhirCoding>): CodingIssue[] {
  const issues: CodingIssue[] = [];
  if (!c.system) issues.push({ severity: "error", message: "Coding.system is required" });
  if (!c.code) issues.push({ severity: "error", message: "Coding.code is required" });
  if (!c.system || !c.code) return issues;
  const sys = systemFromUri(c.system);
  if (!sys) {
    issues.push({ severity: "warning", message: `Unrecognised code system URI: ${c.system}` });
    return issues;
  }
  const re = CODE_PATTERN[sys];
  if (re && !re.test(c.code)) issues.push({ severity: "error", message: `"${c.code}" is not a valid ${sys} code` });
  if (!c.display?.trim()) issues.push({ severity: "warning", message: `${sys} code ${c.code} has no display text` });
  if (c.display && /<[^>]+>/.test(c.display)) issues.push({ severity: "error", message: "Display text contains markup" });
  return issues;
}

export function isValidCoding(c: Partial<FhirCoding>): boolean {
  return validateCoding(c).every((i) => i.severity !== "error");
}

/** Validate every coding inside a CodeableConcept. */
export function validateCodeableConcept(cc: { coding?: Partial<FhirCoding>[]; text?: string } | null | undefined): CodingIssue[] {
  if (!cc) return [{ severity: "error", message: "CodeableConcept is missing" }];
  if (!cc.coding?.length && !cc.text) return [{ severity: "error", message: "CodeableConcept needs a coding or text" }];
  return (cc.coding ?? []).flatMap(validateCoding);
}
