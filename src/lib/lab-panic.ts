// Browser-safe panic-value rules for lab result entry.
export interface PanicRange { parameter: string; units: string; critical_low: number | null; critical_high: number | null }

export const DEFAULT_PANIC_RANGES: PanicRange[] = [
  { parameter: "potassium", units: "mmol/L", critical_low: 2.5, critical_high: 6.5 },
  { parameter: "sodium", units: "mmol/L", critical_low: 120, critical_high: 160 },
  { parameter: "glucose", units: "mmol/L", critical_low: 2.2, critical_high: 25 },
  { parameter: "calcium", units: "mmol/L", critical_low: 1.65, critical_high: 3.25 },
  { parameter: "haemoglobin", units: "g/dL", critical_low: 7, critical_high: 20 },
  { parameter: "hemoglobin", units: "g/dL", critical_low: 7, critical_high: 20 },
  { parameter: "platelets", units: "x10^9/L", critical_low: 20, critical_high: 1000 },
  { parameter: "wbc", units: "x10^9/L", critical_low: 2, critical_high: 30 },
  { parameter: "inr", units: "", critical_low: null, critical_high: 5 },
  { parameter: "creatinine", units: "µmol/L", critical_low: null, critical_high: 700 },
];

export type PanicFlag = "critical low" | "critical high" | null;

export function findPanicRange(parameter: string, ranges: PanicRange[] = DEFAULT_PANIC_RANGES): PanicRange | undefined {
  const p = parameter.trim().toLowerCase();
  return ranges.find((r) => p === r.parameter || p.startsWith(r.parameter + " ") || p.includes(r.parameter));
}

export function panicFlag(parameter: string, value: number | null, ranges: PanicRange[] = DEFAULT_PANIC_RANGES): PanicFlag {
  if (value == null || !Number.isFinite(value)) return null;
  const r = findPanicRange(parameter, ranges);
  if (!r) return null;
  if (r.critical_low != null && value <= r.critical_low) return "critical low";
  if (r.critical_high != null && value >= r.critical_high) return "critical high";
  return null;
}
