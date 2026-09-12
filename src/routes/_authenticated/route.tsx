import { createFileRoute, Outlet, redirect, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity, Ambulance, Apple, Archive, Bandage, Baby, BarChart3, Bed, BedDouble, Bell, Briefcase, CalendarClock,
  CalendarDays, ChevronDown, ClipboardCheck, ClipboardList, Clock, FileText, FlaskConical, Gauge, Gavel,
  Heart, HeartPulse, Inbox as InboxIcon, LayoutDashboard, ListOrdered, LogOut, MessageSquare, Microscope,
  MapPin, Package, Pill, Receipt, ScanLine, Shield, ShieldAlert, ShieldCheck, ShoppingCart, Siren, Stethoscope,
  Navigation, Syringe, Ticket, Truck, User, Warehouse, Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { NotificationBell } from "@/components/notification-bell";
import { useWorkCounts } from "@/hooks/use-notifications";
import { canAccess } from "@/lib/role-permissions";
import type { AppRole } from "@/hooks/use-auth";

// ============================================================================
// Per-role sidebar visibility rules.
// These filter what is *shown* in the nav; they do NOT relax route access
// (canAccess() still owns that). A user with multiple roles sees an item if
// at least one of their roles would show it.
// ============================================================================

// Whole groups hidden for a role.
const HIDE_GROUPS_BY_ROLE: Partial<Record<AppRole, string[]>> = {
  lab_tech:          ["inpatient", "emergency", "store"],
  billing_officer:   ["outpatient", "inpatient", "emergency", "finance"],
  doctor:            ["emergency"],
  nurse:             ["emergency"],
  pharmacist:        ["emergency"],
  physio:            ["emergency"],
  nutritionist:      ["emergency"],
  radiologist:       ["emergency"],
  procurement:       ["outpatient", "inpatient", "emergency"],
  store_keeper:      ["outpatient", "inpatient", "emergency"],
  admin:             ["emergency"],
};

// Theatre / ICU / Maternity stub prefixes (nested under Inpatient).
const THEATRE_PREFIXES = ["/surgery", "/coming-soon/theatre-", "/coming-soon/surgical-", "/coming-soon/anaesthesia-", "/coming-soon/recovery"];
const ICU_PREFIXES = ["/coming-soon/icu-", "/coming-soon/ventilator-", "/coming-soon/sedation", "/coming-soon/critical-care-"];
const MATERNITY_PREFIXES = ["/coming-soon/maternity-", "/coming-soon/antenatal", "/coming-soon/labour-", "/coming-soon/postnatal", "/coming-soon/newborn-"];
const SUBDOMAIN_PREFIXES = [...THEATRE_PREFIXES, ...ICU_PREFIXES, ...MATERNITY_PREFIXES];

// Individual URLs hidden for a role.
const HIDE_URLS_BY_ROLE: Partial<Record<AppRole, string[]>> = {
  lab_tech: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
  ],
  doctor: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/lab-order", "/prescribe", "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/admissions",
    "/beds", "/coming-soon/ward-board", "/nursing-station", "/emar",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/care-plans", "/ward-rounds",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    ...SUBDOMAIN_PREFIXES,
  ],

  nurse: [
    "/coming-soon/nursing-triage", "/visits", "/lab-order",
    "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/outpatient-procedures",
    "/admissions", "/beds", "/coming-soon/ward-board", "/nursing-station",
    "/care-plans", "/ward-rounds", "/emar",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    "/discharge-planning",
    ...SUBDOMAIN_PREFIXES,
  ],
  pharmacist: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/ward-board", "/my-inpatients", "/emar",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    ...SUBDOMAIN_PREFIXES,
  ],
  physio: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/lab-order", "/prescribe", "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/ward-board", "/my-inpatients", "/emar",
    "/care-plans", "/ward-rounds",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    ...SUBDOMAIN_PREFIXES,
  ],
  nutritionist: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/ward-board", "/my-inpatients",
    "/care-plans", "/coming-soon/inpatient-imaging",
    "/allied-health",
    "/sports",
    ...SUBDOMAIN_PREFIXES,
  ],
  radiologist: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/lab-order", "/prescribe", "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/ward-board", "/my-inpatients", "/emar",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    ...SUBDOMAIN_PREFIXES,
  ],
  store_keeper: [
    "/orders/stock-requests",
  ],
  admin: [
    // Outpatient trims
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/lab-order", "/coming-soon/outpatient-imaging", "/prescribe",
    "/coming-soon/visit-history",
    // Inpatient trims
    "/admissions", "/beds", "/nursing-station",
    "/coming-soon/ward-board", "/my-inpatients",
    "/care-plans", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    "/inpatient-procedures", "/discharge-planning", "/emar", "/ward-rounds",
    ...SUBDOMAIN_PREFIXES,
    // Sports trims
    "/sports-medicine", "/anti-doping", "/assessments",
    // Store trims
    "/tenders", "/audit-inventory", "/orders/stock-requests",
    // HR trims
    "/hr/me", "/hr/leave", "/hr/payslips", "/hr/documents", "/hr/admin",
    "/requests", "/attendance", "/leave-inbox", "/announcements",
    // Finance trims
    "/cash-reconciliation", "/credit-notes", "/preauth",
    // Mobility trims
    "/mobility/request", "/mobility/trips", "/mobility/driver",
    // Clinical/ops screens owned by their specialist roles
    "/immunization", "/my-vaccines", "/instruments", "/critical-results",
    "/referrals", "/pharmacy-safety", "/controlled-drugs",
    "/mobility/dispatch", "/mobility/fleet",
    // Admin group trims
    "/roster", "/admin-kpi",
  ],

};

// Strict whitelist: role sees ONLY these URLs (both groups and standalone).
const ONLY_URLS_BY_ROLE: Partial<Record<AppRole, string[]>> = {
  patient:           ["/me", "/my-vaccines", "/assessments", "/messages", "/chronic-care", "/mobility/request", "/mobility/trips"],
  athlete:           ["/me", "/my-vaccines", "/assessments", "/messages", "/chronic-care", "/mobility/request", "/mobility/trips"],
  receptionist:      ["/appointments", "/dashboard", "/messages", "/reception", "/queue", "/patients"],
  insurance_officer: ["/insurance", "/preauth", "/dashboard", "/messages"],
  fleet_manager:     ["/dashboard", "/messages", "/mobility/dispatch", "/mobility/fleet", "/mobility/trips", "/mobility/request"],
  driver:            ["/dashboard", "/messages", "/mobility/driver", "/mobility/trips"],
};

function urlMatches(url: string, pattern: string): boolean {
  return url === pattern || url.startsWith(pattern);
}

function isItemVisibleForRoles(url: string, groupKey: string | null, roles: AppRole[]): boolean {
  if (roles.length === 0) return true; // let canAccess handle it
  // Item is visible if ANY of the user's roles would show it.
  return roles.some((role) => {
    const only = ONLY_URLS_BY_ROLE[role];
    if (only) return only.some((p) => urlMatches(url, p));
    if (groupKey && HIDE_GROUPS_BY_ROLE[role]?.includes(groupKey)) return false;
    const hides = HIDE_URLS_BY_ROLE[role];
    if (hides && hides.some((p) => urlMatches(url, p))) return false;
    return true;
  });
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

type BadgeKey = "lab" | "pharmacy" | "radiology" | undefined;
type Item = {
  title: string;
  url: string;
  icon: typeof Heart;
  badge?: BadgeKey;
  dept?: string;
  hideForAdmin?: boolean;
};
type Group = {
  key: string;
  label: string;
  icon: typeof Heart;
  items: Item[];
  /** If true, group is shown even when the user has zero accessible items in it. */
  alwaysShow?: boolean;
};

const stub = (slug: string) => `/coming-soon/${slug}`;

const GROUPS: Group[] = [
  {
    key: "outpatient", label: "Outpatient", icon: Stethoscope, 
    items: [
      
      { title: "Appointments", url: "/appointments", icon: CalendarClock, dept: "appointments" },
      { title: "Reception", url: "/reception", icon: ClipboardCheck, dept: "reception" },
      { title: "Patient directory", url: "/patients", icon: User, dept: "reception" },
      { title: "Queue board", url: "/queue", icon: ListOrdered },
      { title: "Nursing triage", url: stub("nursing-triage"), icon: HeartPulse },
      { title: "Immunization", url: "/immunization", icon: Syringe },
      { title: "Consultation", url: "/visits", icon: ClipboardList, hideForAdmin: true },
      { title: "My health", url: "/me", icon: Stethoscope, hideForAdmin: true },
      { title: "My vaccines", url: "/my-vaccines", icon: Syringe, hideForAdmin: true },
      { title: "Procedures", url: stub("outpatient-procedures"), icon: Bandage },
      { title: "Laboratory orders", url: "/lab-order", icon: FlaskConical },
      { title: "Imaging orders", url: stub("outpatient-imaging"), icon: ScanLine },
      { title: "Prescriptions", url: "/prescribe", icon: Pill },
      { title: "Billing", url: "/billing", icon: Receipt, dept: "billing" },
      { title: "Insurance", url: "/insurance", icon: Shield, dept: "insurance" },
      { title: "Visit history", url: stub("visit-history"), icon: FileText },
    ],
  },
  {
    key: "inpatient", label: "Inpatient", icon: BedDouble, 
    items: [
      { title: "HAIMS · Executive", url: "/haims", icon: Gauge },
      { title: "Admissions", url: "/admissions", icon: ClipboardCheck },
      { title: "Bed management", url: "/beds", icon: Bed },
      { title: "Ward board", url: stub("ward-board"), icon: LayoutDashboard },
      { title: "Ward census", url: "/nursing-station", icon: HeartPulse },
      { title: "My patients", url: "/my-inpatients", icon: User },
      { title: "Nursing care", url: "/care-plans", icon: ClipboardList },
      { title: "Ward rounds", url: "/ward-rounds", icon: Stethoscope },
      { title: "Medication administration", url: "/emar", icon: Pill },
      { title: "Procedures", url: "/inpatient-procedures", icon: Bandage },
      { title: "Laboratory orders", url: "/lab-order", icon: FlaskConical },
      { title: "Imaging orders", url: stub("inpatient-imaging"), icon: ScanLine },
      { title: "Allied health", url: "/allied-health", icon: HeartPulse },
      { title: "Clinical monitoring", url: "/monitoring", icon: Activity },
      { title: "Infection control", url: "/infection-control", icon: ShieldAlert },
      { title: "Discharge planning", url: "/discharge-planning", icon: LogOut },
      { title: "Ward analytics", url: "/ward-analytics", icon: BarChart3 },
      // Theatre — nested under Inpatient
      { title: "Theatre · Dashboard", url: "/surgery", icon: Syringe },
      { title: "Theatre · Schedule", url: stub("theatre-schedule"), icon: CalendarDays },
      { title: "Theatre · Waiting list", url: stub("theatre-waiting-list"), icon: ListOrdered },
      { title: "Theatre · Surgical checklist", url: stub("surgical-checklist"), icon: ClipboardCheck },
      { title: "Theatre · Anaesthesia records", url: stub("anaesthesia-records"), icon: FileText },
      { title: "Theatre · Recovery", url: stub("recovery"), icon: HeartPulse },
      { title: "Theatre · Reports", url: stub("theatre-reports"), icon: FileText },
      // ICU / HDU — nested under Inpatient
      { title: "ICU · Dashboard", url: stub("icu-dashboard"), icon: HeartPulse },
      { title: "ICU · Census", url: stub("icu-census"), icon: BedDouble },
      { title: "ICU · Ventilators", url: stub("ventilator-management"), icon: Activity },
      { title: "ICU · Sedation & analgesia", url: stub("sedation"), icon: Syringe },
      { title: "ICU · Critical care rounds", url: stub("critical-care-rounds"), icon: Stethoscope },
      // Maternity — nested under Inpatient
      { title: "Maternity · Dashboard", url: stub("maternity-dashboard"), icon: Baby },
      { title: "Maternity · Antenatal", url: stub("antenatal"), icon: HeartPulse },
      { title: "Maternity · Labour & delivery", url: stub("labour-delivery"), icon: Baby },
      { title: "Maternity · Postnatal", url: stub("postnatal"), icon: BedDouble },
      { title: "Maternity · Newborn nursery", url: stub("newborn-nursery"), icon: Baby },
    ],
  },
  {
    key: "emergency", label: "Emergency", icon: Siren, 
    items: [
      { title: "Dashboard", url: stub("emergency"), icon: LayoutDashboard },
      { title: "Triage", url: stub("emergency-triage"), icon: HeartPulse },
      { title: "Resuscitation", url: stub("resuscitation"), icon: Siren },
      { title: "Observation unit", url: stub("observation-unit"), icon: Activity },
      { title: "Emergency orders", url: stub("emergency-orders"), icon: ClipboardList },
      { title: "Procedures", url: stub("emergency-procedures"), icon: Bandage },
      { title: "Admissions", url: "/admissions", icon: ClipboardCheck },
      { title: "Transfers", url: stub("emergency-transfers"), icon: Ambulance },
    ],
  },


  {
    key: "mobility", label: "Mobility", icon: Ambulance,
    items: [
      { title: "Request transport", url: "/mobility/request", icon: Ambulance },
      { title: "My trips", url: "/mobility/trips", icon: MapPin },
      { title: "Dispatch board", url: "/mobility/dispatch", icon: Siren },
      { title: "Fleet admin", url: "/mobility/fleet", icon: Truck },
      { title: "Driver portal", url: "/mobility/driver", icon: Navigation },
    ],
  },
  {
    key: "quality", label: "Diagnostics quality", icon: Microscope,
    items: [
      { title: "Critical results", url: "/critical-results", icon: ShieldAlert },
      { title: "Instrument QC", url: "/instruments", icon: Gauge },
      { title: "Referrals & consults", url: "/referrals", icon: FileText },
      { title: "Pharmacy safety", url: "/pharmacy-safety", icon: Pill },
      { title: "Chronic care & refills", url: "/chronic-care", icon: HeartPulse },
    ],
  },


  // Non-clinical utility groups (only shown if user has ≥1 accessible item).
  {
    key: "sports", label: "Sports & Wellness", icon: Activity,
    items: [
      { title: "Sports & Athletes", url: "/sports", icon: Activity, dept: "sports" },
      { title: "Physio", url: "/physio", icon: Bandage, dept: "physio" },
      { title: "Nutrition", url: "/nutrition", icon: Apple, dept: "nutrition" },
      { title: "Sports Medicine", url: "/sports-medicine", icon: HeartPulse },
      { title: "Anti-Doping", url: "/anti-doping", icon: ShieldAlert },
      { title: "Assessments", url: "/assessments", icon: ClipboardList },
    ],
  },
  {
    key: "store", label: "Store & Procurement", icon: Warehouse,
    items: [
      { title: "Inventory", url: "/inventory", icon: Package, dept: "inventory" },
      { title: "Store", url: "/store", icon: Warehouse, dept: "store" },
      { title: "Procurement", url: "/procurement", icon: ShoppingCart, dept: "procurement" },
      { title: "Tenders & bids", url: "/tenders", icon: Gavel },
      { title: "Inventory audit", url: "/audit-inventory", icon: BarChart3 },
      { title: "Stock requests", url: "/orders/stock-requests", icon: ShoppingCart },
    ],
  },
  {
    key: "hr", label: "HR & Workplace", icon: Briefcase,
    items: [
      { title: "My HR profile", url: "/hr/me", icon: User },
      { title: "Leave", url: "/hr/leave", icon: CalendarDays },
      { title: "Payslips", url: "/hr/payslips", icon: Wallet },
      { title: "SOPs & Policies", url: "/hr/documents", icon: FileText },
      { title: "HR administration", url: "/hr/admin", icon: Briefcase },
      { title: "Internal requests", url: "/requests", icon: Ticket },
      { title: "Attendance", url: "/attendance", icon: Clock },
      { title: "Leave inbox", url: "/leave-inbox", icon: InboxIcon },
      { title: "Announcements", url: "/announcements", icon: Bell },
    ],
  },
  {
    key: "finance", label: "Finance ops", icon: Wallet,
    items: [
      { title: "Cash reconciliation", url: "/cash-reconciliation", icon: Wallet },
      { title: "Credit notes", url: "/credit-notes", icon: Receipt },
      { title: "Service catalog", url: "/service-catalog", icon: Receipt },
      { title: "Pre-authorization", url: "/preauth", icon: ShieldCheck },
    ],
  },
  {
    key: "admin", label: "Administration", icon: ShieldCheck,
    items: [
      { title: "User management", url: "/users", icon: ShieldCheck },
      { title: "Rostering", url: "/roster", icon: CalendarDays },
      { title: "Audit log", url: "/audit", icon: Shield },
      { title: "Soft-deleted", url: "/admin/soft-deleted", icon: Archive },
      { title: "Consent management", url: "/admin/consent", icon: FileText },
      { title: "Breach register", url: "/admin/breaches", icon: ShieldAlert },
      { title: "Access reviews", url: "/admin/access-reviews", icon: ClipboardCheck },
      { title: "Error monitor", url: "/admin/errors", icon: ShieldAlert },
      { title: "Portal invitations", url: "/admin/portal-invitations", icon: ShieldCheck },
      { title: "SLA dashboard", url: "/sla", icon: Gauge },
      { title: "Queue display", url: "/display/queue", icon: ListOrdered },
    ],
  },
];

// Standalone entries that live outside any group.
const STANDALONE: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Messages", url: "/messages", icon: MessageSquare },
  { title: "Completed reports", url: "/completed", icon: Archive },
];


const STORAGE_KEY = "litu-vault:sidebar:open-groups";

function AuthedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, roles, loading: authLoading } = useAuth();
  const work = useWorkCounts();
  const isAdmin = roles.includes("admin");


  // Hydration-safe: initialize empty on server & first client render, then load from localStorage.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        setOpenGroups(JSON.parse(raw));
        return;
      }
    } catch { /* ignore */ }
    // Default: open the group that contains the current route.
    const current = GROUPS.find((g) => g.items.some((it) => resolveUrl(it, isAdmin) === pathname));
    setOpenGroups(current ? { [current.key]: true } : { outpatient: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups)); } catch { /* ignore */ }
  }, [openGroups, hydrated]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function toggle(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Single bootstrap gate: never render role-dependent chrome (or the page
  // beneath it) until roles are resolved. This is what stops the sidebar and
  // dashboards from flashing the previous/incorrect role view.
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1.5 font-semibold">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="group-data-[collapsible=icon]:hidden">Litu Vault</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            {/* Standalone (Dashboard-esque + Messages) */}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {STANDALONE
                    .filter((it) => canAccess(it.url, roles))
                    .filter((it) => isItemVisibleForRoles(it.url, null, roles))
                    .map((it) => (
                    <SidebarMenuItem key={it.url}>
                      <SidebarMenuButton asChild isActive={pathname === it.url}>
                        <Link to={it.url as string}>
                          <it.icon />
                          <span>{it.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {GROUPS.map((group) => {
              const visibleItems = group.items
                .filter((it) => canAccess(it.url, roles) || it.url.startsWith("/coming-soon/"))
                .filter((it) => !(isAdmin && it.hideForAdmin))
                .filter((it) => isItemVisibleForRoles(it.url, group.key, roles));
              if (visibleItems.length === 0 && !group.alwaysShow) return null;

              const isOpen = !!openGroups[group.key];
              const activeInGroup = visibleItems.some((it) => resolveUrl(it, isAdmin) === pathname);

              return (
                <Collapsible key={group.key} open={isOpen || activeInGroup} onOpenChange={() => toggle(group.key)}>
                  <SidebarGroup>
                    <SidebarGroupLabel asChild>
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent">
                        <span className="flex items-center gap-2">
                          <group.icon className="h-4 w-4" />
                          <span className="group-data-[collapsible=icon]:hidden">{group.label}</span>
                        </span>
                        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform group-data-[collapsible=icon]:hidden ${isOpen || activeInGroup ? "rotate-180" : ""}`} />
                      </CollapsibleTrigger>
                    </SidebarGroupLabel>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {visibleItems.map((it) => {
                            const targetUrl = resolveUrl(it, isAdmin);
                            const count = it.badge ? work.data?.[it.badge] ?? 0 : 0;
                            const isStub = it.url.startsWith("/coming-soon/");
                            return (
                              <SidebarMenuItem key={`${group.key}-${it.title}-${it.url}`}>
                                <SidebarMenuButton asChild isActive={pathname === targetUrl}>
                                  <Link to={targetUrl as string}>
                                    <it.icon />
                                    <span className="flex-1">{it.title}</span>
                                    {isStub && (
                                      <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
                                        soon
                                      </span>
                                    )}
                                    {count > 0 && (
                                      <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden">
                                        {count}
                                      </span>
                                    )}
                                  </Link>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            );
                          })}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            })}
          </SidebarContent>
          <SidebarFooter>
            <div className="space-y-2 px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              <div className="truncate">{user?.email}</div>
              <div className="flex flex-wrap gap-1">
                {roles.length === 0 ? (
                  <span className="rounded bg-muted px-1.5 py-0.5">no role</span>
                ) : (
                  roles.map((r) => (
                    <span key={r} className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{r}</span>
                  ))
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
              <LogOut className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-1 flex-col">
          <header className="flex h-12 items-center justify-between border-b px-2">
            <SidebarTrigger />
            <NotificationBell />
          </header>

          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function resolveUrl(it: Item, isAdmin: boolean): string {
  return isAdmin && it.dept ? `/department/${it.dept}` : it.url;
}
