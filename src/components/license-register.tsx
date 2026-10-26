import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { COUNCILS, daysUntil, licenseStatus, validateLicense, type LicenseStatus } from "@/lib/license-rules";

type Lic = { id: string; employee_id: string; council: string; license_number: string; issue_date: string | null; expiry_date: string };
type Emp = { id: string; full_name: string };
const today = () => new Date().toISOString().slice(0, 10);
const tone: Record<LicenseStatus, "default" | "secondary" | "destructive" | "outline"> = {
  valid: "outline", expiring: "secondary", critical: "destructive", expired: "destructive", missing: "destructive",
};

/** Staff ids are the active branch's staff; all reads stay inside that list. */
export function LicenseRegister({ staffIds }: { staffIds: string[] }) {
  const [rows, setRows] = useState<Lic[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);
  const [f, setF] = useState({ employee_id: "", council: "", license_number: "", issue_date: "", expiry_date: "" });

  useEffect(() => {
    if (!staffIds.length) return;
    void (async () => {
      setError("");
      const [l, e] = await Promise.all([
        supabase.from("staff_licenses" as never).select("*").in("employee_id", staffIds).order("expiry_date"),
        supabase.from("employees" as never).select("id,full_name").in("id", staffIds).order("full_name"),
      ]);
      if (l.error) setError("The licence register isn't available yet — the database update hasn't been applied.");
      setRows((l.data ?? []) as Lic[]);
      setEmps((e.data ?? []) as Emp[]);
    })();
  }, [staffIds, rev]);

  async function save() {
    try { validateLicense(f); } catch (e) { toast.error((e as Error).message); return; }
    if (!f.employee_id) { toast.error("Choose a staff member."); return; }
    const { error } = await supabase.from("staff_licenses" as never).insert({ ...f, issue_date: f.issue_date || null } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Licence saved");
    setF({ employee_id: "", council: "", license_number: "", issue_date: "", expiry_date: "" }); setRev((r) => r + 1);
  }

  const name = (id: string) => emps.find((e) => e.id === id)?.full_name ?? "—";
  const t = today();
  const alerts = rows.filter((r) => licenseStatus(r.expiry_date, t) !== "valid");

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {alerts.length > 0 && (
        <Card className="border-destructive">
          <CardHeader><CardTitle>Licences needing renewal ({alerts.length})</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {alerts.map((r) => {
              const d = daysUntil(r.expiry_date, t);
              return <p key={r.id}>{name(r.employee_id)} — {r.council} {r.license_number}: {d < 0 ? `expired ${-d} days ago` : `expires in ${d} days`}</p>;
            })}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Add licence</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1"><Label>Staff member</Label>
            <Select value={f.employee_id} onValueChange={(v) => setF({ ...f, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{emps.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Council</Label>
            <Select value={f.council} onValueChange={(v) => setF({ ...f, council: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{Object.entries(COUNCILS).map(([k, v]) => <SelectItem key={k} value={k}>{k} — {v}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Licence number</Label><Input value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} /></div>
          <div className="space-y-1"><Label>Issue date</Label><Input type="date" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} /></div>
          <div className="space-y-1"><Label>Expiry date</Label><Input type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} /></div>
          <div className="flex items-end"><Button onClick={save} disabled={!!error}>Save licence</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Licence register</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">No licences recorded.</p> : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground"><tr><th className="text-left p-2">Staff</th><th className="text-left p-2">Council</th><th className="text-left p-2">Number</th><th className="text-left p-2">Expires</th><th className="text-left p-2">Status</th></tr></thead>
              <tbody>{rows.map((r) => { const s = licenseStatus(r.expiry_date, t); return (
                <tr key={r.id} className="border-t"><td className="p-2">{name(r.employee_id)}</td><td className="p-2">{r.council}</td><td className="p-2">{r.license_number}</td><td className="p-2">{r.expiry_date}</td><td className="p-2"><Badge variant={tone[s]}>{s}</Badge></td></tr>
              ); })}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
