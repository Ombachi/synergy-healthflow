import { z } from "zod";

export const onboardingSchema = z.object({
  facilityId: z.string().uuid(), userId: z.string().uuid(),
  position: z.string().trim().min(1, "Job title is required").max(150),
  departmentId: z.string().uuid(), year: z.number().int().min(2000).max(2100),
  quotas: z.array(z.object({ leaveTypeId: z.string().uuid(), days: z.number().finite().min(0).max(366) })).min(1),
}).superRefine((value, ctx) => {
  if (new Set(value.quotas.map(q => q.leaveTypeId)).size !== value.quotas.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate leave type" });
});

export function approvalBalance(balance: number, used: number, days: number, alreadyDeducted: boolean) {
  if (alreadyDeducted) return { balance, used };
  if (!Number.isFinite(days) || days <= 0) throw new Error("Invalid leave days");
  if (!Number.isFinite(balance) || balance < days) throw new Error("Insufficient leave balance");
  return { balance: balance - days, used: used + days };
}