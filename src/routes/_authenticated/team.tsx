import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/team")({
  component: Team,
});

const ALL_ROLES: AppRole[] = ["admin", "doctor", "coach"];

interface MyRoleRow {
  user_id: string;
  role: AppRole;
}

function Team() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();

  const myRoles = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles" as never)
        .select("user_id, role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data as unknown as MyRoleRow[]) ?? [];
    },
  });

  const assignSelf = useMutation({
    mutationFn: async (role: AppRole) => {
      const { error } = await supabase
        .from("user_roles" as never)
        .insert({ user_id: user!.id, role } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-roles"] });
      toast.success("Role added");
      window.location.reload();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAdmin = roles.includes("admin");
  const isFirstUser = (myRoles.data?.length ?? 0) === 0 && roles.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team & Roles</h1>
        <p className="text-sm text-muted-foreground">
          Manage your role assignments. The first user to join can claim the
          admin role to bootstrap the workspace.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-medium">Your roles</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.length === 0 && (
            <span className="text-sm text-muted-foreground">No roles assigned.</span>
          )}
          {roles.map((r) => (
            <span
              key={r}
              className="rounded bg-primary/10 px-2 py-1 text-xs text-primary"
            >
              {r}
            </span>
          ))}
        </div>

        {(isAdmin || isFirstUser) && (
          <div className="mt-5">
            <h3 className="text-sm font-medium">Grant yourself a role</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_ROLES.map((r) => (
                <Button
                  key={r}
                  variant="outline"
                  size="sm"
                  disabled={roles.includes(r) || assignSelf.isPending}
                  onClick={() => assignSelf.mutate(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
            {isFirstUser && (
              <p className="mt-3 text-xs text-muted-foreground">
                Tip: claim <strong>admin</strong> first — it lets you manage
                everything including other users' roles later.
              </p>
            )}
          </div>
        )}

        {!isAdmin && !isFirstUser && (
          <p className="mt-4 text-xs text-muted-foreground">
            Only an admin can change role assignments. Ask one of your
            administrators to grant you a role.
          </p>
        )}
      </div>
    </div>
  );
}
