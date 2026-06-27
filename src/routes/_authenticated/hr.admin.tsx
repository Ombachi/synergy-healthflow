import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/admin")({
  component: () => (
    <RoleGate path="/hr/admin">
      <HrAdminPage />
    </RoleGate>
  ),
});

type Dept = { id: string; name: string; code: string };
type Emp = {
  id: string; full_name: string; employee_no: string | null; position: string | null;
  department_id: string | null; supervisor_id: string | null; employment_status: string;
  contract_type: string | null; job_grade: string | null; date_hired: string | null;
};
type Lt = { id: string; name: string; default_days: number };
type Lb = { id: string; employee_id: string; leave_type_id: string; balance_days: number; used_days: number; year: number };

function HrAdminPage() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">HR administration</h1>
        <p className="text-sm text-muted-foreground">Manage staff records, departments, and annual leave balances.</p>
      </div>

      <KPIBlock />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="balances">Leave balances</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewPanel /></TabsContent>
        <TabsContent value="employees"><EmployeesPanel /></TabsContent>
        <TabsContent value="departments"><DepartmentsPanel /></TabsContent>
        <TabsContent value="balances"><BalancesPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function KPIBlock() {
  const [stats, setStats] = useState({ total: 0, active: 0, onLeave: 0, pending: 0 });
  useEffect(() => {
    void (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [a, b, c, d] = await Promise.all([
        supabase.from("employees" as never).select("*", { count: "exact", head: true }),
        supabase.from("employees" as never).select("*", { count: "exact", head: true }).eq("employment_status", "active"),
        supabase.from("leave_requests" as never).select("*", { count: "exact", head: true })
          .eq("status", "approved").lte("start_date", today).gte("end_date", today),
        supabase.from("leave_requests" as never).select("*", { count: "exact", head: true }).eq("status", "submitted"),
      ]);
      setStats({ total: a.count ?? 0, active: b.count ?? 0, onLeave: c.count ?? 0, pending: d.count ?? 0 });
    })();
  }, []);
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <KPI label="Total employees" value={stats.total} />
      <KPI label="Active" value={stats.active} />
      <KPI label="On leave today" value={stats.onLeave} />
      <KPI label="Pending leave approvals" value={stats.pending} />
    </div>
  );
}

function KPI({ label, value }: { label: string; value: number }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </CardContent></Card>
  );
}

function OverviewPanel() {
  const [latestHires, setLatestHires] = useState<Emp[]>([]);
  const [perDept, setPerDept] = useState<Array<{ dept: string; count: number }>>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("employees" as never)
        .select("id,full_name,employee_no,position,date_hired").order("date_hired", { ascending: false, nullsFirst: false }).limit(8);
      setLatestHires((data ?? []) as Emp[]);
      const { data: all } = await supabase.from("employees" as never)
        .select("department_id, hr_departments(name)");
      const map = new Map<string, number>();
      ((all ?? []) as Array<{ hr_departments: { name: string } | null }>).forEach((r) => {
        const k = r.hr_departments?.name ?? "Unassigned";
        map.set(k, (map.get(k) ?? 0) + 1);
      });
      setPerDept(Array.from(map.entries()).map(([dept, count]) => ({ dept, count })).sort((a, b) => b.count - a.count));
    })();
  }, []);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Headcount by department</CardTitle></CardHeader>
        <CardContent>
          {perDept.length === 0 ? <p className="text-sm text-muted-foreground">No data.</p> : (
            <div className="space-y-2">
              {perDept.map((r) => {
                const max = perDept[0].count || 1;
                const pct = (r.count / max) * 100;
                return (
                  <div key={r.dept}>
                    <div className="flex justify-between text-xs"><span>{r.dept}</span><span className="font-medium">{r.count}</span></div>
                    <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent hires</CardTitle></CardHeader>
        <CardContent>
          {latestHires.length === 0 ? <p className="text-sm text-muted-foreground">No employees yet.</p> : (
            <ul className="space-y-2 text-sm">
              {latestHires.map((e) => (
                <li key={e.id} className="flex justify-between border-b last:border-0 py-1">
                  <span>{e.full_name} <span className="text-xs text-muted-foreground">{e.position ?? ""}</span></span>
                  <span className="text-xs text-muted-foreground">{e.date_hired ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeesPanel() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<Emp | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("employees" as never)
        .select("id,full_name,employee_no,position,department_id,supervisor_id,employment_status,contract_type,job_grade,date_hired")
        .order("full_name").limit(500);
      setEmps((data ?? []) as Emp[]);
      const { data: d } = await supabase.from("hr_departments" as never).select("id,name,code").order("name");
      setDepts((d ?? []) as Dept[]);
    })();
  }, [refresh]);

  const filtered = emps.filter((e) =>
    !query || `${e.full_name} ${e.employee_no ?? ""} ${e.position ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );

  async function save() {
    if (!editing) return;
    const { error } = await supabase.from("employees" as never).update({
      position: editing.position, department_id: editing.department_id, supervisor_id: editing.supervisor_id,
      employment_status: editing.employment_status, contract_type: editing.contract_type,
      job_grade: editing.job_grade, date_hired: editing.date_hired,
    } as never).eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Employee updated");
    setEditing(null); setRefresh((x) => x + 1);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Employees ({filtered.length})</CardTitle>
          <Input className="w-64" placeholder="Search name, no., position" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Emp No</th>
              <th className="text-left p-2">Position</th>
              <th className="text-left p-2">Department</th>
              <th className="text-left p-2">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{e.full_name}</td>
                <td className="p-2">{e.employee_no ?? "—"}</td>
                <td className="p-2">{e.position ?? "—"}</td>
                <td className="p-2">{depts.find((d) => d.id === e.department_id)?.name ?? "—"}</td>
                <td className="p-2"><Badge variant="outline">{e.employment_status}</Badge></td>
                <td className="p-2 text-right"><Button size="sm" variant="outline" onClick={() => setEditing(e)}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit employee</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Name</Label><Input value={editing.full_name} readOnly /></div>
              <div className="space-y-1"><Label>Position</Label><Input value={editing.position ?? ""} onChange={(ev) => setEditing({ ...editing, position: ev.target.value })} /></div>
              <div className="space-y-1">
                <Label>Department</Label>
                <Select value={editing.department_id ?? ""} onValueChange={(v) => setEditing({ ...editing, department_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Supervisor</Label>
                <Select value={editing.supervisor_id ?? ""} onValueChange={(v) => setEditing({ ...editing, supervisor_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{emps.filter((x) => x.id !== editing.id).map((x) => <SelectItem key={x.id} value={x.id}>{x.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editing.employment_status} onValueChange={(v) => setEditing({ ...editing, employment_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["active", "probation", "suspended", "terminated", "resigned", "on_leave"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Contract type</Label><Input value={editing.contract_type ?? ""} onChange={(ev) => setEditing({ ...editing, contract_type: ev.target.value })} /></div>
              <div className="space-y-1"><Label>Job grade</Label><Input value={editing.job_grade ?? ""} onChange={(ev) => setEditing({ ...editing, job_grade: ev.target.value })} /></div>
              <div className="space-y-1"><Label>Date hired</Label><Input type="date" value={editing.date_hired ?? ""} onChange={(ev) => setEditing({ ...editing, date_hired: ev.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DepartmentsPanel() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("hr_departments" as never).select("id,name,code").order("name");
      setDepts((data ?? []) as Dept[]);
    })();
  }, [refresh]);
  async function add() {
    if (!name || !code) return;
    const { error } = await supabase.from("hr_departments" as never).insert({ name, code } as never);
    if (error) { toast.error(error.message); return; }
    setName(""); setCode(""); setRefresh((x) => x + 1);
  }
  return (
    <Card>
      <CardHeader><CardTitle>Departments</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Name (e.g. Radiology)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Code (e.g. RAD)" value={code} onChange={(e) => setCode(e.target.value)} className="w-32" />
          <Button onClick={add}>Add</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground"><tr><th className="text-left p-2">Name</th><th className="text-left p-2">Code</th></tr></thead>
          <tbody>{depts.map((d) => <tr key={d.id} className="border-t"><td className="p-2">{d.name}</td><td className="p-2">{d.code}</td></tr>)}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function BalancesPanel() {
  const [types, setTypes] = useState<Lt[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [bals, setBals] = useState<Lb[]>([]);
  const [empId, setEmpId] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void (async () => {
      const { data: t } = await supabase.from("leave_types" as never).select("id,name,default_days").order("name");
      setTypes((t ?? []) as Lt[]);
      const { data: e } = await supabase.from("employees" as never).select("id,full_name,employee_no,position,department_id,supervisor_id,employment_status,contract_type,job_grade,date_hired").order("full_name");
      setEmps((e ?? []) as Emp[]);
    })();
  }, []);

  useEffect(() => {
    if (!empId) { setBals([]); return; }
    void (async () => {
      const { data } = await supabase.from("leave_balances" as never).select("*").eq("employee_id", empId).eq("year", year);
      setBals((data ?? []) as Lb[]);
    })();
  }, [empId, year, refresh]);

  async function initialize() {
    if (!empId) return;
    const rows = types.map((t) => {
      const existing = bals.find((b) => b.leave_type_id === t.id);
      if (existing) return null;
      return { employee_id: empId, leave_type_id: t.id, year, balance_days: t.default_days, used_days: 0 };
    }).filter(Boolean);
    if (rows.length === 0) { toast.info("Balances already initialised"); return; }
    const { error } = await supabase.from("leave_balances" as never).insert(rows as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Balances initialised");
    setRefresh((x) => x + 1);
  }

  async function setBalance(id: string, balance_days: number) {
    const { error } = await supabase.from("leave_balances" as never).update({ balance_days } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRefresh((x) => x + 1);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Leave balances</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 w-72">
            <Label className="text-xs">Employee</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue placeholder="Pick employee" /></SelectTrigger>
              <SelectContent>{emps.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1 w-32">
            <Label className="text-xs">Year</Label>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          {empId && <Button variant="outline" onClick={initialize}>Initialise from defaults</Button>}
        </div>

        {empId && (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left p-2">Leave type</th>
                <th className="text-right p-2">Balance days</th>
                <th className="text-right p-2">Used</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => {
                const b = bals.find((x) => x.leave_type_id === t.id);
                return (
                  <tr key={t.id} className="border-t">
                    <td className="p-2">{t.name}</td>
                    <td className="p-2 text-right">
                      {b ? (
                        <Input type="number" className="w-24 ml-auto"
                          defaultValue={b.balance_days}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (n !== b.balance_days) void setBalance(b.id, n);
                          }} />
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-right">{b?.used_days ?? "—"}</td>
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
