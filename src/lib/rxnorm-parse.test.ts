import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRxNavDrugs } from "./rxnorm-parse";
describe("parseRxNavDrugs", () => {
  it("keeps clinical drugs with RxCUI, strength and form", () => {
    const r = parseRxNavDrugs({ drugGroup: { conceptGroup: [
      { tty: "IN", conceptProperties: [{ rxcui: "723", name: "amoxicillin" }] },
      { tty: "SCD", conceptProperties: [{ rxcui: "308191", name: "amoxicillin 500 MG Oral Capsule", tty: "SCD" }] },
    ] } });
    assert.equal(r.length, 1);
    assert.equal(r[0]?.rxcui, "308191");
    assert.equal(r[0]?.strength, "500 MG");
    assert.equal(r[0]?.dose_form, "Oral Capsule");
  });
});
