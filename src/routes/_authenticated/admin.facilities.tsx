import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, Pencil, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RoleGate } from "@/components/role-gate";
import { useFacility } from "@/components/facility-context";
import { MODULES, modulesForTier, type Facility, type Tier } from "@/lib/facilities";
import { saveFacility, assignFacilityStaff } from "@/lib/facility-admin.functions";
import { listAllUsers } from "@/lib/admin-users.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/facilities")({
  head: () => ({ meta: [
    { title: "Facility administration | Litu Vault" },
    { name: "description", content: "Manage Litu Vault branches, subscriptions, modules and staff assignments." },
    { property: "og:title", content: "Facility administration | Litu Vault" },
    { property: "og:description", content: "Manage healthcare facilities and branch access in Litu Vault." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <RoleGate path="/admin/facilities"><FacilitiesPage /></RoleGate>,
});

const emptyForm = () => ({ id: undefined as string | undefined, name: "", code: "", facility_type: "clinic" as Facility["facility_type"], tier: "starter" as Tier, address: "", phone: "", email: "", is_active: true, tax_pin: "", currency: "KES", website: "", tagline: "", modules: modulesForTier("starter") });

function FacilitiesPage() {
  const { allFacilities, refresh } = useFacility();
  const qc = useQueryClient();
  const save = useServerFn(saveFacility);
  const assign = useServerFn(assignFacilityStaff);
  const loadUsers = useServerFn(listAllUsers);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [staffBranch, setStaffBranch] = useState<Facility | null>(null);
  const [staffId, setStaffId] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const users = useQuery({ queryKey: ["facility-admin-users"], queryFn: () => loadUsers(), enabled: !!staffBranch });
  const members = useQuery({ queryKey: ["facility-admin-members", staffBranch?.id], enabled: !!staffBranch, queryFn: async () => {
    if (!staffBranch) return [];
    const result = await supabase.from("user_facilities").select("user_id, role, is_primary").eq("facility_id", staffBranch.id);
    if (result.error) throw result.error;
    return result.data;
  } });
  const persist = useMutation({ mutationFn: () => save({ data: {
    id: form.id, name: form.name, code: form.code, facility_type: form.facility_type, tier: form.tier,
    address: form.address, phone: form.phone, email: form.email, is_active: form.is_active,
    settings: { tax_pin: form.tax_pin, currency: form.currency, website: form.website, tagline: form.tagline, modules: form.modules },
  } }), onSuccess: () => { setOpen(false); refresh(); toast.success("Facility saved"); }, onError: (e: Error) => toast.error(e.message) });
  const staffMutation = useMutation({ mutationFn: (input: { userId: string; role: string; remove?: boolean }) => {
    if (!staffBranch) throw new Error("Select a facility");
    return assign({ data: { facilityId: staffBranch.id, ...input, remove: input.remove ?? false } });
  }, onSuccess: () => { void qc.invalidateQueries({ queryKey: ["facility-admin-members"] }); refresh(); toast.success("Staff assignment updated"); }, onError: (e: Error) => toast.error(e.message) });
  function edit(f?: Facility) {
    setForm(f ? { ...emptyForm(), ...f, tax_pin: f.tax_pin ?? "", website: f.website ?? "", tagline: f.tagline ?? "", modules: { ...f.modules } } : emptyForm());
    setStep(0); setOpen(true);
  }
  const staff = users.data?.filter((u) => u.roles.some((r) => r !== "patient" && r !== "athlete")) ?? [];
  const roles = staff.find((u) => u.id === staffId)?.roles.filter((r) => r !== "patient" && r !== "athlete") ?? [];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-2 text-2xl font-semibold"><Building2 /> Facilities</h1><div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Refresh facilities" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button><Button onClick={() => edit()}><Plus className="h-4 w-4" /> New branch</Button></div></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-muted-foreground"><tr>{["Facility", "Code", "Tier", "Status", "Actions"].map((c) => <th key={c} className="p-3">{c}</th>)}</tr></thead><tbody>{allFacilities.map((f) => <tr key={f.id} className="border-b"><td className="p-3 font-medium">{f.name}</td><td className="p-3">{f.code}</td><td className="p-3 capitalize">{f.tier}</td><td className="p-3">{f.is_active ? "Active" : "Inactive"}</td><td className="flex gap-2 p-3"><Button variant="outline" size="sm" onClick={() => edit(f)}><Pencil className="h-4 w-4" /> Edit</Button><Button variant="outline" size="sm" onClick={() => { setStaffBranch(f); setStaffId(""); setStaffRole(""); }}><Users className="h-4 w-4" /> Staff</Button></td></tr>)}</tbody></table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{form.id ? "Edit facility" : "New branch"} · {step + 1}/3</DialogTitle></DialogHeader>
      {step === 0 && <div className="grid gap-4">{(["name", "code", "address", "phone", "email"] as const).map((key) => <div key={key}><Label htmlFor={`branch-${key}`} className="capitalize">{key === "code" ? "Branch code" : key}</Label><Input id={`branch-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: key === "code" ? e.target.value.toUpperCase() : e.target.value })} /></div>)}<Label>Facility type<select className="mt-1 w-full rounded-md border bg-background p-2" value={form.facility_type} onChange={(e) => setForm({ ...form, facility_type: e.target.value as Facility["facility_type"] })}>{["hospital", "clinic", "satellite"].map((t) => <option key={t}>{t}</option>)}</select></Label><div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} /></div></div>}
      {step === 1 && <div className="space-y-4"><Label>Subscription tier<select className="mt-1 w-full rounded-md border bg-background p-2" value={form.tier} onChange={(e) => { const tier = e.target.value as Tier; setForm({ ...form, tier, modules: modulesForTier(tier) }); }}>{["starter", "pro", "enterprise"].map((t) => <option key={t}>{t}</option>)}</select></Label>{MODULES.map((m) => <div key={m.key} className="flex items-center justify-between gap-3 border-b py-2"><Label htmlFor={`module-${m.key}`}>{m.label}</Label><Switch id={`module-${m.key}`} checked={form.modules[m.key]} onCheckedChange={(enabled) => setForm({ ...form, modules: { ...form.modules, [m.key]: enabled } })} /></div>)}</div>}
      {step === 2 && <div className="grid gap-4">{(["tax_pin", "currency", "website", "tagline"] as const).map((key) => <div key={key}><Label htmlFor={key} className="capitalize">{key.replace("_", " ")}</Label><Input id={key} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}</div>}
      <DialogFooter><Button variant="outline" onClick={() => step ? setStep(step - 1) : setOpen(false)}>{step ? "Back" : "Cancel"}</Button>{step < 2 ? <Button disabled={form.name.trim().length < 2 || !/^[A-Z0-9-]{2,20}$/.test(form.code)} onClick={() => setStep(step + 1)}>Next</Button> : <Button disabled={persist.isPending} onClick={() => persist.mutate()}>{persist.isPending ? "Saving…" : "Save facility"}</Button>}</DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!staffBranch} onOpenChange={(o) => !o && setStaffBranch(null)}><DialogContent><DialogHeader><DialogTitle>Staff · {staffBranch?.name}</DialogTitle></DialogHeader>{users.isLoading || members.isLoading ? <p>Loading staff…</p> : users.error || members.error ? <p role="alert" className="text-destructive">Unable to load staff.</p> : <div className="space-y-4">{members.data?.map((m) => <div key={m.user_id} className="flex items-center justify-between gap-2 border-b pb-2"><div className="min-w-0"><p className="truncate">{staff.find((u) => u.id === m.user_id)?.profile?.full_name ?? staff.find((u) => u.id === m.user_id)?.email ?? "Staff member"}</p><p className="text-xs text-muted-foreground">{m.role ?? "Existing roles"}</p></div><Button variant="ghost" size="sm" disabled={staffMutation.isPending} onClick={() => staffMutation.mutate({ userId: m.user_id, role: m.role ?? "", remove: true })}>Remove</Button></div>)}<Label>Staff member<select className="mt-1 w-full rounded-md border bg-background p-2" value={staffId} onChange={(e) => { setStaffId(e.target.value); setStaffRole(""); }}><option value="">Select staff</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.profile?.full_name ?? u.email}</option>)}</select></Label><Label>Facility role<select className="mt-1 w-full rounded-md border bg-background p-2" value={staffRole} onChange={(e) => setStaffRole(e.target.value)}><option value="">Select role</option>{roles.map((r) => <option key={r}>{r}</option>)}</select></Label><Button disabled={!staffId || !staffRole || staffMutation.isPending} onClick={() => staffMutation.mutate({ userId: staffId, role: staffRole })}>Assign staff</Button></div>}</DialogContent></Dialog>
  </div>;
}