import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, ClipboardList, Heart, MessageSquare, Package, Shield, Stethoscope, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { MyActivePatients } from "@/components/my-active-patients";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function useCount(table: string, enabled = true) {
  return useQuery({
    queryKey: ["count", table],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase.from(table as never).select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

const PORTAL_TITLES: Record<AppRole, string> = {
  admin: "Admin portal",
  doctor: "Doctor portal",
  nurse: "Nurse portal",
  coach: "Coach portal",
  patient: "My health",
  athlete: "Athlete portal",
  lab_tech: "Laboratory portal",
  pharmacist: "Pharmacy portal",
  radiologist: "Radiology portal",
};

function Dashboard() {
  const { roles, profile } = useAuth();
  const primary: AppRole = (profile?.onboarded_as ?? roles[0] ?? "patient") as AppRole;
  const isClinical = roles.some((r) => ["doctor","nurse","admin"].includes(r));

  const patients = useCount("patients", isClinical);
  const athletes = useCount("athletes", roles.some((r) => ["coach","admin"].includes(r)));
  const inventory = useCount("inventory_items", roles.includes("admin"));
  const visits = useCount("visits", isClinical);

  const myUnread = useQuery({
    queryKey: ["my-threads-count"],
    queryFn: async () => {
      const { count } = await supabase.from("message_threads" as never).select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const quickLinks = buildLinks(roles);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{PORTAL_TITLES[primary]}</h1>
        <p className="text-sm text-muted-foreground">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}. Here's your tailored overview.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isClinical && <Stat title="Patients" value={patients.data ?? "—"} icon={Heart} color="text-rose-500" />}
        {isClinical && <Stat title="Visits" value={visits.data ?? "—"} icon={ClipboardList} color="text-sky-500" />}
        {roles.some((r) => ["coach","admin"].includes(r)) && <Stat title="Athletes" value={athletes.data ?? "—"} icon={Activity} color="text-emerald-500" />}
        {roles.includes("admin") && <Stat title="Inventory items" value={inventory.data ?? "—"} icon={Package} color="text-amber-500" />}
        <Stat title="Conversations" value={myUnread.data ?? "—"} icon={MessageSquare} color="text-violet-500" />
      </div>

      <MyActivePatients />

      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-medium">Quick actions</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((l) => (
            <Link key={l.to} to={l.to} className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent">
              <l.icon className="h-4 w-4 text-primary" />
              <div>
                <div className="font-medium">{l.label}</div>
                <div className="text-xs text-muted-foreground">{l.blurb}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ title, value, icon: Icon, color }: { title: string; value: number | string; icon: typeof Heart; color: string }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{title}</div>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function buildLinks(roles: AppRole[]) {
  const has = (r: AppRole) => roles.includes(r);
  const any = (rs: AppRole[]) => rs.some(has);
  const links: { to: string; label: string; blurb: string; icon: typeof Heart }[] = [];

  if (any(["doctor","nurse","admin"])) {
    links.push({ to: "/visits", label: "Open visits", blurb: "Triage, vitals, diagnosis", icon: ClipboardList });
    links.push({ to: "/medical", label: "Patient records", blurb: "Browse the EHR", icon: Heart });
    links.push({ to: "/audit", label: "Audit log", blurb: "Track who changed what", icon: Shield });
  }
  if (any(["coach","admin"])) links.push({ to: "/sports", label: "Athletes", blurb: "Team roster & injuries", icon: Activity });
  if (has("admin")) {
    links.push({ to: "/inventory", label: "Inventory", blurb: "Stock & supplies", icon: Package });
    links.push({ to: "/team", label: "Team & roles", blurb: "Grant or revoke access", icon: Users });
  }
  if (any(["patient","athlete"])) links.push({ to: "/me", label: "My health", blurb: "Visits & vitals trends", icon: Stethoscope });
  if (!roles.length) links.push({ to: "/onboarding", label: "Finish onboarding", blurb: "Complete your profile", icon: UserPlus });

  links.push({ to: "/messages", label: "Messages", blurb: "Talk to your care team", icon: MessageSquare });
  return links;
}
