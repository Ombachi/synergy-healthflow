import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEPARTMENT_ROLES } from "./facility-staff-rules";

export const listFacilityStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ facilityId: z.string().uuid(), page: z.number().int().min(1).max(10000) }).parse(input))
  .handler(async ({ data, context }) => {
    const own = await context.supabase.from("user_facilities").select("role")
      .eq("user_id", context.userId).eq("facility_id", data.facilityId).maybeSingle();
    if (own.error || own.data?.role !== "facility_admin") throw new Error("Facility administrator access required for this branch.");
    const members = await context.supabase.from("user_facilities").select("user_id, role, is_primary", { count: "exact" })
      .eq("facility_id", data.facilityId).order("created_at").order("user_id")
      .range((data.page - 1) * 25, data.page * 25 - 1);
    if (members.error) throw new Error("Unable to load branch staff. Check branch access and try again.");
    const rows = members.data ?? [];
    if (!rows.length) return { members: [], total: members.count ?? 0 };
    const profiles = await context.supabase.from("profiles").select("id, full_name")
      .in("id", rows.map((r) => r.user_id));
    if (profiles.error) throw new Error("Unable to load staff names. Check branch profile access and try again.");
    return {
      members: rows.map((r) => ({ ...r, full_name: profiles.data?.find((p) => p.id === r.user_id)?.full_name ?? "Staff member" })),
      total: members.count ?? 0,
    };
  });

export const setFacilityDepartmentRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ facilityId: z.string().uuid(), userId: z.string().uuid(), role: z.enum(DEPARTMENT_ROLES) }).parse(input))
  .handler(async ({ data, context }) => {
    // The RPC checks the caller and target memberships and changes only this branch.
    const result = await context.supabase.rpc("set_facility_department_role" as never, {
      _facility_id: data.facilityId, _user_id: data.userId, _role: data.role,
    } as never);
    if (result.error) {
      if (result.error.code === "PGRST202" || result.error.code === "42883") {
        throw new Error("Branch role assignment is not installed in this database. Apply the facility staff migration before saving roles.");
      }
      throw new Error("Role not saved. Only this branch's administrator can change existing departmental staff assignments.");
    }
    return { ok: true };
  });