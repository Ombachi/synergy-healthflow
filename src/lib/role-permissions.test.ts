import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AppRole } from "@/hooks/use-auth";
import { canAccess, ROLE_HOME } from "./role-permissions";
import { isItemVisibleForRoles } from "./navigation-visibility";

describe("role and module access", () => {
  it("lands facility administrators on the dedicated branch staff page", () => {
    assert.equal(ROLE_HOME["facility_admin"], "/facility/staff");
    assert.equal(canAccess("/facility/staff", ["facility_admin"]), true);
    assert.equal(canAccess("/facility/staff", ["doctor"]), false);
    assert.equal(canAccess("/facility/staff", ["patient"]), false);
  });
  it("limits Admissions navigation to admissions operations and personal staff services", () => {
    for (const path of ["/admissions", "/beds", "/nursing-station", "/patients", "/mobility/request"]) {
      assert.equal(isItemVisibleForRoles(path, "inpatient", ["admissions_officer"]), true, path);
    }
    for (const path of ["/my-inpatients", "/prescribe", "/billing", "/users", "/coming-soon/ward-board", "/hr/admin"]) {
      assert.equal(isItemVisibleForRoles(path, "inpatient", ["admissions_officer"]), false, path);
    }
    assert.equal(isItemVisibleForRoles("/hr/me", "staff-self-service", ["admissions_officer"]), true);
  });

  it("keeps HR roles out of clinical, platform-admin and unfinished navigation", () => {
    for (const role of ["hr_officer", "hr_manager"] as const) {
      assert.equal(isItemVisibleForRoles("/hr/admin", "hr-management", [role]), true);
      for (const path of ["/users", "/patients", "/coming-soon/outpatient-procedures"]) {
        assert.equal(isItemVisibleForRoles(path, "outpatient", [role]), false, path);
      }
    }
  });

  it("provides staff self-service without giving clinical staff HR management", () => {
    for (const role of ["doctor", "nurse", "receptionist", "admissions_officer", "pharmacist", "cashier"] as const) {
      for (const path of ["/hr/me", "/hr/leave", "/hr/payslips", "/attendance"]) {
        assert.equal(canAccess(path, [role]), true, `${role}: ${path}`);
        assert.equal(canAccess(path, [role], { hr: false }), false, `${role}: disabled ${path}`);
      }
      assert.equal(canAccess("/hr/admin", [role]), false);
      assert.equal(isItemVisibleForRoles("/hr/admin", "hr-management", [role]), false);
    }
    assert.equal(canAccess("/hr/me", ["patient"]), false);
    assert.equal(canAccess("/hr/payslips", ["athlete"]), false);
  });

  it("preserves additional-role navigation in the selected branch", () => {
    assert.equal(isItemVisibleForRoles("/billing", "outpatient", ["admissions_officer", "cashier"]), true);
    assert.equal(canAccess("/billing", ["admissions_officer", "cashier"]), true);
    assert.equal(isItemVisibleForRoles("/hr/me", "staff-self-service", ["admin"]), true);
  });

  it("blocks a route when the facility switched its module off, even for admins", () => {
    assert.equal(canAccess("/pharmacy", ["pharmacist"], { pharmacy: false }), false);
    assert.equal(canAccess("/pharmacy", ["admin"], { pharmacy: false }), false);
    assert.equal(canAccess("/admissions", ["nurse"], { inpatient_haims: false }), false);
  });

  it("allows a route when its module is on and the role matches", () => {
    assert.equal(canAccess("/pharmacy", ["pharmacist"], { pharmacy: true }), true);
    assert.equal(canAccess("/lab", ["lab_tech"], { laboratory: true }), true);
  });

  it("treats missing module flags as enabled", () => {
    assert.equal(canAccess("/pharmacy", ["pharmacist"]), true);
    assert.equal(canAccess("/pharmacy", ["pharmacist"], {}), true);
  });

  it("keeps dashboard and messages visible to every signed-in user", () => {
    assert.equal(canAccess("/dashboard", ["patient"]), true);
    assert.equal(canAccess("/messages", ["driver"]), true);
  });

  it("gives only platform admins access to control-plane routes", () => {
    assert.equal(canAccess("/users", ["superadmin"]), true);
    assert.equal(canAccess("/users", ["doctor"]), false);
    assert.equal(canAccess("/admin/facilities", ["superadmin"]), true);
    assert.equal(canAccess("/admin/facilities", ["billing_officer"]), false);
    assert.equal(canAccess("/service-catalog", ["pharmacist"]), false);
    for (const role of ["admin", "facility_admin"] as const) {
      for (const path of ["/users", "/admin/facilities", "/service-catalog"]) {
        assert.equal(canAccess(path, [role]), false, `${role}: ${path}`);
      }
    }
  });

  it("denies a route when the role is not in its allow-list", () => {
    assert.equal(canAccess("/pharmacy", ["cashier"]), false);
    assert.equal(canAccess("/billing", ["nurse"]), false);
    assert.equal(canAccess("/queue", ["pharmacist"]), false);
    assert.equal(canAccess("/reception", ["patient"]), false);
  });

  it("applies prefix rules to dynamic routes", () => {
    assert.equal(canAccess("/visits/9f1c2a", ["nurse"]), true);
    assert.equal(canAccess("/visits/9f1c2a", ["cashier"]), false);
    assert.equal(canAccess("/print/prescription/rx-1", ["doctor"]), true);
    assert.equal(canAccess("/print/prescription/rx-1", ["receptionist"]), false);
  });

  it("denies unknown paths", () => {
    assert.equal(canAccess("/definitely-not-a-page", ["doctor"]), false);
  });

  it("keeps non-clinical roles out of clinical routes", () => {
    for (const role of ["cashier", "billing_officer", "procurement", "store_keeper"] as const) {
      assert.equal(canAccess("/visits", [role]), false, `${role} must not open visits`);
      assert.equal(canAccess("/prescribe", [role]), false, `${role} must not prescribe`);
    }
  });

  it("lets only patients request chronic refills and pharmacy fulfil them", () => {
    assert.equal(canAccess("/chronic-care", ["patient"]), true);
    assert.equal(canAccess("/chronic-care", ["pharmacist"]), true);
    assert.equal(canAccess("/chronic-care", ["receptionist"]), false);
  });

  it("gives every routed role a sign-in landing page that it can access", () => {
    for (const [role, home] of Object.entries(ROLE_HOME)) {
      assert.ok(home, `${role} has a landing page`);
      assert.equal(canAccess(home, [role as AppRole]), true, `${role} can open ${home}`);
    }
  });
});
