// Minimal structural FHIR R4 validation + (de)serialization helpers.
// Validation is intentionally conservative: it enforces the invariants the
// interoperability layer depends on (resourceType, id, required references,
// status vocabularies) and reports issues as an OperationOutcome.

import { operationOutcome, type FhirResource } from "./resources";

export interface ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  outcome?: FhirResource;
}

type Rule = { required: string[]; status?: string[] };

const RULES: Record<string, Rule> = {
  Patient: { required: ["id", "name"] },
  Practitioner: { required: ["id", "name"] },
  Organization: { required: ["id", "name"] },
  Encounter: {
    required: ["id", "status", "class", "subject"],
    status: ["planned", "arrived", "in-progress", "onleave", "finished", "cancelled"],
  },
  Condition: { required: ["id", "code", "subject"] },
  Observation: {
    required: ["id", "status", "code", "subject"],
    status: ["registered", "preliminary", "final", "amended", "corrected", "entered-in-error"],
  },
  DiagnosticReport: {
    required: ["id", "status", "code", "subject"],
    status: ["registered", "partial", "preliminary", "final", "amended", "corrected"],
  },
  ServiceRequest: {
    required: ["id", "status", "intent", "subject"],
    status: ["draft", "active", "on-hold", "revoked", "completed", "entered-in-error", "unknown"],
  },
  MedicationRequest: {
    required: ["id", "status", "intent", "subject"],
    status: ["active", "on-hold", "cancelled", "completed", "entered-in-error", "stopped", "draft", "unknown"],
  },
  MedicationDispense: {
    required: ["id", "status", "subject"],
    status: ["preparation", "in-progress", "cancelled", "on-hold", "completed", "entered-in-error", "declined"],
  },
  AllergyIntolerance: { required: ["id", "code", "patient"] },
  Procedure: {
    required: ["id", "status", "subject"],
    status: ["preparation", "in-progress", "not-done", "on-hold", "stopped", "completed", "unknown"],
  },
  Immunization: { required: ["id", "status", "vaccineCode", "patient"], status: ["completed", "entered-in-error", "not-done"] },
  CarePlan: { required: ["id", "status", "intent", "subject"], status: ["draft", "active", "on-hold", "revoked", "completed", "unknown"] },
  DocumentReference: { required: ["id", "status", "content"], status: ["current", "superseded", "entered-in-error"] },
  Invoice: { required: ["id", "status", "subject"], status: ["draft", "issued", "balanced", "cancelled", "entered-in-error"] },
  PaymentReconciliation: { required: ["id", "status"], status: ["active", "cancelled", "draft", "entered-in-error"] },
  Bundle: { required: ["type"] },
  OperationOutcome: { required: ["issue"] },
};

export function validateResource(resource: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!resource || typeof resource !== "object") {
    issues.push({ severity: "error", path: "$", message: "Resource must be a JSON object" });
    return fail(issues);
  }
  const r = resource as Record<string, unknown>;
  const type = r["resourceType"];
  if (typeof type !== "string") {
    issues.push({ severity: "error", path: "resourceType", message: "Missing resourceType" });
    return fail(issues);
  }
  const rule = RULES[type];
  if (!rule) {
    issues.push({ severity: "error", path: "resourceType", message: `Unsupported resource type "${type}"` });
    return fail(issues);
  }
  for (const field of rule.required) {
    const v = r[field];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) {
      issues.push({ severity: "error", path: `${type}.${field}`, message: `${field} is required` });
    }
  }
  if (rule.status && typeof r["status"] === "string" && !rule.status.includes(r["status"] as string)) {
    issues.push({
      severity: "error",
      path: `${type}.status`,
      message: `status "${r["status"]}" is not valid for ${type}`,
    });
  }
  for (const key of ["subject", "patient", "encounter"]) {
    const v = r[key] as { reference?: string } | undefined;
    if (v && typeof v === "object" && v.reference && !/^[A-Za-z]+\/.+/.test(v.reference)) {
      issues.push({ severity: "error", path: `${type}.${key}.reference`, message: "Reference must be Type/id" });
    }
  }
  return issues.some((i) => i.severity === "error") ? fail(issues) : { valid: true, issues };
}

function fail(issues: ValidationIssue[]): ValidationResult {
  return {
    valid: false,
    issues,
    outcome: {
      resourceType: "OperationOutcome",
      issue: issues.map((i) => ({
        severity: i.severity,
        code: "invalid",
        diagnostics: `${i.path}: ${i.message}`,
        expression: [i.path],
      })),
    },
  };
}

export function validateBundle(b: unknown): ValidationResult {
  const base = validateResource(b);
  if (!base.valid) return base;
  const entries = ((b as { entry?: { resource?: unknown }[] }).entry ?? []);
  const issues: ValidationIssue[] = [];
  entries.forEach((e, i) => {
    const res = validateResource(e.resource);
    res.issues.forEach((iss) => issues.push({ ...iss, path: `Bundle.entry[${i}].${iss.path}` }));
  });
  return issues.some((i) => i.severity === "error") ? fail(issues) : { valid: true, issues };
}

/** Canonical JSON serialization (stable key order) for hashing/audit. */
export function serialize(resource: FhirResource): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, sort(val)]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(resource));
}

export function deserialize(json: string): { resource?: FhirResource; error?: FhirResource } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { error: operationOutcome("error", "structure", `Invalid JSON: ${(e as Error).message}`) };
  }
  const result = validateResource(parsed);
  if (!result.valid) return { error: result.outcome };
  return { resource: parsed as FhirResource };
}
