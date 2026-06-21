import { createFileRoute, Link, Navigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/department/$dept")({
  component: DepartmentDetail,
});

type DeptKey =
  | "appointments" | "reception" | "lab" | "pharmacy" | "radiology"
  | "billing" | "insurance" | "sports" | "coach" | "team-manager"
  | "physio" | "nutrition" | "inventory" | "store" | "procurement";

const TITLES: Record<DeptKey, string> = {
  appointments: "Appointments",
  reception: "Reception",
  lab: "Laboratory",
  pharmacy: "Pharmacy",
  radiology: "Radiology",
  billing: "Billing",
  insurance: "Insurance",
  sports: "Sports & Athletes",
  coach: "Coach",
  "team-manager": "Team Manager",
  physio: "Physiotherapy",
  nutrition: "Nutrition",
  inventory: "Inventory",
  store: "Central Store",
  procurement: "Procurement",
};

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d = new Date()) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
function startOfMonth(d = new Date()) { const x = startOfDay(d); x.setDate(1); return x; }
const moneyKES = (cents: number) => `KES ${(cents/100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const SUMMARY: Record<DeptKey, { table: string; dateCol: string; pending: string[]; approved: string[]; revenueRef?: string }> = {
  appointments: { table: "appointments", dateCol: "scheduled_at", pending: ["booked"], approved: ["checked_in", "completed"] },
  reception: { table: "visit_queue", dateCol: "entered_at", pending: ["triage"], approved: ["doctor"] },
  lab: { table: "lab_orders", dateCol: "created_at", pending: ["ordered", "collected", "processing"], approved: ["resulted"], revenueRef: "lab_orders" },
  pharmacy: { table: "prescriptions", dateCol: "created_at", pending: ["ordered", "pending"], approved: ["dispensed", "filled"], revenueRef: "prescriptions" },
  radiology: { table: "imaging_orders", dateCol: "created_at", pending: ["ordered", "in_progress"], approved: ["reported"], revenueRef: "imaging_orders" },
  billing: { table: "invoices", dateCol: "created_at", pending: ["draft", "issued", "partial"], approved: ["paid"] },
  insurance: { table: "insurance_claims", dateCol: "created_at", pending: ["submitted"], approved: ["approved"] },
  sports: { table: "athletes", dateCol: "created_at", pending: ["injured"], approved: ["cleared"] },
  coach: { table: "training_plans", dateCol: "created_at", pending: ["draft"], approved: ["active", "completed"] },
  "team-manager": { table: "teams", dateCol: "created_at", pending: ["pending"], approved: ["active"] },
  physio: { table: "treatment_plans", dateCol: "created_at", pending: ["active"], approved: ["completed"] },
  nutrition: { table: "nutrition_plans", dateCol: "created_at", pending: ["draft"], approved: ["issued", "active"] },
  inventory: { table: "inventory_items", dateCol: "created_at", pending: ["low_stock"], approved: ["active"] },
  store: { table: "stock_requests", dateCol: "created_at", pending: ["pending"], approved: ["approved", "fulfilled"] },
  procurement: { table: "purchase_orders", dateCol: "created_at", pending: ["open", "pending", "approved"], approved: ["closed", "fulfilled"] },
};

function DepartmentDetail() {
  const { roles, loading } = useAuth();
  const { dept } = useParams({ from: "/_authenticated/department/$dept" });
  const key = dept as DeptKey;

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }
  if (!roles.includes("admin")) return <Navigate to="/dashboard" replace />;
  if (!TITLES[key]) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to="/dashboard"><ArrowLeft className="mr-1 h-4 w-4" /> Back to overview</Link>
          </Button>
          <h1 className="text-2xl font-semibold">{TITLES[key]} — Department Performance</h1>
          <p className="text-sm text-muted-foreground">Operational metrics and workload for the {TITLES[key].toLowerCase()} department.</p>
        </div>
      </div>
      <DepartmentSummary dept={key} />
      <DeptMetrics dept={key} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="mb-3 border-b pb-2 font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}
function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded border bg-background p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function useCount(key: string, fn: () => Promise<number>) {
  return useQuery({ queryKey: ["dept", key], queryFn: fn });
}

function DeptMetrics({ dept }: { dept: DeptKey }) {
  switch (dept) {
    case "radiology": return <RadiologyMetrics />;
    case "lab": return <LabMetrics />;
    case "pharmacy": return <PharmacyMetrics />;
    case "billing": return <BillingMetrics />;
    case "insurance": return <InsuranceMetrics />;
    case "appointments": return <AppointmentsMetrics />;
    case "reception": return <ReceptionMetrics />;
    case "sports": return <SportsMetrics />;
    case "coach": return <CoachMetrics />;
    case "team-manager": return <TeamMgrMetrics />;
    case "physio": return <PhysioMetrics />;
    case "nutrition": return <NutritionMetrics />;
    case "inventory": return <InventoryMetrics />;
    case "store": return <StoreMetrics />;
    case "procurement": return <ProcurementMetrics />;
  }
}

async function countSimple(table: string, build?: (q: ReturnType<typeof base>) => ReturnType<typeof base>): Promise<number> {
  let q = base(table);
  if (build) q = build(q);
  const { count } = await q;
  return count ?? 0;
}
function base(table: string) {
  return supabase.from(table as never).select("*", { count: "exact", head: true });
}

function RadiologyMetrics() {
  const pending = useCount("rad-pending", () => countSimple("imaging_orders", q => q.eq("status", "ordered")));
  const inProgress = useCount("rad-inprog", () => countSimple("imaging_orders", q => q.eq("status", "in_progress")));
  const reported = useCount("rad-reported", () => countSimple("imaging_orders", q => q.eq("status", "reported")));
  const total = useCount("rad-total", () => countSimple("imaging_orders"));
  const today = useCount("rad-today", () => countSimple("imaging_orders", q => q.gte("created_at", startOfDay().toISOString())));
  const week = useCount("rad-week", () => countSimple("imaging_orders", q => q.gte("created_at", startOfWeek().toISOString())));
  const month = useCount("rad-month", () => countSimple("imaging_orders", q => q.gte("created_at", startOfMonth().toISOString())));
  return (
    <>
      <Section title="Order status">
        <Stat label="Pending" value={pending.data ?? "—"} sub="Awaiting acquisition" />
        <Stat label="In progress" value={inProgress.data ?? "—"} sub="Being acquired/read" />
        <Stat label="Reported" value={reported.data ?? "—"} sub="Released to doctor" />
        <Stat label="Total" value={total.data ?? "—"} sub="All-time orders" />
      </Section>
      <Section title="Throughput">
        <Stat label="Today" value={today.data ?? "—"} />
        <Stat label="This week" value={week.data ?? "—"} />
        <Stat label="This month" value={month.data ?? "—"} />
      </Section>
    </>
  );
}

function LabMetrics() {
  const pending = useCount("lab-pending", () => countSimple("lab_orders", q => q.neq("status", "resulted")));
  const resulted = useCount("lab-resulted", () => countSimple("lab_orders", q => q.eq("status", "resulted")));
  const total = useCount("lab-total", () => countSimple("lab_orders"));
  const samples = useCount("lab-samples", () => countSimple("lab_samples"));
  const today = useCount("lab-today", () => countSimple("lab_orders", q => q.gte("created_at", startOfDay().toISOString())));
  const week = useCount("lab-week", () => countSimple("lab_orders", q => q.gte("created_at", startOfWeek().toISOString())));
  const month = useCount("lab-month", () => countSimple("lab_orders", q => q.gte("created_at", startOfMonth().toISOString())));
  return (
    <>
      <Section title="Order status">
        <Stat label="Pending" value={pending.data ?? "—"} />
        <Stat label="Resulted" value={resulted.data ?? "—"} />
        <Stat label="Total" value={total.data ?? "—"} />
        <Stat label="Samples" value={samples.data ?? "—"} />
      </Section>
      <Section title="Throughput">
        <Stat label="Today" value={today.data ?? "—"} />
        <Stat label="This week" value={week.data ?? "—"} />
        <Stat label="This month" value={month.data ?? "—"} />
      </Section>
    </>
  );
}

function PharmacyMetrics() {
  const rx = useCount("rx-total", () => countSimple("prescriptions"));
  const disp = useCount("rx-disp", () => countSimple("pharmacy_dispenses"));
  const today = useCount("rx-today", () => countSimple("pharmacy_dispenses", q => q.gte("dispensed_at", startOfDay().toISOString())));
  const week = useCount("rx-week", () => countSimple("pharmacy_dispenses", q => q.gte("dispensed_at", startOfWeek().toISOString())));
  const month = useCount("rx-month", () => countSimple("pharmacy_dispenses", q => q.gte("dispensed_at", startOfMonth().toISOString())));
  const pending = (rx.data ?? 0) - (disp.data ?? 0);
  return (
    <>
      <Section title="Prescriptions">
        <Stat label="Pending" value={Math.max(0, pending)} />
        <Stat label="Dispensed" value={disp.data ?? "—"} />
        <Stat label="Total Rx" value={rx.data ?? "—"} />
      </Section>
      <Section title="Throughput">
        <Stat label="Today" value={today.data ?? "—"} />
        <Stat label="This week" value={week.data ?? "—"} />
        <Stat label="This month" value={month.data ?? "—"} />
      </Section>
    </>
  );
}

function BillingMetrics() {
  const today = useQuery({ queryKey:["bill-today"], queryFn: async () => {
    const { data } = await supabase.from("payments" as never).select("amount_cents, received_at").gte("received_at", startOfDay().toISOString());
    return (data as { amount_cents:number }[] | null ?? []).reduce((s,p)=>s+p.amount_cents,0);
  }});
  const week = useQuery({ queryKey:["bill-week"], queryFn: async () => {
    const { data } = await supabase.from("payments" as never).select("amount_cents, received_at").gte("received_at", startOfWeek().toISOString());
    return (data as { amount_cents:number }[] | null ?? []).reduce((s,p)=>s+p.amount_cents,0);
  }});
  const month = useQuery({ queryKey:["bill-month"], queryFn: async () => {
    const { data } = await supabase.from("payments" as never).select("amount_cents, received_at").gte("received_at", startOfMonth().toISOString());
    return (data as { amount_cents:number }[] | null ?? []).reduce((s,p)=>s+p.amount_cents,0);
  }});
  const outstanding = useQuery({ queryKey:["bill-out"], queryFn: async () => {
    const { data } = await supabase.from("invoices" as never).select("total_cents, paid_cents, status");
    return (data as { total_cents:number; paid_cents:number; status:string }[] | null ?? [])
      .filter(i => i.status !== "paid" && i.status !== "void")
      .reduce((s,i)=>s+(i.total_cents-i.paid_cents),0);
  }});
  const invCount = useCount("bill-inv", () => countSimple("invoices"));
  const paidCount = useCount("bill-paid-c", () => countSimple("invoices", q => q.eq("status","paid")));
  const pendingCount = useCount("bill-pend-c", () => countSimple("invoices", q => q.neq("status","paid").neq("status","void")));
  return (
    <>
      <Section title="Revenue">
        <Stat label="Today" value={moneyKES(today.data ?? 0)} />
        <Stat label="This week" value={moneyKES(week.data ?? 0)} />
        <Stat label="This month" value={moneyKES(month.data ?? 0)} />
        <Stat label="Outstanding" value={moneyKES(outstanding.data ?? 0)} />
      </Section>
      <Section title="Invoices">
        <Stat label="Total" value={invCount.data ?? "—"} />
        <Stat label="Paid" value={paidCount.data ?? "—"} />
        <Stat label="Pending" value={pendingCount.data ?? "—"} />
      </Section>
    </>
  );
}

function InsuranceMetrics() {
  const pending = useCount("ins-pending", () => countSimple("insurance_claims", q => q.eq("status","submitted")));
  const approved = useCount("ins-app", () => countSimple("insurance_claims", q => q.eq("status","approved")));
  const rejected = useCount("ins-rej", () => countSimple("insurance_claims", q => q.eq("status","rejected")));
  const total = useCount("ins-total", () => countSimple("insurance_claims"));
  const policies = useCount("ins-pol", () => countSimple("insurance_policies"));
  return (
    <>
      <Section title="Claims">
        <Stat label="Pending" value={pending.data ?? "—"} />
        <Stat label="Approved" value={approved.data ?? "—"} />
        <Stat label="Rejected" value={rejected.data ?? "—"} />
        <Stat label="Total" value={total.data ?? "—"} />
      </Section>
      <Section title="Coverage">
        <Stat label="Active policies" value={policies.data ?? "—"} />
      </Section>
    </>
  );
}

function AppointmentsMetrics() {
  const today = useCount("ap-today", () => countSimple("appointments", q => q.gte("scheduled_at", startOfDay().toISOString())));
  const week = useCount("ap-week", () => countSimple("appointments", q => q.gte("scheduled_at", startOfWeek().toISOString())));
  const month = useCount("ap-month", () => countSimple("appointments", q => q.gte("scheduled_at", startOfMonth().toISOString())));
  const checkedIn = useCount("ap-ci", () => countSimple("appointments", q => q.eq("status","checked_in")));
  const completed = useCount("ap-comp", () => countSimple("appointments", q => q.eq("status","completed")));
  const cancelled = useCount("ap-canc", () => countSimple("appointments", q => q.eq("status","cancelled")));
  return (
    <>
      <Section title="Schedule">
        <Stat label="Today" value={today.data ?? "—"} />
        <Stat label="This week" value={week.data ?? "—"} />
        <Stat label="This month" value={month.data ?? "—"} />
      </Section>
      <Section title="Status">
        <Stat label="Checked in" value={checkedIn.data ?? "—"} />
        <Stat label="Completed" value={completed.data ?? "—"} />
        <Stat label="Cancelled" value={cancelled.data ?? "—"} />
      </Section>
    </>
  );
}

function ReceptionMetrics() {
  const newToday = useCount("rec-new", () => countSimple("patients", q => q.gte("created_at", startOfDay().toISOString())));
  const newWeek = useCount("rec-newW", () => countSimple("patients", q => q.gte("created_at", startOfWeek().toISOString())));
  const total = useCount("rec-tot", () => countSimple("patients"));
  const triageQ = useCount("rec-tq", () => countSimple("visit_queue", q => q.eq("queue_type","triage").is("served_at", null)));
  return (
    <>
      <Section title="Patients">
        <Stat label="New today" value={newToday.data ?? "—"} />
        <Stat label="New this week" value={newWeek.data ?? "—"} />
        <Stat label="Total registered" value={total.data ?? "—"} />
      </Section>
      <Section title="Queue">
        <Stat label="Waiting for triage" value={triageQ.data ?? "—"} />
      </Section>
    </>
  );
}

function SportsMetrics() {
  const roster = useCount("sp-roster", () => countSimple("athletes"));
  const injured = useCount("sp-inj", () => countSimple("athletes", q => q.eq("status","injured")));
  const cleared = useCount("sp-cl", () => countSimple("athletes", q => q.eq("status","cleared")));
  const injuries = useCount("sp-injuries", () => countSimple("injuries"));
  return (
    <Section title="Athletes">
      <Stat label="Total roster" value={roster.data ?? "—"} />
      <Stat label="Injured" value={injured.data ?? "—"} />
      <Stat label="Cleared" value={cleared.data ?? "—"} />
      <Stat label="Injury records" value={injuries.data ?? "—"} />
    </Section>
  );
}

function CoachMetrics() {
  const plans = useCount("co-plans", () => countSimple("training_plans"));
  const sessionsW = useCount("co-sw", () => countSimple("training_sessions", q => q.gte("created_at", startOfWeek().toISOString())));
  const sessionsM = useCount("co-sm", () => countSimple("training_sessions", q => q.gte("created_at", startOfMonth().toISOString())));
  const attendance = useCount("co-att", () => countSimple("attendance", q => q.gte("created_at", startOfWeek().toISOString())));
  return (
    <Section title="Training">
      <Stat label="Plans" value={plans.data ?? "—"} />
      <Stat label="Sessions / week" value={sessionsW.data ?? "—"} />
      <Stat label="Sessions / month" value={sessionsM.data ?? "—"} />
      <Stat label="Attendance / week" value={attendance.data ?? "—"} />
    </Section>
  );
}

function TeamMgrMetrics() {
  const teams = useCount("tm-t", () => countSimple("teams"));
  const members = useCount("tm-m", () => countSimple("team_members"));
  const compsW = useCount("tm-cw", () => countSimple("competitions", q => q.gte("created_at", startOfWeek().toISOString())));
  const compsM = useCount("tm-cm", () => countSimple("competitions", q => q.gte("created_at", startOfMonth().toISOString())));
  return (
    <Section title="Teams">
      <Stat label="Teams" value={teams.data ?? "—"} />
      <Stat label="Members" value={members.data ?? "—"} />
      <Stat label="Competitions / week" value={compsW.data ?? "—"} />
      <Stat label="Competitions / month" value={compsM.data ?? "—"} />
    </Section>
  );
}

function PhysioMetrics() {
  const plans = useCount("ph-plans", () => countSimple("treatment_plans"));
  const sessions = useCount("ph-s", () => countSimple("recovery_sessions", q => q.gte("created_at", startOfWeek().toISOString())));
  const sessionsM = useCount("ph-sm", () => countSimple("recovery_sessions", q => q.gte("created_at", startOfMonth().toISOString())));
  const clear = useCount("ph-cl", () => countSimple("clearance_records", q => q.gte("created_at", startOfMonth().toISOString())));
  return (
    <Section title="Physiotherapy">
      <Stat label="Treatment plans" value={plans.data ?? "—"} />
      <Stat label="Sessions / week" value={sessions.data ?? "—"} />
      <Stat label="Sessions / month" value={sessionsM.data ?? "—"} />
      <Stat label="Clearances / month" value={clear.data ?? "—"} />
    </Section>
  );
}

function NutritionMetrics() {
  const total = useCount("nu-t", () => countSimple("nutrition_plans"));
  const week = useCount("nu-w", () => countSimple("nutrition_plans", q => q.gte("created_at", startOfWeek().toISOString())));
  const month = useCount("nu-m", () => countSimple("nutrition_plans", q => q.gte("created_at", startOfMonth().toISOString())));
  const today = useCount("nu-d", () => countSimple("nutrition_plans", q => q.gte("created_at", startOfDay().toISOString())));
  return (
    <Section title="Nutrition plans">
      <Stat label="Today" value={today.data ?? "—"} />
      <Stat label="This week" value={week.data ?? "—"} />
      <Stat label="This month" value={month.data ?? "—"} />
      <Stat label="All-time" value={total.data ?? "—"} />
    </Section>
  );
}

function InventoryMetrics() {
  const items = useCount("inv-items", () => countSimple("inventory_items"));
  const cats = useCount("inv-cats", () => countSimple("item_categories"));
  const low = useQuery({ queryKey:["inv-low"], queryFn: async () => {
    const { data } = await supabase.from("inventory_items" as never).select("quantity, reorder_threshold");
    return ((data as { quantity:number; reorder_threshold:number }[] | null) ?? []).filter(i => i.quantity <= i.reorder_threshold).length;
  }});
  const value = useQuery({ queryKey:["inv-val"], queryFn: async () => {
    const { data } = await supabase.from("stock_batches" as never).select("qty_on_hand, cost_cents");
    return ((data as { qty_on_hand:number; cost_cents:number }[] | null) ?? []).reduce((s,b)=>s+b.qty_on_hand*b.cost_cents,0);
  }});
  return (
    <Section title="Inventory">
      <Stat label="Items" value={items.data ?? "—"} />
      <Stat label="Categories" value={cats.data ?? "—"} />
      <Stat label="Low stock" value={low.data ?? "—"} />
      <Stat label="Stock value" value={moneyKES(value.data ?? 0)} />
    </Section>
  );
}

function StoreMetrics() {
  const pending = useCount("st-p", () => countSimple("stock_requests", q => q.eq("status","pending")));
  const approved = useCount("st-a", () => countSimple("stock_requests", q => q.eq("status","approved")));
  const fulfilled = useCount("st-f", () => countSimple("stock_requests", q => q.eq("status","fulfilled")));
  const rejected = useCount("st-r", () => countSimple("stock_requests", q => q.eq("status","rejected")));
  const grnsM = useCount("st-grn", () => countSimple("goods_received_notes", q => q.gte("created_at", startOfMonth().toISOString())));
  const locs = useCount("st-loc", () => countSimple("stock_locations"));
  return (
    <>
      <Section title="Stock requests">
        <Stat label="Pending" value={pending.data ?? "—"} />
        <Stat label="Approved" value={approved.data ?? "—"} />
        <Stat label="Fulfilled" value={fulfilled.data ?? "—"} />
        <Stat label="Rejected" value={rejected.data ?? "—"} />
      </Section>
      <Section title="Operations">
        <Stat label="GRNs this month" value={grnsM.data ?? "—"} />
        <Stat label="Stock locations" value={locs.data ?? "—"} />
      </Section>
    </>
  );
}

function ProcurementMetrics() {
  const open = useCount("pr-open", () => countSimple("purchase_orders", q => q.neq("status","closed")));
  const closed = useCount("pr-closed", () => countSimple("purchase_orders", q => q.eq("status","closed")));
  const month = useCount("pr-m", () => countSimple("purchase_orders", q => q.gte("created_at", startOfMonth().toISOString())));
  const suppliers = useCount("pr-s", () => countSimple("suppliers"));
  return (
    <Section title="Purchase orders">
      <Stat label="Open" value={open.data ?? "—"} />
      <Stat label="Closed" value={closed.data ?? "—"} />
      <Stat label="POs this month" value={month.data ?? "—"} />
      <Stat label="Suppliers" value={suppliers.data ?? "—"} />
    </Section>
  );
}
