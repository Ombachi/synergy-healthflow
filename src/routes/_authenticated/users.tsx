import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth, ALL_ROLES, type AppRole } from "@/hooks/use-auth";
import {
  listAllUsers, setUserBanned, deleteUserAccount, adminSetRoles,
} from "@/lib/admin-users.functions";
import { seedDemoUsers } from "@/lib/seed-demo.functions";
import { Ban, CheckCircle2, ShieldCheck, Sparkles, Trash2, UserCog } from "lucide-react";
import { Pager, usePager } from "@/components/pager";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

type AdminUser = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  email_confirmed_at: string | null;
  profile: { full_name: string | null; phone: string | null; onboarded_as: string | null } | null;
  roles: string[];
};

function UsersPage() {
  const { roles, user } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();

  const fetchUsers = useServerFn(listAllUsers);
  const banFn = useServerFn(setUserBanned);
  const delFn = useServerFn(deleteUserAccount);
  const rolesFn = useServerFn(adminSetRoles);
  const seedFn = useServerFn(seedDemoUsers);

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: () => fetchUsers() as Promise<AdminUser[]>,
  });

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [draftRoles, setDraftRoles] = useState<AppRole[]>([]);
  const pager = usePager(usersQ.data ?? [], 20);

  const banM = useMutation({
    mutationFn: (v: { userId: string; banned: boolean }) => banFn({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (userId: string) => delFn({ data: { userId } }),
    onSuccess: () => { toast.success("User deleted"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rolesM = useMutation({
    mutationFn: (v: { userId: string; roles: string[] }) => rolesFn({ data: v }),
    onSuccess: () => {
      toast.success("Roles updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const seedM = useMutation({
    mutationFn: () => seedFn() as Promise<{ password: string; results: { email: string; status: string; role: string }[] }>,
    onSuccess: (res) => {
      const created = res.results.filter((r) => r.status === "created").length;
      const existed = res.results.filter((r) => r.status === "exists").length;
      toast.success(`Demo users ready: ${created} created, ${existed} already existed. Password: ${res.password}`, { duration: 10000 });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">User management</h1>
        <p className="mt-2 text-sm text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  function openEdit(u: AdminUser) {
    setEditing(u);
    setDraftRoles(u.roles as AppRole[]);
  }

  function toggleRole(r: AppRole) {
    setDraftRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">User management</h1>
          <p className="text-sm text-muted-foreground">
            Assign roles, deactivate, or delete user accounts. Changes take effect immediately.
          </p>
        </div>
        <Button onClick={() => seedM.mutate()} disabled={seedM.isPending}>
          <Sparkles className="h-4 w-4" /> {seedM.isPending ? "Seeding…" : "Seed demo users"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersQ.isLoading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {pager.slice.map((u) => {
              const isSelf = u.id === user?.id;
              const banned = !!u.banned_until && new Date(u.banned_until) > new Date();
              return (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.profile?.full_name || u.email || u.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {u.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {banned ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Ban className="h-3 w-3" /> Deactivated</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("en-GB") : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                        <UserCog className="h-3.5 w-3.5" /> Roles
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSelf || banM.isPending}
                        onClick={() => banM.mutate({ userId: u.id, banned: !banned })}
                      >
                        {banned ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        {banned ? "Activate" : "Deactivate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isSelf || delM.isPending}
                        onClick={() => {
                          if (confirm(`Permanently delete ${u.email}? This cannot be undone.`)) delM.mutate(u.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Assign roles</DialogTitle>
            <DialogDescription>
              {editing?.profile?.full_name || editing?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {ALL_ROLES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent">
                <Checkbox checked={draftRoles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                <span className="capitalize">{r.replace("_", " ")}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={rolesM.isPending}
              onClick={() => editing && rolesM.mutate({ userId: editing.id, roles: draftRoles })}
            >
              Save roles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
