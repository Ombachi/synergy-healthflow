import { test } from "node:test";
import assert from "node:assert/strict";
import { interactionCards, normalizeSeverity } from "./db-interactions";

const rows = [
  { drug_a: "Warfarin", drug_b: "Aspirin", severity: "major" },
  { drug_a: "Sildenafil", drug_b: "Nitroglycerin", severity: "Contraindicated" },
  { drug_a: "Simvastatin", drug_b: "Amlodipine", severity: "moderate" },
  { drug_a: "Paracetamol", drug_b: "Caffeine", severity: "minor" },
];

test("contraindicated and major interactions require override (critical)", () => {
  const c = interactionCards("Aspirin 75mg tablet", ["Warfarin 5mg"], rows);
  assert.equal(c.length, 1); assert.equal(c[0]?.indicator, "critical");
  assert.equal(interactionCards("Sildenafil 50mg", ["Nitroglycerin SL"], rows)[0]?.indicator, "critical");
});
test("moderate interaction is a warning", () => {
  assert.equal(interactionCards("Simvastatin 20mg", ["Amlodipine 5mg"], rows)[0]?.indicator, "warning");
});
test("minor and unrelated produce no alert", () => {
  assert.equal(interactionCards("Paracetamol", ["Caffeine"], rows).length, 0);
  assert.equal(interactionCards("Aspirin", ["Metformin"], rows).length, 0);
  assert.equal(normalizeSeverity("CONTRAINDICATED"), "contraindicated");
});
