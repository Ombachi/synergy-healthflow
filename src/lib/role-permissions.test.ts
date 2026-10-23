import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AppRole } from "@/hooks/use-auth";
import { canAccess, ROLE_HOME } from "./role-permissions";

describe("role and module access", () => {
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

  it("gives admins access to admin-only routes and denies everyone else", () => {
    assert.equal(canAccess("/users", ["admin"]), true);
    assert.equal(canAccess("/users", ["doctor"]), false);
    assert.equal(canAccess("/admin/facilities", ["admin"]), true);
    assert.equal(canAccess("/admin/facilities", ["billing_officer"]), false);
    assert.equal(canAccess("/service-catalog", ["pharmacist"]), false);
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
      assert.equal(canAccess(home, [role as keyof typeof ROUTE_ROLES extends never ? never : import("@/hooks/use-auth").AppRole]), true, `${role} can open ${home}`);
    }
  });
});
