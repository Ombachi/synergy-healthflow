import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useFacility } from "@/components/facility-context";
import { hrStaffOptions, onboardEmployee, type StaffOption } from "@/lib/hr.functions";
import { onboardingSchema } from "@/lib/hr-rules";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EmployeeOnboarding({ onSaved }: { onSaved: () => void }) {
  const { activeFacility, error: facilityError, loading: facilityLoading } = useFacility();
  const loadStaff = useServerFn(hrStaffOptions);
  const saveEmployee = useServerFn(onboardEmployee);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [types, setTypes] = useState<{ id: string; name: string; default_days_per_year: number }[]>([]);
  const [userId, setUserId] = useState("");
  const [position, setPosition] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [year, setYear] = useState(2026);
  const [quotas, setQuotas] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(""); setUserId(""); setStaff([]); setQuotas({});
    setPosition(""); setDepartmentId(""); setYear(new Date().getFullYear()); setTypes([]); setDepts([]);
    void (async () => {
      const [accounts, d, t] = await Promise.all([
        loadStaff({ data: { facilityId: activeFacility.id } }),
        supabase.from("hr_departments" as never).select("id,name").order("name"),
        supabase.from("leave_types" as never).select("id,name,default_days_per_year").order("name"),
      ]);
      if (d.error || t.error) throw new Error("Departments and leave types could not be loaded.");
      if (cancelled) return;
      const leaveTypes = (t.data ?? []) as unknown as typeof types;
      setStaff(accounts.filter(a => !a.onboarded)); setDepts((d.data ?? []) as unknown as typeof depts);
      setTypes(leaveTypes); setQuotas(Object.fromEntries(leaveTypes.map(t => [t.id, String(t.default_days_per_year)])));
    })().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load staff."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, activeFacility.id, loadStaff, retry]);

  async function save() {
    if (saving || loading || facilityLoading || facilityError) return;
    const parsed = onboardingSchema.safeParse({ facilityId: activeFacility.id, userId, position, departmentId, year,
      quotas: types.map(t => ({ leaveTypeId: t.id, days: quotas[t.id]?.trim() ? Number(quotas[t.id]) : NaN })) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Complete all fields."); return; }
    setSaving(true); setError("");
    try { await saveEmployee({ data: parsed.data }); toast.success("Employee onboarded with initial leave balances"); setOpen(false); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Employee was not saved."); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}>
    <DialogTrigger asChild><Button disabled={facilityLoading || !!facilityError}><UserPlus className="mr-2 h-4 w-4" />Add employee</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Add employee — {activeFacility.name}</DialogTitle></DialogHeader>
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading staff accounts…</p> : <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2"><Label>System staff account</Label><Select value={userId} onValueChange={setUserId}><SelectTrigger><SelectValue placeholder="Select assigned staff account" /></SelectTrigger><SelectContent>{staff.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}</SelectContent></Select>{!error && !staff.length && <p className="text-sm text-muted-foreground">No staff accounts awaiting onboarding in this branch.</p>}</div>
        <div className="space-y-1"><Label htmlFor="onboard-title">Job title</Label><Input id="onboard-title" maxLength={150} value={position} onChange={e => setPosition(e.target.value)} /></div>
        <div className="space-y-1"><Label>Department</Label><Select value={departmentId} onValueChange={setDepartmentId}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="quota-year">Leave quota year</Label><Input id="quota-year" type="number" min={2000} max={2100} value={year} onChange={e => setYear(Number(e.target.value))} /></div>
        <h3 className="font-medium sm:col-span-2">Initial leave quota (days)</h3>
        {types.map(t => <div key={t.id} className="space-y-1"><Label htmlFor={`quota-${t.id}`}>{t.name}</Label><Input id={`quota-${t.id}`} type="number" min={0} max={366} step="0.5" value={quotas[t.id] ?? ""} onChange={e => setQuotas(q => ({ ...q, [t.id]: e.target.value }))} /></div>)}
      </div>}
      {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p>{!staff.length && <Button variant="outline" disabled={loading} onClick={() => setRetry(n => n + 1)}>Retry loading</Button>}</div>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={loading || saving || !staff.length || !types.length} onClick={save}>{saving ? "Saving…" : "Create employee"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}