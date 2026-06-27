import { createFileRoute, Outlet, redirect, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { Activity, Apple, Bandage, BarChart3, BedDouble, Briefcase, CalendarClock, CalendarDays, ClipboardCheck, ClipboardList, Dumbbell, FileText, FlaskConical, Gauge, Heart, LayoutDashboard, ListOrdered, LogOut, MessageSquare, Package, Pill, Receipt, ScanLine, Shield, ShieldCheck, ShoppingCart, Stethoscope, Trophy, User, Users, Warehouse, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { NotificationBell } from "@/components/notification-bell";
import { useWorkCounts } from "@/hooks/use-notifications";
import { canAccess } from "@/lib/role-permissions";

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
  badge: BadgeKey;
  /** Department slug used for the admin analytics view at /department/$dept. */
  dept?: string;
  /** Hidden from the Admin sidebar (operator-only entries). */
  hideForAdmin?: boolean;
};
const items: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, badge: undefined },

  { title: "Reception", url: "/reception", icon: ClipboardCheck, badge: undefined, dept: "reception" },
  { title: "Appointments", url: "/appointments", icon: CalendarClock, badge: undefined, dept: "appointments" },
  { title: "Queue board", url: "/queue", icon: ListOrdered, badge: undefined },
  { title: "Visits", url: "/visits", icon: ClipboardList, badge: undefined, hideForAdmin: true },
  { title: "My health", url: "/me", icon: Stethoscope, badge: undefined, hideForAdmin: true },
  { title: "Messages", url: "/messages", icon: MessageSquare, badge: undefined },
  { title: "Laboratory", url: "/lab", icon: FlaskConical, badge: "lab", dept: "lab" },
  { title: "Pharmacy", url: "/pharmacy", icon: Pill, badge: "pharmacy", dept: "pharmacy" },
  { title: "Radiology", url: "/radiology", icon: ScanLine, badge: "radiology", dept: "radiology" },
  { title: "Billing", url: "/billing", icon: Receipt, badge: undefined, dept: "billing" },
  { title: "Insurance", url: "/insurance", icon: Shield, badge: undefined, dept: "insurance" },
  { title: "Service catalog", url: "/service-catalog", icon: Receipt, badge: undefined },
  { title: "Sports & Athletes", url: "/sports", icon: Activity, badge: undefined, dept: "sports" },
  { title: "Coach", url: "/coach", icon: Dumbbell, badge: undefined, dept: "coach" },
  { title: "Team manager", url: "/team-manager", icon: Trophy, badge: undefined, dept: "team-manager" },
  { title: "Physio", url: "/physio", icon: Bandage, badge: undefined, dept: "physio" },
  { title: "Nutrition", url: "/nutrition", icon: Apple, badge: undefined, dept: "nutrition" },
  { title: "Inventory", url: "/inventory", icon: Package, badge: undefined, dept: "inventory" },
  { title: "Store", url: "/store", icon: Warehouse, badge: undefined, dept: "store" },
  { title: "Procurement", url: "/procurement", icon: ShoppingCart, badge: undefined, dept: "procurement" },
  { title: "Stock requests", url: "/orders/stock-requests", icon: ShoppingCart, badge: undefined },
  { title: "Lab templates", url: "/lab-templates", icon: FlaskConical, badge: undefined },
  { title: "Inventory audit", url: "/audit-inventory", icon: BarChart3, badge: undefined },
  { title: "KPI command center", url: "/admin-kpi", icon: Gauge, badge: undefined },
  { title: "Wards & beds", url: "/beds", icon: BedDouble, badge: undefined },
  { title: "Pre-authorization", url: "/preauth", icon: ShieldCheck, badge: undefined },
  { title: "Rostering", url: "/roster", icon: CalendarDays, badge: undefined },
  { title: "Audit log", url: "/audit", icon: Shield, badge: undefined },
  { title: "User management", url: "/users", icon: ShieldCheck, badge: undefined },

  // HR / Employee Self-Service — visible to every signed-in staff member
  { title: "My HR profile", url: "/hr/me", icon: User, badge: undefined },
  { title: "Leave", url: "/hr/leave", icon: CalendarDays, badge: undefined },
  { title: "Payslips", url: "/hr/payslips", icon: Wallet, badge: undefined },
  { title: "SOPs & Policies", url: "/hr/documents", icon: FileText, badge: undefined },
  { title: "HR administration", url: "/hr/admin", icon: Briefcase, badge: undefined },

];


function AuthedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, roles } = useAuth();
  const work = useWorkCounts();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1.5 font-semibold">
              <Heart className="h-5 w-5 text-primary" />
              <span className="group-data-[collapsible=icon]:hidden">Vitalis</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Modules</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items
                    .filter((it) => canAccess(it.url, roles))
                    .filter((it) => !(roles.includes("admin") && it.hideForAdmin))
                    .map((it) => {
                      const isAdmin = roles.includes("admin");
                      // Admins clicking on a department go to the analytics view, not the operator workstation.
                      const targetUrl = isAdmin && it.dept ? `/department/${it.dept}` : it.url;
                      const count = it.badge ? work.data?.[it.badge] ?? 0 : 0;
                      return (
                        <SidebarMenuItem key={it.url}>
                          <SidebarMenuButton asChild isActive={pathname === targetUrl}>
                            <Link to={targetUrl as string}>
                              <it.icon />
                              <span className="flex-1">{it.title}</span>
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
            </SidebarGroup>
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
