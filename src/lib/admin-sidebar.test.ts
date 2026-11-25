import { describe, it, expect } from "bun:test";
import { isItemVisibleForRoles } from "./navigation-visibility";

describe("admin sidebar boundaries", () => {
  it("keeps platform admin focused on administration", () => {
    expect(isItemVisibleForRoles("/admin/facilities", "admin", ["superadmin"])).toBe(true);
    expect(isItemVisibleForRoles("/sla", "admin", ["superadmin"])).toBe(true);
    expect(isItemVisibleForRoles("/coming-soon/nursing-triage", "outpatient", ["superadmin"])).toBe(false);
  });
  it("gives facility admin branch operations but no platform provisioning", () => {
    expect(isItemVisibleForRoles("/roster", "hr-management", ["facility_admin"])).toBe(true);
    expect(isItemVisibleForRoles("/inventory", "store", ["facility_admin"])).toBe(true);
    expect(isItemVisibleForRoles("/admin/facilities", "admin", ["facility_admin"])).toBe(false);
    expect(isItemVisibleForRoles("/coming-soon/resuscitation", "emergency", ["facility_admin"])).toBe(false);
  });
});
