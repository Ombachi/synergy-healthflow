// Centralized terminology service.
// Modules must NOT hard-code clinical codes; they resolve concepts through
// this registry so coding systems, versions and status stay authoritative.

export type CodingSystem =
  | "ICD-10"
  | "SNOMED-CT"
  | "LOINC"
  | "UCUM"
  | "RXNORM"
  | "ATC"
  | "GS1"
  | "LOCAL";

export const SYSTEM_URI: Record<CodingSystem, string> = {
  "ICD-10": "http://hl7.org/fhir/sid/icd-10",
  "SNOMED-CT": "http://snomed.info/sct",
  LOINC: "http://loinc.org",
  UCUM: "http://unitsofmeasure.org",
  RXNORM: "http://www.nlm.nih.gov/research/umls/rxnorm",
  ATC: "http://www.whocc.no/atc",
  GS1: "https://www.gs1.org/gtin",
  LOCAL: "urn:litu:terminology",
};

export type ConceptStatus = "active" | "deprecated" | "draft";

export interface ClinicalConcept {
  display: string;
  code: string;
  system: CodingSystem;
  version?: string;
  status: ConceptStatus;
}

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
  version?: string;
}

export function toCoding(c: ClinicalConcept): FhirCoding {
  return { system: SYSTEM_URI[c.system], code: c.code, display: c.display, version: c.version };
}

export function toCodeableConcept(concepts: ClinicalConcept[], text?: string) {
  return { coding: concepts.map(toCoding), text: text ?? concepts[0]?.display };
}

function concept(
  system: CodingSystem,
  code: string,
  display: string,
  version?: string,
): ClinicalConcept {
  return { system, code, display, status: "active", ...(version ? { version } : {}) };
}

/** LOINC mappings for the laboratory catalogue (name/alias -> concept). */
const LOINC_BY_TEST: Record<string, ClinicalConcept> = {
  "full blood count": concept("LOINC", "58410-2", "CBC panel - Blood by Automated count"),
  "complete blood count": concept("LOINC", "58410-2", "CBC panel - Blood by Automated count"),
  fbc: concept("LOINC", "58410-2", "CBC panel - Blood by Automated count"),
  haemoglobin: concept("LOINC", "718-7", "Hemoglobin [Mass/volume] in Blood"),
  hemoglobin: concept("LOINC", "718-7", "Hemoglobin [Mass/volume] in Blood"),
  "white blood cell count": concept("LOINC", "6690-2", "Leukocytes [#/volume] in Blood"),
  platelets: concept("LOINC", "777-3", "Platelets [#/volume] in Blood"),
  "urea and electrolytes": concept("LOINC", "24326-1", "Electrolytes 1998 panel - Serum or Plasma"),
  uec: concept("LOINC", "24326-1", "Electrolytes 1998 panel - Serum or Plasma"),
  creatinine: concept("LOINC", "2160-0", "Creatinine [Mass/volume] in Serum or Plasma"),
  urea: concept("LOINC", "3094-0", "Urea nitrogen [Mass/volume] in Serum or Plasma"),
  sodium: concept("LOINC", "2951-2", "Sodium [Moles/volume] in Serum or Plasma"),
  potassium: concept("LOINC", "2823-3", "Potassium [Moles/volume] in Serum or Plasma"),
  "liver function tests": concept("LOINC", "24325-3", "Hepatic function 2000 panel"),
  lft: concept("LOINC", "24325-3", "Hepatic function 2000 panel"),
  alt: concept("LOINC", "1742-6", "Alanine aminotransferase [Enzymatic activity/volume]"),
  ast: concept("LOINC", "1920-8", "Aspartate aminotransferase [Enzymatic activity/volume]"),
  "total bilirubin": concept("LOINC", "1975-2", "Bilirubin.total [Mass/volume] in Serum or Plasma"),
  glucose: concept("LOINC", "2345-7", "Glucose [Mass/volume] in Serum or Plasma"),
  "random blood sugar": concept("LOINC", "2345-7", "Glucose [Mass/volume] in Serum or Plasma"),
  "fasting blood sugar": concept("LOINC", "1558-6", "Fasting glucose [Mass/volume] in Serum or Plasma"),
  hba1c: concept("LOINC", "4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood"),
  "lipid profile": concept("LOINC", "57698-3", "Lipid panel with direct LDL - Serum or Plasma"),
  cholesterol: concept("LOINC", "2093-3", "Cholesterol [Mass/volume] in Serum or Plasma"),
  "malaria parasite": concept("LOINC", "32700-7", "Plasmodium sp identified in Blood by Light microscopy"),
  "urinalysis": concept("LOINC", "24357-6", "Urinalysis macro (dipstick) panel - Urine"),
  "hiv test": concept("LOINC", "75622-1", "HIV 1 and 2 tests - Serum or Plasma"),
  "pregnancy test": concept("LOINC", "2106-3", "Choriogonadotropin [Units/volume] in Urine"),
  "thyroid function tests": concept("LOINC", "24348-5", "Thyroid function panel"),
  tsh: concept("LOINC", "3016-3", "Thyrotropin [Units/volume] in Serum or Plasma"),
};

/** ICD-10 mappings for frequently used diagnoses / chronic conditions. */
const ICD_BY_CONDITION: Record<string, ClinicalConcept> = {
  hypertension: concept("ICD-10", "I10", "Essential (primary) hypertension"),
  "diabetes mellitus": concept("ICD-10", "E11", "Type 2 diabetes mellitus"),
  "type 2 diabetes": concept("ICD-10", "E11", "Type 2 diabetes mellitus"),
  "type 1 diabetes": concept("ICD-10", "E10", "Type 1 diabetes mellitus"),
  asthma: concept("ICD-10", "J45", "Asthma"),
  copd: concept("ICD-10", "J44", "Chronic obstructive pulmonary disease"),
  epilepsy: concept("ICD-10", "G40", "Epilepsy"),
  "chronic kidney disease": concept("ICD-10", "N18", "Chronic kidney disease"),
  "heart failure": concept("ICD-10", "I50", "Heart failure"),
  hiv: concept("ICD-10", "B20", "Human immunodeficiency virus disease"),
  tuberculosis: concept("ICD-10", "A15", "Respiratory tuberculosis"),
  "sickle cell disease": concept("ICD-10", "D57", "Sickle-cell disorders"),
  hypothyroidism: concept("ICD-10", "E03", "Other hypothyroidism"),
  arthritis: concept("ICD-10", "M13", "Other arthritis"),
};

/** SNOMED CT clinical concepts used across clinical documentation. */
const SNOMED_BY_TERM: Record<string, ClinicalConcept> = {
  hypertension: concept("SNOMED-CT", "38341003", "Hypertensive disorder"),
  "diabetes mellitus": concept("SNOMED-CT", "73211009", "Diabetes mellitus"),
  asthma: concept("SNOMED-CT", "195967001", "Asthma"),
  copd: concept("SNOMED-CT", "13645005", "Chronic obstructive lung disease"),
  epilepsy: concept("SNOMED-CT", "84757009", "Epilepsy"),
  "chronic kidney disease": concept("SNOMED-CT", "709044004", "Chronic kidney disease"),
  "heart failure": concept("SNOMED-CT", "84114007", "Heart failure"),
  "outpatient encounter": concept("SNOMED-CT", "371883000", "Outpatient procedure"),
  "inpatient encounter": concept("SNOMED-CT", "32485007", "Hospital admission"),
  "emergency encounter": concept("SNOMED-CT", "50849002", "Emergency room admission"),
};

/** UCUM units keyed by the free-text unit strings used in the lab module. */
const UCUM_BY_UNIT: Record<string, string> = {
  "g/dl": "g/dL",
  "mg/dl": "mg/dL",
  "mmol/l": "mmol/L",
  "umol/l": "umol/L",
  "iu/l": "U/L",
  "u/l": "U/L",
  "%": "%",
  "cells/ul": "/uL",
  "x10^9/l": "10*9/L",
  "x10^12/l": "10*12/L",
  kg: "kg",
  cm: "cm",
  "mmhg": "mm[Hg]",
  "bpm": "/min",
  "c": "Cel",
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function lookupLoinc(testName: string): ClinicalConcept | null {
  const k = norm(testName);
  if (LOINC_BY_TEST[k]) return LOINC_BY_TEST[k];
  const hit = Object.keys(LOINC_BY_TEST).find((key) => k.includes(key));
  return hit ? LOINC_BY_TEST[hit]! : null;
}

export function lookupIcd(conditionName: string): ClinicalConcept | null {
  const k = norm(conditionName);
  if (ICD_BY_CONDITION[k]) return ICD_BY_CONDITION[k];
  const hit = Object.keys(ICD_BY_CONDITION).find((key) => k.includes(key));
  return hit ? ICD_BY_CONDITION[hit]! : null;
}

export function lookupSnomed(term: string): ClinicalConcept | null {
  const k = norm(term);
  if (SNOMED_BY_TERM[k]) return SNOMED_BY_TERM[k];
  const hit = Object.keys(SNOMED_BY_TERM).find((key) => k.includes(key));
  return hit ? SNOMED_BY_TERM[hit]! : null;
}

export function toUcum(unit: string | null | undefined): string | undefined {
  if (!unit) return undefined;
  return UCUM_BY_UNIT[norm(unit)] ?? unit;
}

/** Resolve every coding we can find for a clinical term (diagnosis/condition). */
export function resolveConditionCodings(term: string): ClinicalConcept[] {
  return [lookupIcd(term), lookupSnomed(term)].filter(Boolean) as ClinicalConcept[];
}

/** Full registry export for admin/terminology browsing screens. */
export function terminologyRegistry(): ClinicalConcept[] {
  return [
    ...Object.values(LOINC_BY_TEST),
    ...Object.values(ICD_BY_CONDITION),
    ...Object.values(SNOMED_BY_TERM),
  ].filter((c, i, arr) => arr.findIndex((x) => x.system === c.system && x.code === c.code) === i);
}
