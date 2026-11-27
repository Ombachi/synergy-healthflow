import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEPARTMENT_ROLES, canEditDepartmentRole } from "./facility-staff-rules";
import { resolveWorkspaceRoles } from "./administrator-access";

describe("branch departmental assignments", () => {
  it("permits clinical and departmental roles without offering administrative escalation", () => {
    assert.ok(DEPARTMENT_ROLES.includes("doctor"));
    assert.ok(DEPARTMENT_ROLES.includes("lab_tech"));
    for (const role of ["superadmin", "facility_admin", "admin", "patient", "athlete"]) {
      assert.equal((DEPARTMENT_ROLES as readonly string[]).includes(role), false);
      assert.equal(canEditDepartmentRole(role), false);
    }
    assert.equal(canEditDepartmentRole("nurse"), true);
    assert.equal(canEditDepartmentRole(null), true);
  });
  it("does not carry a branch administrator or departmental assignment into another facility", () => {
    const memberships = [{ facility_id: "branch-a", role: "facility_admin" as const }, { facility_id: "branch-b", role: "nurse" as const }];
    assert.deepEqual(resolveWorkspaceRoles(["facility_admin"], memberships, "branch-a"), ["facility_admin"]);
    assert.deepEqual(resolveWorkspaceRoles(["facility_admin"], memberships, "branch-b"), ["nurse"]);
    assert.deepEqual(resolveWorkspaceRoles(["facility_admin"], memberships, "unassigned"), []);
  });
});