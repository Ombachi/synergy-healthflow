import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { hrFacilityScope, requireBranchRecord } from "./hr-facility-rules";

const branchA = "11111111-1111-4111-8111-111111111111";
const branchB = "22222222-2222-4222-8222-222222222222";

describe("HR branch isolation", () => {
  test("Branch A managers query only Branch A, never a global workspace", () => {
    assert.deepEqual(hrFacilityScope(branchA, "manager", true), { facilityId: branchA, ownerId: null, publishedOnly: false });
    assert.notEqual(hrFacilityScope(branchB, "manager", true).facilityId, branchA);
  });
  test("employee payslips stay branch-scoped, own-only and published-only", () => {
    assert.deepEqual(hrFacilityScope(branchA, "staff-a", false), { facilityId: branchA, ownerId: "staff-a", publishedOnly: true });
  });
  test("fallback branches and signed-out queries fail closed", () => {
    assert.throws(() => hrFacilityScope("fac-main", "manager", true));
    assert.throws(() => hrFacilityScope(branchA, "", true));
  });
  test("branch switch invalidates employee, shift and payslip selections", () => {
    for (const id of ["employee-a", "shift-a", "payslip-a"]) {
      assert.throws(() => requireBranchRecord(id, [{ id: "record-b" }]));
      assert.equal(requireBranchRecord(id, [{ id }]), id);
    }
  });
});