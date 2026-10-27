import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { COUNCILS, daysUntil, licenseStatus, requiredCouncilForPosition } from "@/lib/license-rules";

export const Route = createFileRoute("/_authenticated/hr/me")({
  component: () => (
    <RoleGate path="/hr/me">
      <HrMePage />
    </RoleGate>
  ),
});

type Employee = {
  id: string;
  employee_no: string | null;
  full_name: string;
  national_id: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  position: string | null;
  department_id: string | null;
  supervisor_id: string | null;
  date_hired: string | null;
  contract_type: string | null;
  employment_status: string;
  job_grade: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
  qualifications: string | null;
  licenses: string | null;
  professional_memberships: string | null;
};

function HrMePage() {
  const { user } = useAuth();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState<Array<{ name: string; balance_days: number; used_days: number }>>([]);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [nextPayslip, setNextPayslip] = useState<string | null>(null);
  const [lics, setLics] = useState<Array<{ id: string; council: string; license_number: string; expiry_date: string }>>([]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase.from("employees" as never).select("*").eq("id", user.id).maybeSingle();
      setEmp(data as Employee | null);
      const year = new Date().getFullYear();
      const { data: lb } = await supabase
        .from("leave_balances" as never)
        .select("balance_days, used_days, leave_types(name)")
        .eq("employee_id", user.id)
        .eq("year", year);
      setBalances(((lb ?? []) as Array<{ balance_days: number; used_days: number; leave_types: { name: string } }>).map((r) => ({
        name: r.leave_types?.name ?? "—",
        balance_days: Number(r.balance_days),
        used_days: Number(r.used_days),
      })));
      const { count } = await supabase
        .from("leave_requests" as never).select("*", { count: "exact", head: true })
        .eq("employee_id", user.id).eq("status", "submitted");
      setPendingLeave(count ?? 0);
      const { data: pp } = await supabase
        .from("payroll_periods" as never).select("label, period_end").order("period_end", { ascending: false }).limit(1);
      setNextPayslip(((pp ?? []) as Array<{ label: string; period_end: string }>)[0]?.label ?? null);
      // The licence register may not exist yet in the database; ignore failures silently.
      const { data: lic } = await supabase
        .from("staff_licenses" as never).select("id, council, license_number, expiry_date")
        .eq("employee_id", user.id).order("expiry_date", { ascending: false });
      setLics((lic ?? []) as Array<{ id: string; council: string; license_number: string; expiry_date: string }>);
    })();
  }, [user]);

  async function save() {
    if (!emp || !user) return;
    setSaving(true);
    const { error } = await supabase.from("employees" as never).update({
      full_name: emp.full_name, national_id: emp.national_id, date_of_birth: emp.date_of_birth,
      gender: emp.gender, phone: emp.phone, email: emp.email, address: emp.address,
      emergency_contact_name: emp.emergency_contact_name, emergency_contact_phone: emp.emergency_contact_phone,
      bank_name: emp.bank_name, bank_branch: emp.bank_branch, bank_account: emp.bank_account,
      qualifications: emp.qualifications, licenses: emp.licenses, professional_memberships: emp.professional_memberships,
    } as never).eq("id", user.id);

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
  }

  if (!emp) return <p className="text-sm text-muted-foreground">Loading profile…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My HR profile</h1>
        <p className="text-sm text-muted-foreground">Personal employment details and leave overview.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KPI label="Employment status" value={emp.employment_status} />
        <KPI label="Pending leave requests" value={String(pendingLeave)} />
        <KPI label="Annual balance (days)" value={String(balances.find((b) => /annual/i.test(b.name))?.balance_days ?? 0)} />
        <KPI label="Next payroll" value={nextPayslip ?? "—"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <F label="Full name" v={emp.full_name} on={(v) => setEmp({ ...emp, full_name: v })} />
          <F label="Employee No" v={emp.employee_no ?? ""} readOnly />
          <F label="National ID" v={emp.national_id ?? ""} on={(v) => setEmp({ ...emp, national_id: v })} />
          <F label="Date of birth" type="date" v={emp.date_of_birth ?? ""} on={(v) => setEmp({ ...emp, date_of_birth: v })} />
          <F label="Gender" v={emp.gender ?? ""} on={(v) => setEmp({ ...emp, gender: v })} />
          <F label="Phone" v={emp.phone ?? ""} on={(v) => setEmp({ ...emp, phone: v })} />
          <F label="Email" v={emp.email ?? ""} on={(v) => setEmp({ ...emp, email: v })} />
          <F label="Address" v={emp.address ?? ""} on={(v) => setEmp({ ...emp, address: v })} />
          <F label="Emergency contact name" v={emp.emergency_contact_name ?? ""} on={(v) => setEmp({ ...emp, emergency_contact_name: v })} />
          <F label="Emergency contact phone" v={emp.emergency_contact_phone ?? ""} on={(v) => setEmp({ ...emp, emergency_contact_phone: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <F label="Position" v={emp.position ?? ""} readOnly />
          <F label="Contract type" v={emp.contract_type ?? ""} readOnly />
          <F label="Job grade" v={emp.job_grade ?? ""} readOnly />
          <F label="Date hired" v={emp.date_hired ?? ""} readOnly />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Banking</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <F label="Bank" v={emp.bank_name ?? ""} on={(v) => setEmp({ ...emp, bank_name: v })} />
          <F label="Branch" v={emp.bank_branch ?? ""} on={(v) => setEmp({ ...emp, bank_branch: v })} />
          <F label="Account number" v={emp.bank_account ?? ""} on={(v) => setEmp({ ...emp, bank_account: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Professional</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <F label="Qualifications" v={emp.qualifications ?? ""} on={(v) => setEmp({ ...emp, qualifications: v })} />
          <F label="Licenses" v={emp.licenses ?? ""} on={(v) => setEmp({ ...emp, licenses: v })} />
          <F label="Memberships" v={emp.professional_memberships ?? ""} on={(v) => setEmp({ ...emp, professional_memberships: v })} />
        </CardContent>
      </Card>

      <MyLicenses position={emp.position} lics={lics} />

      <Card>
        <CardHeader><CardTitle>Leave balances ({new Date().getFullYear()})</CardTitle></CardHeader>
        <CardContent>
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">No balances yet — HR has not initialised your leave entitlements.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr><th className="text-left p-1">Leave type</th><th className="text-right p-1">Balance</th><th className="text-right p-1">Used</th></tr>
              </thead>
              <tbody>
                {balances.map((b, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1">{b.name}</td>
                    <td className="p-1 text-right">{b.balance_days}</td>
                    <td className="p-1 text-right">{b.used_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </CardContent></Card>
  );
}

function F({ label, v, on, type = "text", readOnly = false }: { label: string; v: string; on?: (v: string) => void; type?: string; readOnly?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={v} readOnly={readOnly} onChange={(e) => on?.(e.target.value)} />
    </div>
  );
}

function MyLicenses({ position, lics }: { position: string | null; lics: Array<{ id: string; council: string; license_number: string; expiry_date: string }> }) {
  const today = new Date().toISOString().slice(0, 10);
  const required = requiredCouncilForPosition(position);
  const requiredLic = required ? lics.filter((l) => l.council === required).sort((a, b) => b.expiry_date.localeCompare(a.expiry_date))[0] : undefined;
  const requiredStatus = required ? licenseStatus(requiredLic?.expiry_date, today) : null;

  return (
    <Card>
      <CardHeader><CardTitle>My practising licence</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {required && (
          <p className="text-sm">
            Your role ({position ?? "—"}) requires a current {required} licence — {COUNCILS[required]}.{" "}
            {requiredStatus === "missing" && <span className="text-destructive font-medium">No {required} licence is on file — please contact HR immediately.</span>}
            {requiredStatus === "expired" && <span className="text-destructive font-medium">Your {required} licence has expired — you must not practise until it is renewed. Contact HR.</span>}
            {requiredStatus === "critical" && requiredLic && <span className="text-destructive font-medium">Your {required} licence expires in {daysUntil(requiredLic.expiry_date, today)} days — renew it now.</span>}
            {requiredStatus === "expiring" && requiredLic && <span className="text-muted-foreground">Your {required} licence expires in {daysUntil(requiredLic.expiry_date, today)} days.</span>}
            {requiredStatus === "valid" && <span className="text-muted-foreground">Your licence is current.</span>}
          </p>
        )}
        {lics.length === 0 ? (
          <p className="text-sm text-muted-foreground">No licences recorded yet. HR maintains the licence register.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr><th className="text-left p-1">Council</th><th className="text-left p-1">Number</th><th className="text-left p-1">Expires</th><th className="text-left p-1">Status</th></tr>
            </thead>
            <tbody>
              {lics.map((l) => {
                const s = licenseStatus(l.expiry_date, today);
                return (
                  <tr key={l.id} className="border-t">
                    <td className="p-1">{l.council}</td>
                    <td className="p-1">{l.license_number}</td>
                    <td className="p-1">{l.expiry_date}</td>
                    <td className="p-1"><Badge variant={s === "valid" ? "outline" : s === "expiring" ? "secondary" : "destructive"}>{s}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
