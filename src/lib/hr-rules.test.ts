import { describe, expect, it } from "vitest";
import { approvalBalance, onboardingSchema } from "./hr-rules";

describe("HR onboarding and approval", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const input = { facilityId: id, userId: id, position: "Nurse", departmentId: id, year: 2026, quotas: [{ leaveTypeId: id, days: 21 }] };
  it("links the selected account, title, department and initial quota", () => {
    expect(onboardingSchema.parse(input)).toEqual(input);
  });
  it("requires a linked account", () => expect(onboardingSchema.safeParse({ ...input, userId: "" }).success).toBe(false));
  it("rejects negative quotas", () => expect(onboardingSchema.safeParse({ ...input, quotas: [{ leaveTypeId: id, days: -1 }] }).success).toBe(false));
  it("rejects duplicate quotas", () => expect(onboardingSchema.safeParse({ ...input, quotas: [...input.quotas, ...input.quotas] }).success).toBe(false));
  it("deducts approved days and records used days", () => expect(approvalBalance(21, 0, 5, false)).toEqual({ balance: 16, used: 5 }));
  it("does not deduct twice", () => expect(approvalBalance(16, 5, 5, true)).toEqual({ balance: 16, used: 5 }));
  it("rejects insufficient balances rather than flooring at zero", () => expect(() => approvalBalance(3, 18, 5, false)).toThrow("Insufficient"));
});