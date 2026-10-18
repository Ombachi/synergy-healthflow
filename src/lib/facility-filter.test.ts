import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { encounterFacilityFilter, requireFacilityId } from "./facility-filter";
import { canAccess } from "./role-permissions";

describe("facility access", () => {
  test("unsaved fallback branches cannot load operational records", () => {
    assert.throws(() => requireFacilityId("fac-main"));
    assert.equal(requireFacilityId("11111111-1111-4111-8111-111111111111"), "11111111-1111-4111-8111-111111111111");
  });
  test("visit ownership is authoritative and patient fallback requires no visit", () => {
    assert.equal(encounterFacilityFilter(), "and(visit_id.not.is.null,scope_visit.not.is.null),and(visit_id.is.null,scope_patient.not.is.null)");
  });
  test("disabled HAIMS is denied even to administrators", () => {
    assert.equal(canAccess("/haims", ["admin"], { inpatient_haims: false }), false);
  });
  test("enabled theatre does not grant a receptionist clinical permission", () => {
    assert.equal(canAccess("/surgery", ["receptionist"], { theatre: true }), false);
  });
  test("branch administration remains administrator-only", () => {
    assert.equal(canAccess("/admin/facilities", ["doctor"]), false);
    assert.equal(canAccess("/admin/facilities", ["admin"]), true);
  });
});