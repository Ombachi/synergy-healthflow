// Clinical scoring calculators for HAIMS.
// Each function returns { total, risk } given structured component input.

export type Risk = "low" | "medium" | "high";

// NEWS2 (adult early warning)
export function calcNews2(v: {
  respRate: number;
  spo2: number;
  onOxygen: boolean;
  systolicBp: number;
  pulse: number;
  consciousness: "A" | "V" | "P" | "U";
  tempC: number;
}): { total: number; risk: Risk } {
  let s = 0;
  // Resp rate
  if (v.respRate <= 8) s += 3;
  else if (v.respRate <= 11) s += 1;
  else if (v.respRate <= 20) s += 0;
  else if (v.respRate <= 24) s += 2;
  else s += 3;
  // SpO2 scale 1
  if (v.spo2 <= 91) s += 3;
  else if (v.spo2 <= 93) s += 2;
  else if (v.spo2 <= 95) s += 1;
  if (v.onOxygen) s += 2;
  // Systolic BP
  if (v.systolicBp <= 90) s += 3;
  else if (v.systolicBp <= 100) s += 2;
  else if (v.systolicBp <= 110) s += 1;
  else if (v.systolicBp >= 220) s += 3;
  // Pulse
  if (v.pulse <= 40) s += 3;
  else if (v.pulse <= 50) s += 1;
  else if (v.pulse <= 90) s += 0;
  else if (v.pulse <= 110) s += 1;
  else if (v.pulse <= 130) s += 2;
  else s += 3;
  // Consciousness
  if (v.consciousness !== "A") s += 3;
  // Temperature
  if (v.tempC <= 35.0) s += 3;
  else if (v.tempC <= 36.0) s += 1;
  else if (v.tempC <= 38.0) s += 0;
  else if (v.tempC <= 39.0) s += 1;
  else s += 2;

  const risk: Risk = s >= 7 ? "high" : s >= 5 ? "medium" : "low";
  return { total: s, risk };
}

// MEWS (older, simpler)
export function calcMews(v: {
  systolicBp: number;
  pulse: number;
  respRate: number;
  tempC: number;
  avpu: "A" | "V" | "P" | "U";
}): { total: number; risk: Risk } {
  let s = 0;
  const bp = v.systolicBp;
  if (bp < 70) s += 3;
  else if (bp <= 80) s += 2;
  else if (bp <= 100) s += 1;
  else if (bp >= 200) s += 2;
  const p = v.pulse;
  if (p < 40) s += 2;
  else if (p <= 50) s += 1;
  else if (p <= 100) s += 0;
  else if (p <= 110) s += 1;
  else if (p <= 129) s += 2;
  else s += 3;
  const r = v.respRate;
  if (r < 9) s += 2;
  else if (r <= 14) s += 0;
  else if (r <= 20) s += 1;
  else if (r <= 29) s += 2;
  else s += 3;
  if (v.tempC < 35) s += 2;
  else if (v.tempC <= 38.4) s += 0;
  else s += 2;
  if (v.avpu === "V") s += 1;
  else if (v.avpu === "P") s += 2;
  else if (v.avpu === "U") s += 3;
  const risk: Risk = s >= 5 ? "high" : s >= 3 ? "medium" : "low";
  return { total: s, risk };
}

// GCS
export function calcGcs(v: { eye: number; verbal: number; motor: number }): { total: number; risk: Risk } {
  const s = v.eye + v.verbal + v.motor;
  const risk: Risk = s <= 8 ? "high" : s <= 12 ? "medium" : "low";
  return { total: s, risk };
}

// Braden (pressure injury) — total 6-23, lower = higher risk
export function calcBraden(v: {
  sensory: number; moisture: number; activity: number;
  mobility: number; nutrition: number; friction: number;
}): { total: number; risk: Risk } {
  const s = v.sensory + v.moisture + v.activity + v.mobility + v.nutrition + v.friction;
  const risk: Risk = s <= 12 ? "high" : s <= 14 ? "medium" : "low";
  return { total: s, risk };
}

// Morse Fall Scale
export function calcMorse(v: {
  historyFalls: 0 | 25;
  secondaryDx: 0 | 15;
  ambulatoryAid: 0 | 15 | 30;
  ivTherapy: 0 | 20;
  gait: 0 | 10 | 20;
  mentalStatus: 0 | 15;
}): { total: number; risk: Risk } {
  const s = v.historyFalls + v.secondaryDx + v.ambulatoryAid + v.ivTherapy + v.gait + v.mentalStatus;
  const risk: Risk = s >= 45 ? "high" : s >= 25 ? "medium" : "low";
  return { total: s, risk };
}
