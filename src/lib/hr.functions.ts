import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { onboardingSchema } from "@/lib/hr-rules";

export type StaffOption = { id: string; full_name: string; onboarded: boolean };
export const hrStaffOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ facilityId: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("hr_staff_options" as never, { _facility: data.facilityId } as never);
    if (result.error) throw new Error("Staff accounts could not be loaded. HR setup requires an available database.");
    return (result.data ?? []) as unknown as StaffOption[];
  });

export const onboardEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => onboardingSchema.parse(value))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("hr_onboard_employee" as never, {
      _facility: data.facilityId, _user: data.userId, _position: data.position,
      _department: data.departmentId, _year: data.year,
      _quotas: data.quotas.map(q => ({ leave_type_id: q.leaveTypeId, days: q.days })),
    } as never);
    if (result.error) throw new Error(result.error.code === "P0001" ? result.error.message : "Employee was not saved. Check the HR database setup and try again.");
    return { ok: true };
  });

export const decideLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ facilityId: z.string().uuid(), id: z.string().uuid(), status: z.enum(["approved", "rejected", "clarification"]), comment: z.string().max(2000).default("") }).parse(value))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("hr_decide_leave" as never, { _facility: data.facilityId, _request: data.id, _status: data.status, _comment: data.comment } as never);
    if (result.error) throw new Error(result.error.code === "P0001" ? result.error.message : "Leave decision was not saved. Check the database connection and try again.");
    return { ok: true };
  });