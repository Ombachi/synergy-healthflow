import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isItemVisibleForRoles } from "./navigation-visibility";

describe("admin sidebar boundaries", () => {
  it("keeps platform admin focused on administration", () => {
    assert.equal(isItemVisibleForRoles("/admin/facilities", "admin", ["superadmin"]), true);
    assert.equal(isItemVisibleForRoles("/sla", "admin", ["superadmin"]), true);
    assert.equal(isItemVisibleForRoles("/coming-soon/nursing-triage", "outpatient", ["superadmin"]), false);
  });
  it("gives facility admin branch operations but no platform provisioning", () => {
    assert.equal(isItemVisibleForRoles("/roster", "hr-management", ["facility_admin"]), true);
    assert.equal(isItemVisibleForRoles("/inventory", "store", ["facility_admin"]), true);
    assert.equal(isItemVisibleForRoles("/admin/facilities", "admin", ["facility_admin"]), false);
    assert.equal(isItemVisibleForRoles("/coming-soon/resuscitation", "emergency", ["facility_admin"]), false);
  });
});
