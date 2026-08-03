import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DrugInteraction {
  id: string;
  drug_a: string;
  drug_b: string;
  severity: string;
  mechanism: string | null;
  advice: string | null;
}

export interface AllergyRule {
  id: string;
  allergen: string;
  drug_pattern: string;
  severity: string;
  note: string | null;
}

export type SafetySeverity = "major" | "moderate" | "minor";

export interface SafetyWarning {
  kind: "allergy" | "interaction";
  severity: SafetySeverity;
  title: string;
  detail: string;
  advice?: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

function contains(haystack: string, needle: string) {
  return norm(haystack).includes(norm(needle).trim());
}

/** Loads the safety libraries once and caches them for the session. */
export function useSafetyLibrary() {
  return useQuery({
    queryKey: ["rx-safety-library"],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const [ix, al] = await Promise.all([
        supabase.from("drug_interactions" as never).select("*"),
        supabase.from("drug_allergy_rules" as never).select("*"),
      ]);
      return {
        interactions: (ix.data as unknown as DrugInteraction[]) ?? [],
        allergyRules: (al.data as unknown as AllergyRule[]) ?? [],
      };
    },
  });
}

/** Splits a free-text allergy field into individual allergen terms. */
export function parseAllergies(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,;/\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !/^(nkda|none|nil|no known)/i.test(t));
}

function sev(raw: string): SafetySeverity {
  const s = raw.toLowerCase();
  if (s === "major" || s === "high" || s === "severe") return "major";
  if (s === "minor" || s === "low") return "minor";
  return "moderate";
}

/**
 * Screens a candidate medication against the patient's documented allergies
 * and their currently active medications.
 */
export function screenMedication(
  candidate: string,
  opts: {
    allergies: string[];
    currentMeds: string[];
    interactions: DrugInteraction[];
    allergyRules: AllergyRule[];
  },
): SafetyWarning[] {
  const out: SafetyWarning[] = [];
  if (!candidate) return out;

  // --- Allergy screening ------------------------------------------------
  const seenAllergy = new Set<string>();
  for (const allergy of opts.allergies) {
    // Direct name match (patient allergic to "amoxicillin", drug is amoxicillin)
    if (contains(candidate, allergy)) {
      const key = `direct:${allergy}`;
      if (!seenAllergy.has(key)) {
        seenAllergy.add(key);
        out.push({
          kind: "allergy",
          severity: "major",
          title: `Documented allergy: ${allergy}`,
          detail: `${candidate} matches the patient's recorded allergy to ${allergy}.`,
          advice: "Do not prescribe unless the allergy has been formally de-labelled.",
        });
      }
      continue;
    }
    for (const rule of opts.allergyRules) {
      if (!contains(allergy, rule.allergen)) continue;
      if (!contains(candidate, rule.drug_pattern)) continue;
      const key = `${rule.allergen}:${rule.drug_pattern}`;
      if (seenAllergy.has(key)) continue;
      seenAllergy.add(key);
      out.push({
        kind: "allergy",
        severity: sev(rule.severity),
        title: `Allergy risk: ${allergy} → ${candidate}`,
        detail: rule.note ?? `${candidate} is related to ${rule.allergen}.`,
        advice: "Confirm the reaction history before prescribing.",
      });
    }
  }

  // --- Interaction screening -------------------------------------------
  for (const med of opts.currentMeds) {
    if (!med) continue;
    for (const ix of opts.interactions) {
      const hit =
        (contains(candidate, ix.drug_a) && contains(med, ix.drug_b)) ||
        (contains(candidate, ix.drug_b) && contains(med, ix.drug_a));
      if (!hit) continue;
      out.push({
        kind: "interaction",
        severity: sev(ix.severity),
        title: `${ix.severity.toUpperCase()} interaction: ${candidate} + ${med}`,
        detail: ix.mechanism ?? "Known clinically significant interaction.",
        advice: ix.advice,
      });
    }
  }

  const order: Record<SafetySeverity, number> = { major: 0, moderate: 1, minor: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Screens a whole list of medications against each other. */
export function screenRegimen(
  meds: string[],
  interactions: DrugInteraction[],
): SafetyWarning[] {
  const out: SafetyWarning[] = [];
  for (let i = 0; i < meds.length; i++) {
    for (let j = i + 1; j < meds.length; j++) {
      out.push(
        ...screenMedication(meds[i], {
          allergies: [],
          currentMeds: [meds[j]],
          interactions,
          allergyRules: [],
        }),
      );
    }
  }
  const order: Record<SafetySeverity, number> = { major: 0, moderate: 1, minor: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
