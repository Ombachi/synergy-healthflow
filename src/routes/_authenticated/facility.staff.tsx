import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, RefreshCw, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useFacility } from "@/components/facility-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listFacilityStaff, setFacilityDepartmentRole } from "@/lib/facility-staff.functions";
import { DEPARTMENT_ROLES, canEditDepartmentRole, roleLabel } from "@/lib/facility-staff-rules";

export const Route = createFileRoute("/_authenticated/facility/staff")({
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = Number(search["page"]);
    return Number.isInteger(page) && page > 1 ? { page: Math.min(page, 10000) } : {};
  },
  head: () => ({ meta: [
    { title: "Branch staff | Litu Vault" },
    { name: "description", content: "Manage staff and departmental role assignments within your Litu Vault facility." },
    { property: "og:title", content: "Branch staff | Litu Vault" },
    { property: "og:description", content: "Facility-scoped staff administration in Litu Vault." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: FacilityStaffPage,
});

function FacilityStaffPage() {
  const { user } = useAuth();
  const { activeFacility, availableFacilities, roles, loading, error, refresh } = useFacility();
  if (loading) return <p className="text-muted-foreground">Loading branch…</p>;
  if (error || !availableFacilities.some((f) => f.id === activeFacility.id)) {
    return <div className="space-y-3"><h1 className="text-2xl font-semibold">Branch staff</h1><p role="alert" className="text-destructive">{error ?? "No authorized branch is assigned to this account."}</p><Button variant="outline" onClick={refresh}><RefreshCw /> Retry</Button></div>;
  }
  if (!roles.includes("facility_admin")) return <p role="alert" className="text-destructive">Facility administrator access required for this branch.</p>;
  if (!user) return null;
  return <BranchStaff key={activeFacility.id} facilityId={activeFacility.id} facilityName={activeFacility.name} userId={user.id} />;
}

function BranchStaff({ facilityId, facilityName, userId }: { facilityId: string; facilityName: string; userId: string }) {
  const { page: searchPage } = Route.useSearch();
  const page = searchPage ?? 1;
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { refresh } = useFacility();
  const load = useServerFn(listFacilityStaff);
  const save = useServerFn(setFacilityDepartmentRole);
  const [selected, setSelected] = useState<{ user_id: string; full_name: string; role: string | null } | null>(null);
  const [role, setRole] = useState<string>("");
  const staff = useQuery({ queryKey: ["branch-staff", facilityId, userId, page], queryFn: () => load({ data: { facilityId, page } }) });
  const mutation = useMutation({
    mutationFn: () => {
      const departmentRole = DEPARTMENT_ROLES.find((r) => r === role);
      if (!selected || !departmentRole) throw new Error("Select a departmental role.");
      return save({ data: { facilityId, userId: selected.user_id, role: departmentRole } });
    },
    onSuccess: () => { setSelected(null); void qc.invalidateQueries({ queryKey: ["branch-staff", facilityId] }); void qc.invalidateQueries({ queryKey: ["facility-admin-members", facilityId] }); refresh(); toast.success("Branch role updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pages = Math.max(1, Math.ceil((staff.data?.total ?? 0) / 25));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Users /> Branch staff</h1><p className="mt-1 text-sm text-muted-foreground">{facilityName}</p></div><Button variant="outline" disabled={staff.isFetching} onClick={() => void staff.refetch()}><RefreshCw /> Refresh</Button></div>
    {staff.isPending ? <p className="text-muted-foreground">Loading staff…</p> : staff.isError ? <div className="space-y-3"><p role="alert" className="text-destructive">{staff.error.message}</p><Button variant="outline" onClick={() => void staff.refetch()}>Try again</Button></div> : <>
      <p className="text-sm text-muted-foreground">{staff.data.total} staff assigned</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-3">Staff member</th><th className="p-3">Branch role</th><th className="p-3">Assignment</th><th className="p-3">Actions</th></tr></thead><tbody>{staff.data.members.map((member) => <tr key={member.user_id} className="border-b"><td className="p-3 font-medium">{member.full_name}{member.user_id === userId && <span className="ml-2 text-xs text-muted-foreground">You</span>}</td><td className="p-3 capitalize">{roleLabel(member.role)}</td><td className="p-3">{member.is_primary ? "Primary branch" : "Additional branch"}</td><td className="p-3">{canEditDepartmentRole(member.role) ? <Button variant="outline" size="sm" onClick={() => { setSelected(member); setRole(member.role ?? ""); }}>Assign role</Button> : <span className="text-muted-foreground">Protected role</span>}</td></tr>)}</tbody></table></div>
      {!staff.data.members.length && <p className="py-6 text-center text-muted-foreground">No staff on this page.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Page {page} of {pages}</p><div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Previous staff page" disabled={page <= 1} onClick={() => void navigate({ to: ".", search: { page: page - 1 } })}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="Next staff page" disabled={page >= pages} onClick={() => void navigate({ to: ".", search: { page: page + 1 } })}><ChevronRight /></Button></div></div>
    </>}
    <Dialog open={selected !== null} onOpenChange={(open) => { if (!open && !mutation.isPending) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Departmental role · {selected?.full_name}</DialogTitle></DialogHeader><div className="space-y-2"><Label htmlFor="branch-department-role">Role</Label><select id="branch-department-role" className="w-full rounded-md border border-input bg-background p-2 capitalize" value={role} onChange={(e) => setRole(e.target.value)} disabled={mutation.isPending}><option value="">Select role</option>{DEPARTMENT_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></div><DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setSelected(null)}>Cancel</Button><Button disabled={mutation.isPending || !DEPARTMENT_ROLES.some((r) => r === role) || role === selected?.role} onClick={() => mutation.mutate()}><Save />{mutation.isPending ? "Saving…" : "Save role"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}