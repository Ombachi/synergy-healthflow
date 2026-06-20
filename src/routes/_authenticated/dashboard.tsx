import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, ClipboardCheck, ClipboardList, FlaskConical, Package, Pill, Receipt, ScanLine, Shield, ShoppingCart, Users, Warehouse, Apple, Bandage, Dumbbell, Trophy, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ROLE_HOME } from "@/lib/role-permissions";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { roles, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Non-admin → jump to their portal immediately
  if (roles.length > 0 && !roles.includes("admin")) {
    const primary = (profile?.onboarded_as ?? roles[0]) as AppRole;
    const home = ROLE_HOME[primary];
    if (home) return <Navigate to={home} replace />;
  }

  // Admin → department analytics dashboards
  return <AdminAnalytics name={profile?.full_name ?? null} />;
}

function AdminAnalytics({ name }: { name: string | null }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administration overview</h1>
        <p className="text-sm text-muted-foreground">
          Welcome{name ? `, ${name}` : ""}. Department performance and operational metrics across LituCare.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AppointmentsCard />
        <ReceptionCard />
        <LabCard />
        <PharmacyCard />
        <RadiologyCard />
        <BillingCard />
        <InsuranceCard />
        <SportsCard />
        <CoachCard />
        <TeamMgrCard />
        <PhysioCard />
        <NutritionCard />
        <InventoryCard />
        <StoreCard />
        <ProcurementCard />
      </div>
    </div>
  );
}

// ---------- helpers ----------
function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d = new Date()) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
function startOfMonth(d = new Date()) { const x = startOfDay(d); x.setDate(1); return x; }
const moneyKES = (cents: number) => `KES ${(cents/100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function useCountRange(table: string, dateCol: string, since: Date | null, extra?: (q: ReturnType<typeof buildQuery>) => ReturnType<typeof buildQuery>) {
  return useQuery({
    queryKey: ["adm-count", table, dateCol, since?.toISOString() ?? "all"],
    queryFn: async () => {
      let q = buildQuery(table);
      if (since) q = q.gte(dateCol, since.toISOString());
      if (extra) q = extra(q);
      const { count } = await q;
      return count ?? 0;
    },
  });
}
function buildQuery(table: string) {
  return supabase.from(table as never).select("*", { count: "exact", head: true });
}

function Card({ title, icon: Icon, color, children }: { title: string; icon: typeof Activity; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2 font-semibold"><Icon className={`h-4 w-4 ${color}`} /> {title}</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">{children}</div>
    </div>
  );
}
function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ---------- department cards ----------
function AppointmentsCard() {
  const today = useCountRange("appointments", "scheduled_at", startOfDay());
  const week = useCountRange("appointments", "scheduled_at", startOfWeek());
  const month = useCountRange("appointments", "scheduled_at", startOfMonth());
  return <Card title="Appointments" icon={CalendarClock} color="text-sky-500">
    <Stat label="Today" value={today.data ?? "—"} />
    <Stat label="Week" value={week.data ?? "—"} />
    <Stat label="Month" value={month.data ?? "—"} />
  </Card>;
}
function ReceptionCard() {
  const checkedIn = useQuery({ queryKey: ["adm-checkedin"], queryFn: async () => {
    const { count } = await supabase.from("appointments" as never).select("*", { count:"exact", head:true }).eq("status","checked_in").gte("scheduled_at", startOfDay().toISOString());
    return count ?? 0;
  }});
  const waiting = useQuery({ queryKey: ["adm-waiting-triage"], queryFn: async () => {
    const { count } = await supabase.from("visit_queue" as never).select("*", { count:"exact", head:true }).eq("queue_type","triage").is("served_at", null);
    return count ?? 0;
  }});
  const todayPatients = useCountRange("patients", "created_at", startOfDay());
  return <Card title="Reception" icon={ClipboardCheck} color="text-violet-500">
    <Stat label="Checked in" value={checkedIn.data ?? "—"} />
    <Stat label="Waiting" value={waiting.data ?? "—"} />
    <Stat label="New patients" value={todayPatients.data ?? "—"} />
  </Card>;
}
function LabCard() {
  const pending = useQuery({ queryKey:["adm-lab-pending"], queryFn: async () => {
    const { count } = await supabase.from("lab_orders" as never).select("*",{count:"exact",head:true}).neq("status","resulted");
    return count ?? 0;
  }});
  const today = useCountRange("lab_orders", "created_at", startOfDay());
  const week = useCountRange("lab_orders", "created_at", startOfWeek());
  return <Card title="Laboratory" icon={FlaskConical} color="text-emerald-500">
    <Stat label="Pending" value={pending.data ?? "—"} />
    <Stat label="Today" value={today.data ?? "—"} />
    <Stat label="Week" value={week.data ?? "—"} />
  </Card>;
}
function PharmacyCard() {
  const pendingRx = useQuery({ queryKey:["adm-rx-pending"], queryFn: async () => {
    const { count } = await supabase.from("prescriptions" as never).select("*",{count:"exact",head:true});
    const { count: disp } = await supabase.from("pharmacy_dispenses" as never).select("*",{count:"exact",head:true});
    return Math.max(0, (count ?? 0) - (disp ?? 0));
  }});
  const dispToday = useCountRange("pharmacy_dispenses","dispensed_at", startOfDay());
  const dispWeek = useCountRange("pharmacy_dispenses","dispensed_at", startOfWeek());
  return <Card title="Pharmacy" icon={Pill} color="text-rose-500">
    <Stat label="Pending" value={pendingRx.data ?? "—"} />
    <Stat label="Disp. today" value={dispToday.data ?? "—"} />
    <Stat label="Week" value={dispWeek.data ?? "—"} />
  </Card>;
}
function RadiologyCard() {
  const pending = useQuery({ queryKey:["adm-img-pending"], queryFn: async () => {
    const { count } = await supabase.from("imaging_orders" as never).select("*",{count:"exact",head:true}).neq("status","reported");
    return count ?? 0;
  }});
  const today = useCountRange("imaging_orders","created_at", startOfDay());
  const week = useCountRange("imaging_orders","created_at", startOfWeek());
  return <Card title="Radiology" icon={ScanLine} color="text-amber-500">
    <Stat label="Pending" value={pending.data ?? "—"} />
    <Stat label="Today" value={today.data ?? "—"} />
    <Stat label="Week" value={week.data ?? "—"} />
  </Card>;
}
function BillingCard() {
  const rev = useQuery({ queryKey:["adm-rev-today"], queryFn: async () => {
    const { data } = await supabase.from("payments" as never).select("amount_cents, received_at").gte("received_at", startOfDay().toISOString());
    return (data as { amount_cents: number }[] | null ?? []).reduce((s,p)=>s+p.amount_cents,0);
  }});
  const revWeek = useQuery({ queryKey:["adm-rev-week"], queryFn: async () => {
    const { data } = await supabase.from("payments" as never).select("amount_cents, received_at").gte("received_at", startOfWeek().toISOString());
    return (data as { amount_cents: number }[] | null ?? []).reduce((s,p)=>s+p.amount_cents,0);
  }});
  const outstanding = useQuery({ queryKey:["adm-outstanding"], queryFn: async () => {
    const { data } = await supabase.from("invoices" as never).select("total_cents, paid_cents").neq("status","paid").neq("status","void");
    return (data as { total_cents:number; paid_cents:number }[] | null ?? []).reduce((s,i)=>s+(i.total_cents-i.paid_cents),0);
  }});
  return <Card title="Billing" icon={Receipt} color="text-blue-500">
    <Stat label="Today" value={moneyKES(rev.data ?? 0)} />
    <Stat label="Week" value={moneyKES(revWeek.data ?? 0)} />
    <Stat label="Outstanding" value={moneyKES(outstanding.data ?? 0)} />
  </Card>;
}
function InsuranceCard() {
  const pending = useQuery({ queryKey:["adm-ins-pending"], queryFn: async () => {
    const { count } = await supabase.from("insurance_claims" as never).select("*",{count:"exact",head:true}).eq("status","submitted");
    return count ?? 0;
  }});
  const approved = useQuery({ queryKey:["adm-ins-approved"], queryFn: async () => {
    const { count } = await supabase.from("insurance_claims" as never).select("*",{count:"exact",head:true}).eq("status","approved");
    return count ?? 0;
  }});
  const total = useCountRange("insurance_claims", "created_at", null);
  return <Card title="Insurance" icon={Shield} color="text-indigo-500">
    <Stat label="Pending" value={pending.data ?? "—"} />
    <Stat label="Approved" value={approved.data ?? "—"} />
    <Stat label="Total" value={total.data ?? "—"} />
  </Card>;
}
function SportsCard() {
  const athletes = useCountRange("athletes", "created_at", null);
  const injured = useQuery({ queryKey:["adm-injured"], queryFn: async () => {
    const { count } = await supabase.from("athletes" as never).select("*",{count:"exact",head:true}).eq("status","injured");
    return count ?? 0;
  }});
  const cleared = useQuery({ queryKey:["adm-cleared"], queryFn: async () => {
    const { count } = await supabase.from("athletes" as never).select("*",{count:"exact",head:true}).eq("status","cleared");
    return count ?? 0;
  }});
  return <Card title="Sports & Athletes" icon={Activity} color="text-teal-500">
    <Stat label="Roster" value={athletes.data ?? "—"} />
    <Stat label="Injured" value={injured.data ?? "—"} />
    <Stat label="Cleared" value={cleared.data ?? "—"} />
  </Card>;
}
function CoachCard() {
  const sessions = useCountRange("training_sessions", "created_at", startOfWeek());
  const plans = useCountRange("training_plans", "created_at", null);
  const attendance = useCountRange("attendance", "created_at", startOfWeek());
  return <Card title="Coach" icon={Dumbbell} color="text-orange-500">
    <Stat label="Sessions/wk" value={sessions.data ?? "—"} />
    <Stat label="Plans" value={plans.data ?? "—"} />
    <Stat label="Attendance" value={attendance.data ?? "—"} />
  </Card>;
}
function TeamMgrCard() {
  const teams = useCountRange("teams", "created_at", null);
  const members = useCountRange("team_members", "created_at", null);
  const comps = useCountRange("competitions", "created_at", startOfMonth());
  return <Card title="Team Manager" icon={Trophy} color="text-yellow-500">
    <Stat label="Teams" value={teams.data ?? "—"} />
    <Stat label="Members" value={members.data ?? "—"} />
    <Stat label="Comps/mo" value={comps.data ?? "—"} />
  </Card>;
}
function PhysioCard() {
  const treatments = useCountRange("treatment_plans","created_at", null);
  const recovery = useCountRange("recovery_sessions","created_at", startOfWeek());
  const clear = useCountRange("clearance_records","created_at", startOfMonth());
  return <Card title="Physiotherapy" icon={Bandage} color="text-pink-500">
    <Stat label="Plans" value={treatments.data ?? "—"} />
    <Stat label="Sessions/wk" value={recovery.data ?? "—"} />
    <Stat label="Clearances" value={clear.data ?? "—"} />
  </Card>;
}
function NutritionCard() {
  const plans = useCountRange("nutrition_plans","created_at", null);
  const week = useCountRange("nutrition_plans","created_at", startOfWeek());
  const month = useCountRange("nutrition_plans","created_at", startOfMonth());
  return <Card title="Nutrition" icon={Apple} color="text-emerald-600">
    <Stat label="Total" value={plans.data ?? "—"} />
    <Stat label="Week" value={week.data ?? "—"} />
    <Stat label="Month" value={month.data ?? "—"} />
  </Card>;
}
function InventoryCard() {
  const items = useCountRange("inventory_items","created_at", null);
  const low = useQuery({ queryKey:["adm-lowstock"], queryFn: async () => {
    const { data } = await supabase.from("inventory_items" as never).select("quantity, reorder_threshold");
    return ((data as { quantity:number; reorder_threshold:number }[] | null) ?? []).filter(i => i.quantity <= i.reorder_threshold).length;
  }});
  const value = useQuery({ queryKey:["adm-invvalue"], queryFn: async () => {
    const { data } = await supabase.from("stock_batches" as never).select("qty_on_hand, cost_cents");
    return ((data as { qty_on_hand:number; cost_cents:number }[] | null) ?? []).reduce((s,b)=>s+b.qty_on_hand*b.cost_cents,0);
  }});
  return <Card title="Inventory" icon={Package} color="text-amber-600">
    <Stat label="Items" value={items.data ?? "—"} />
    <Stat label="Low stock" value={low.data ?? "—"} />
    <Stat label="Value" value={moneyKES(value.data ?? 0)} />
  </Card>;
}
function StoreCard() {
  const pending = useQuery({ queryKey:["adm-store-req"], queryFn: async () => {
    const { count } = await supabase.from("stock_requests" as never).select("*",{count:"exact",head:true}).eq("status","pending");
    return count ?? 0;
  }});
  const fulfilled = useQuery({ queryKey:["adm-store-fulfilled"], queryFn: async () => {
    const { count } = await supabase.from("stock_requests" as never).select("*",{count:"exact",head:true}).eq("status","fulfilled").gte("created_at", startOfWeek().toISOString());
    return count ?? 0;
  }});
  const grns = useCountRange("goods_received_notes","created_at", startOfMonth());
  return <Card title="Central Store" icon={Warehouse} color="text-stone-600">
    <Stat label="Pending req" value={pending.data ?? "—"} />
    <Stat label="Fulfilled/wk" value={fulfilled.data ?? "—"} />
    <Stat label="GRNs/mo" value={grns.data ?? "—"} />
  </Card>;
}
function ProcurementCard() {
  const open = useQuery({ queryKey:["adm-po-open"], queryFn: async () => {
    const { count } = await supabase.from("purchase_orders" as never).select("*",{count:"exact",head:true}).neq("status","closed");
    return count ?? 0;
  }});
  const month = useCountRange("purchase_orders","created_at", startOfMonth());
  const suppliers = useCountRange("suppliers","created_at", null);
  return <Card title="Procurement" icon={ShoppingCart} color="text-cyan-600">
    <Stat label="Open POs" value={open.data ?? "—"} />
    <Stat label="POs/mo" value={month.data ?? "—"} />
    <Stat label="Suppliers" value={suppliers.data ?? "—"} />
  </Card>;
}

// keep eslint happy on imports used only in type/icon refs
export { ClipboardList, Users };
