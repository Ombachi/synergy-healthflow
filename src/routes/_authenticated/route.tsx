import { createFileRoute, Outlet, redirect, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { Activity, ClipboardList, Heart, LayoutDashboard, LogOut, Package, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Onboarding", url: "/onboarding", icon: UserPlus },
  { title: "Visits", url: "/visits", icon: ClipboardList },
  { title: "Medical / EHR", url: "/medical", icon: Heart },
  { title: "Sports & Athletes", url: "/sports", icon: Activity },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Team & Roles", url: "/team", icon: Users },
] as const;

function AuthedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, roles } = useAuth();

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
                  {items.map((it) => (
                    <SidebarMenuItem key={it.url}>
                      <SidebarMenuButton asChild isActive={pathname === it.url}>
                        <Link to={it.url}>
                          <it.icon />
                          <span>{it.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
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
                    <span key={r} className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                      {r}
                    </span>
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
          <header className="flex h-12 items-center border-b px-2">
            <SidebarTrigger />
          </header>
          {user && !roles.length && pathname !== "/onboarding" && pathname !== "/team" && (
            <div className="border-b bg-primary/5 px-4 py-2 text-sm">
              Finish setting up your account.{" "}
              <Link to="/onboarding" className="font-medium text-primary underline">
                Complete onboarding →
              </Link>
            </div>
          )}
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
