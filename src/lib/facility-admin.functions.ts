import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const branchSchema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(2).max(150),
  code: z.string().trim().regex(/^[A-Z0-9-]{2,20}$/),
  facility_type: z.enum(["hospital", "clinic", "satellite"]),
  tier: z.enum(["starter", "pro", "enterprise"]),
  address: z.string().max(300), phone: z.string().max(50), email: z.union([z.string().email(), z.literal("")]),
  is_active: z.boolean(), settings: z.record(z.union([z.string(), z.number(), z.boolean(), z.record(z.boolean())])),
});

export const saveFacility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => branchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const check = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (check.error || !check.data) throw new Error("Administrator access required.");
    const { id, ...values } = data;
    const query = id ? context.supabase.from("facilities").update(values).eq("id", id) : context.supabase.from("facilities").insert(values);
    const result = await query.select("id").single();
    if (result.error) throw new Error(result.error.code === "23505" ? "Branch code already exists." : "Unable to save this facility.");
    return result.data;
  });

export const assignFacilityStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ facilityId: z.string().uuid(), userId: z.string().uuid(), role: z.string().min(1), remove: z.boolean().default(false) }).parse(input))
  .handler(async ({ data, context }) => {
    const check = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (check.error || !check.data) throw new Error("Administrator access required.");
    if (data.remove) {
      const result = await context.supabase.from("user_facilities").delete().eq("facility_id", data.facilityId).eq("user_id", data.userId);
      if (result.error) throw new Error("Unable to remove staff assignment.");
      return { ok: true };
    }
    const roles = await context.supabase.from("user_roles").select("role").eq("user_id", data.userId);
    const role = roles.data?.find((r) => r.role === data.role)?.role;
    if (roles.error || !role || role === "patient" || role === "athlete") throw new Error("Select an existing staff role for this account.");
    const result = await context.supabase.from("user_facilities").upsert({ facility_id: data.facilityId, user_id: data.userId, role }, { onConflict: "user_id,facility_id" });
    if (result.error) throw new Error("Unable to assign staff.");
    return { ok: true };
  });