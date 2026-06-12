import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEMO_USERS: { email: string; full_name: string; role: string }[] = [
  { email: "nurse@demo.local", full_name: "Nina Nurse", role: "nurse" },
  { email: "doctor@demo.local", full_name: "Dr. Dan Doctor", role: "doctor" },
  { email: "store@demo.local", full_name: "Sam Store Manager", role: "admin" },
  { email: "coach@demo.local", full_name: "Casey Coach", role: "coach" },
  { email: "patient@demo.local", full_name: "Pat Patient", role: "patient" },
  { email: "pharmacist@demo.local", full_name: "Phil Pharmacist", role: "pharmacist" },
  { email: "lab@demo.local", full_name: "Lara Lab Scientist", role: "lab_tech" },
  { email: "radiologist@demo.local", full_name: "Riya Radiologist", role: "radiologist" },
];

const DEMO_PASSWORD = "Demo123!";

export const seedDemoUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: { email: string; status: string; role: string }[] = [];

    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const byEmail = new Map(existing.users.map((u) => [u.email?.toLowerCase(), u.id]));

    for (const u of DEMO_USERS) {
      let userId = byEmail.get(u.email);
      let status = "exists";
      if (!userId) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: u.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: u.full_name },
        });
        if (error || !data.user) {
          results.push({ email: u.email, status: "error: " + (error?.message ?? "unknown"), role: u.role });
          continue;
        }
        userId = data.user.id;
        status = "created";
      }
      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        full_name: u.full_name,
        onboarded: true,
        onboarded_as: u.role as any,
      });
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: u.role as any });
      results.push({ email: u.email, status, role: u.role });
    }

    return { password: DEMO_PASSWORD, results };
  });
