import { describe, expect, test } from "bun:test";
import { encounterFacilityFilter, requireFacilityId } from "./facility-filter";
import { canAccess } from "./role-permissions";

describe("facility access", () => {
  test("unsaved fallback branches cannot load operational records", () => {
    expect(() => requireFacilityId("fac-main")).toThrow();
    expect(requireFacilityId("11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111");
  });
  test("visit ownership is authoritative and patient fallback requires no visit", () => {
    expect(encounterFacilityFilter()).toBe("and(visit_id.not.is.null,scope_visit.not.is.null),and(visit_id.is.null,scope_patient.not.is.null)");
  });
  test("disabled HAIMS is denied even to administrators", () => {
    expect(canAccess("/haims", ["admin"], { inpatient_haims: false })).toBe(false);
  });
  test("enabled theatre does not grant a receptionist clinical permission", () => {
    expect(canAccess("/surgery", ["receptionist"], { theatre: true })).toBe(false);
  });
  test("branch administration remains administrator-only", () => {
    expect(canAccess("/admin/facilities", ["doctor"])).toBe(false);
    expect(canAccess("/admin/facilities", ["admin"])).toBe(true);
  });
});