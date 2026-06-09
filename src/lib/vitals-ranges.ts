// Adult clinical normal/critical ranges. Returns warnings for out-of-range or missing.

export type VitalKey =
  | "systolic_bp"
  | "diastolic_bp"
  | "heart_rate"
  | "respiratory_rate"
  | "temperature_c"
  | "oxygen_saturation"
  | "weight_kg"
  | "height_cm"
  | "pain_level"
  | "glucose_mg_dl";

export interface Range {
  label: string;
  unit: string;
  normal: [number, number];
  critical: [number, number]; // outside critical = hard warning
}

export const RANGES: Record<VitalKey, Range> = {
  systolic_bp:       { label: "Systolic BP", unit: "mmHg", normal: [90, 130],  critical: [70, 180] },
  diastolic_bp:      { label: "Diastolic BP", unit: "mmHg", normal: [60, 85],  critical: [40, 120] },
  heart_rate:        { label: "Heart rate", unit: "bpm",    normal: [60, 100], critical: [40, 150] },
  respiratory_rate:  { label: "Resp rate",  unit: "/min",   normal: [12, 20],  critical: [8, 30] },
  temperature_c:     { label: "Temperature", unit: "°C",    normal: [36.1, 37.5], critical: [34, 40] },
  oxygen_saturation: { label: "SpO₂",       unit: "%",      normal: [95, 100], critical: [88, 100] },
  weight_kg:         { label: "Weight",     unit: "kg",     normal: [30, 200], critical: [20, 300] },
  height_cm:         { label: "Height",     unit: "cm",     normal: [120, 220], critical: [50, 250] },
  pain_level:        { label: "Pain",       unit: "/10",    normal: [0, 10],   critical: [0, 10] },
  glucose_mg_dl:     { label: "Glucose",    unit: "mg/dL",  normal: [70, 140], critical: [40, 400] },
};

export const REQUIRED_KEYS: VitalKey[] = [
  "systolic_bp",
  "diastolic_bp",
  "heart_rate",
  "temperature_c",
  "oxygen_saturation",
];

export interface VitalWarning {
  key: VitalKey;
  severity: "missing" | "out_of_range" | "critical";
  message: string;
}

export function validateVitals(values: Partial<Record<VitalKey, number | null>>): VitalWarning[] {
  const out: VitalWarning[] = [];
  for (const k of REQUIRED_KEYS) {
    const v = values[k];
    if (v == null || Number.isNaN(v)) {
      out.push({ key: k, severity: "missing", message: `${RANGES[k].label} is required` });
    }
  }
  (Object.keys(RANGES) as VitalKey[]).forEach((k) => {
    const v = values[k];
    if (v == null || Number.isNaN(v)) return;
    const r = RANGES[k];
    if (v < r.critical[0] || v > r.critical[1]) {
      out.push({ key: k, severity: "critical", message: `${r.label} ${v}${r.unit} is critically out of range (${r.critical[0]}–${r.critical[1]})` });
    } else if (v < r.normal[0] || v > r.normal[1]) {
      out.push({ key: k, severity: "out_of_range", message: `${r.label} ${v}${r.unit} is outside normal (${r.normal[0]}–${r.normal[1]})` });
    }
  });
  return out;
}
