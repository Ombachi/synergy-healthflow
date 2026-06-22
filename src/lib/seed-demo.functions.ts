import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEMO_USERS: { email: string; full_name: string; role: string }[] = [
  { email: "nurse@demo.local", full_name: "Nina Nurse", role: "nurse" },
  { email: "doctor@demo.local", full_name: "Dr. Dan Doctor", role: "doctor" },
  { email: "admin@demo.local", full_name: "Ada Admin", role: "admin" },
  { email: "store@demo.local", full_name: "Sam Store Keeper", role: "store_keeper" },
  { email: "coach@demo.local", full_name: "Casey Coach", role: "coach" },
  { email: "patient@demo.local", full_name: "Pat Patient", role: "patient" },
  { email: "pharmacist@demo.local", full_name: "Phil Pharmacist", role: "pharmacist" },
  { email: "lab@demo.local", full_name: "Lara Lab Scientist", role: "lab_tech" },
  { email: "radiologist@demo.local", full_name: "Riya Radiologist", role: "radiologist" },
  { email: "receptionist@demo.local", full_name: "Rita Receptionist", role: "receptionist" },
  { email: "billing@demo.local", full_name: "Bea Billing Officer", role: "billing_officer" },
  { email: "insurance@demo.local", full_name: "Ivan Insurance Officer", role: "insurance_officer" },
  { email: "physio@demo.local", full_name: "Pam Physio", role: "physio" },
  { email: "nutritionist@demo.local", full_name: "Nora Nutritionist", role: "nutritionist" },
  { email: "procurement@demo.local", full_name: "Pete Procurement", role: "procurement" },
];

function generateDemoPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const base = Array.from(bytes, (b) => b.toString(36)).join("").slice(0, 20);
  return base + "A1!";
}

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
        onboarded_as: u.role as never,
      });
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: u.role as never });
      results.push({ email: u.email, status, role: u.role });
    }

    return { password: DEMO_PASSWORD, results };
  });
