// HL7 CDS Hooks 1.0 style service: medication-prescribe / order-select.
// Pure, deterministic evaluation over the ATC ontology in ./ontology.
import {
  CLASS_INTERACTIONS, CROSS_REACTIVITY, DOSE_RULES, INGREDIENTS,
  allergyTermMatches, inClass, resolveDrug, type IngredientConcept, type RuleSeverity,
} from "./ontology";

export type CdsIndicator = "critical" | "warning" | "info";
export type CdsHook = "medication-prescribe" | "order-select" | "patient-view";

export interface CdsSuggestion { label: string; medication: string; uuid: string }
export interface CdsOverrideReason { code: string; display: string }

export interface CdsCard {
  uuid: string; // deterministic alert id
  summary: string;
  detail: string;
  indicator: CdsIndicator;
  source: { label: string; url?: string; topic?: string };
  alertType: "interaction" | "allergy" | "renal" | "age" | "duplicate" | "unresolved";
  suggestions: CdsSuggestion[];
  overrideReasons: CdsOverrideReason[];
  monograph?: {
    mechanism: string; consequence: string; action: string; evidence: string;
    severity: RuleSeverity | CdsIndicator; drugs: string[];
  };
}

export interface MedicationPrescribeContext {
  patientId: string;
  encounterId?: string;
  draftMedications: string[];
}

export interface CdsPrefetch {
  activeMedications: string[]; // includes chronic-care regimens
  allergies: string[];
  ageYears?: number | null;
  egfr?: number | null;
}

export interface CdsRequest {
  hook: CdsHook;
  hookInstance?: string;
  context: MedicationPrescribeContext;
  prefetch: CdsPrefetch;
}

export const OVERRIDE_REASONS: CdsOverrideReason[] = [
  { code: "benefit-outweighs-risk", display: "Clinical benefit outweighs risk" },
  { code: "allergy-delabelled", display: "Allergy formally de-labelled / tolerated before" },
  { code: "monitoring-in-place", display: "Will monitor closely (levels / labs)" },
  { code: "specialist-advised", display: "Specialist advised this combination" },
  { code: "no-alternative", display: "No suitable alternative available" },
  { code: "dose-adjusted", display: "Dose already adjusted for patient" },
];

const SOURCE = { label: "Litu Vault CDS · ATC/RxNorm knowledge base", topic: "Medication safety" };

const sevToIndicator = (s: RuleSeverity): CdsIndicator =>
  s === "contraindicated" ? "critical" : s === "minor" ? "info" : "warning";

const label = (c: IngredientConcept) => `${c.ingredient} (${c.className}, ${c.atc})`;

function suggestionsFor(names: string[] | undefined, exclude: IngredientConcept[], avoid: (c: IngredientConcept) => boolean): CdsSuggestion[] {
  return (names ?? [])
    .map((n) => INGREDIENTS.find((i) => i.ingredient === n))
    .filter((c): c is IngredientConcept => !!c && !exclude.includes(c) && !avoid(c))
    .map((c) => ({ label: `Switch to ${c.ingredient}`, medication: c.ingredient, uuid: `sugg-${c.atc}` }));
}

export function runMedicationPrescribe(req: CdsRequest): { cards: CdsCard[] } {
  const cards: CdsCard[] = [];
  const { prefetch } = req;
  const current = prefetch.activeMedications.map(resolveDrug);
  const allergyText = prefetch.allergies;

  for (const draftName of req.context.draftMedications) {
    const draft = resolveDrug(draftName);
    if (draft.ingredients.length === 0) {
      cards.push({
        uuid: `unresolved:${draftName}`, alertType: "unresolved", indicator: "info",
        summary: `"${draftName}" could not be mapped to an ATC/RxNorm concept`,
        detail: "Automated interaction and allergy screening could not be completed for this product. Verify manually.",
        source: SOURCE, suggestions: [], overrideReasons: [],
      });
      continue;
    }

    const allergyHit = (c: IngredientConcept) =>
      CROSS_REACTIVITY.some((x) => inClass(c, [x.crossClass]) &&
        allergyText.some((a) => x.allergenAliases.some((al) => allergyTermMatches(a, al)))) ||
      allergyText.some((a) => allergyTermMatches(a, c.ingredient));

    for (const ing of draft.ingredients) {
      // 1. Direct ingredient allergy
      for (const a of allergyText) {
        if (allergyTermMatches(a, ing.ingredient) || (ing.synonyms ?? []).some((s) => allergyTermMatches(a, s))) {
          cards.push({
            uuid: `allergy-direct:${ing.atc}`, alertType: "allergy", indicator: "critical",
            summary: `Documented allergy to ${ing.ingredient}`,
            detail: `${draftName} contains ${label(ing)}, which matches the recorded allergy "${a}".`,
            source: SOURCE, overrideReasons: OVERRIDE_REASONS,
            suggestions: [],
            monograph: { mechanism: "Immunological hypersensitivity to the active ingredient.", consequence: "Anaphylaxis, angioedema, severe cutaneous reaction.", action: "Do not administer unless allergy formally de-labelled.", evidence: "A", severity: "critical", drugs: [ing.ingredient] },
          });
        }
      }
      // 2. Class cross-reactivity
      for (const x of CROSS_REACTIVITY) {
        if (!inClass(ing, [x.crossClass])) continue;
        const matched = allergyText.find((a) => x.allergenAliases.some((al) => allergyTermMatches(a, al)));
        if (!matched || allergyTermMatches(matched, ing.ingredient)) continue;
        const id = `allergy-class:${x.allergenClass}:${ing.atc4}`;
        if (cards.some((c) => c.uuid === id)) continue;
        cards.push({
          uuid: id, alertType: "allergy", indicator: x.indicator,
          summary: `${x.allergenClass} allergy → ${ing.className} (${x.risk}% cross-reactivity)`,
          detail: `Patient allergy "${matched}" cross-reacts with ${label(ing)}. ${x.guidance}`,
          source: SOURCE, overrideReasons: OVERRIDE_REASONS,
          suggestions: suggestionsFor(["azithromycin", "doxycycline", "paracetamol", "celecoxib"], draft.ingredients, allergyHit),
          monograph: { mechanism: "Shared molecular structure / side chain between allergen class and prescribed drug.", consequence: x.guidance, action: x.indicator === "critical" ? "Choose an agent from an unrelated class." : "Prescribe only with observation and documented reaction history.", evidence: "B", severity: x.indicator, drugs: [matched, ing.ingredient] },
        });
      }

      // 3. Cross-class interactions vs active meds + other drafts
      const others = [
        ...current,
        ...req.context.draftMedications.filter((d) => d !== draftName).map(resolveDrug),
      ];
      for (const other of others) {
        for (const oi of other.ingredients) {
          if (oi === ing) {
            const id = `dup:${ing.atc}`;
            if (!cards.some((c) => c.uuid === id)) cards.push({
              uuid: id, alertType: "duplicate", indicator: "warning",
              summary: `Duplicate therapy: ${ing.ingredient} already active`,
              detail: `${other.input} already supplies ${ing.ingredient}. Risk of cumulative overdose.`,
              source: SOURCE, suggestions: [], overrideReasons: OVERRIDE_REASONS,
            });
            continue;
          }
          for (const rule of CLASS_INTERACTIONS) {
            const hit = (inClass(ing, rule.a) && inClass(oi, rule.b)) || (inClass(ing, rule.b) && inClass(oi, rule.a));
            if (!hit) continue;
            const id = `ix:${rule.id}:${[ing.atc, oi.atc].sort().join("+")}`;
            if (cards.some((c) => c.uuid === id)) continue;
            cards.push({
              uuid: id, alertType: "interaction", indicator: sevToIndicator(rule.severity),
              summary: `${rule.severity.toUpperCase()}: ${ing.className} + ${oi.className}`,
              detail: `${draftName} (${ing.ingredient}) with ${other.input} (${oi.ingredient}). ${rule.consequence}`,
              source: SOURCE, overrideReasons: OVERRIDE_REASONS,
              suggestions: suggestionsFor(rule.alternatives, [ing, oi], allergyHit),
              monograph: { mechanism: rule.mechanism, consequence: rule.consequence, action: rule.action, evidence: `Level ${rule.evidence}`, severity: rule.severity, drugs: [label(ing), label(oi)] },
            });
          }
        }
      }

      // 4. Renal & age dose checks — take the most severe renal rule only.
      const renal = DOSE_RULES.filter((r) => r.kind === "renal" && inClass(ing, r.match) &&
        prefetch.egfr != null && prefetch.egfr < (r.egfrBelow ?? 0))
        .sort((a, b) => (a.egfrBelow ?? 0) - (b.egfrBelow ?? 0))[0];
      const age = DOSE_RULES.filter((r) => r.kind !== "renal" && inClass(ing, r.match) && prefetch.ageYears != null &&
        (r.kind === "age-min" ? prefetch.ageYears < (r.ageBelow ?? 0) : prefetch.ageYears >= (r.ageAtLeast ?? 999)));
      for (const r of [renal, ...age].filter(Boolean) as typeof DOSE_RULES) {
        const id = `dose:${r.id}:${ing.atc}`;
        if (cards.some((c) => c.uuid === id)) continue;
        cards.push({
          uuid: id, alertType: r.kind === "renal" ? "renal" : "age", indicator: r.indicator,
          summary: r.summary,
          detail: `${r.detail} ${r.kind === "renal" ? `(eGFR ${prefetch.egfr} mL/min/1.73m²)` : `(age ${prefetch.ageYears} y)`}`,
          source: SOURCE, overrideReasons: r.indicator === "info" ? [] : OVERRIDE_REASONS,
          suggestions: suggestionsFor(r.alternatives, [ing], allergyHit),
        });
      }
    }
  }

  const order: Record<CdsIndicator, number> = { critical: 0, warning: 1, info: 2 };
  return { cards: cards.sort((a, b) => order[a.indicator] - order[b.indicator]) };
}

export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
