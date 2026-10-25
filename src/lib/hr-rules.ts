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

/** Preserve the existing inclusive calendar-day policy; invalid dates never become one day. */
export function leaveCalendarDays(start: string, end: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : NaN;
  };
  const first = parse(start), last = parse(end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return 0;
  return (last - first) / 86400000 + 1;
}