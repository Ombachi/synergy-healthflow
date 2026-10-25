import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { approvalBalance, onboardingSchema, leaveCalendarDays } from "./hr-rules";

describe("HR onboarding and approval", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const input = { facilityId: id, userId: id, position: "Nurse", departmentId: id, year: 2026, quotas: [{ leaveTypeId: id, days: 21 }] };
  it("links the selected account, title, department and initial quota", () => {
    assert.deepEqual(onboardingSchema.parse(input), input);
  });
  it("requires a linked account", () => assert.equal(onboardingSchema.safeParse({ ...input, userId: "" }).success, false));
  it("rejects negative quotas", () => assert.equal(onboardingSchema.safeParse({ ...input, quotas: [{ leaveTypeId: id, days: -1 }] }).success, false));
  it("rejects duplicate quotas", () => assert.equal(onboardingSchema.safeParse({ ...input, quotas: [...input.quotas, ...input.quotas] }).success, false));
  it("deducts approved days and records used days", () => assert.deepEqual(approvalBalance(21, 0, 5, false), { balance: 16, used: 5 }));
  it("does not deduct twice", () => assert.deepEqual(approvalBalance(16, 5, 5, true), { balance: 16, used: 5 }));
  it("rejects insufficient balances rather than flooring at zero", () => assert.throws(() => approvalBalance(3, 18, 5, false), /Insufficient/));
  it("counts five calendar days inclusively", () => assert.equal(leaveCalendarDays("2026-10-25", "2026-10-29"), 5));
  it("rejects an end before the start", () => assert.equal(leaveCalendarDays("2026-10-29", "2026-10-25"), 0));
  it("rejects impossible dates rather than normalizing them", () => assert.equal(leaveCalendarDays("2026-02-30", "2026-03-05"), 0));
  it("counts one day for a same-day request", () => assert.equal(leaveCalendarDays("2026-10-25", "2026-10-25"), 1));
});