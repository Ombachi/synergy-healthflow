import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { RoleGate } from "@/components/role-gate";
import { Pager, usePager } from "@/components/pager";

export const Route = createFileRoute("/_authenticated/patients")({
  component: () => (
    <RoleGate path="/patients">
      <PatientsPage />
    </RoleGate>
  ),
});

interface PatientRow {
  id: string;
  full_name: string;
  medical_record_number: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  id_type: string;
  id_number: string | null;
  insurance_provider: string | null;
  insurance_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
}



function PatientsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  
  const [editing, setEditing] = useState<PatientRow | null>(null);
  const [form, setForm] = useState<Partial<PatientRow>>({});

  const patients = useQuery({
    queryKey: ["patient-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as PatientRow[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = patients.data ?? [];
    if (!q) return list;
    return list.filter((p) =>
      `${p.full_name} ${p.medical_record_number ?? ""} ${p.phone ?? ""} ${p.id_number ?? ""} ${p.email ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [patients.data, search]);
  const pager = usePager(filtered, 25);

  
  

  const update = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("patients" as never)
        .update({
          full_name: form.full_name?.trim() || editing.full_name,
          date_of_birth: form.date_of_birth || null,
          gender: form.gender || null,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          id_type: form.id_type || editing.id_type,
          id_number: form.id_number || null,
          insurance_provider: form.insurance_provider || null,
          insurance_number: form.insurance_number || null,
          emergency_contact_name: form.emergency_contact_name || null,
          emergency_contact_phone: form.emergency_contact_phone || null,
        } as never)
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient-directory"] });
      setEditing(null);
      toast.success("Patient updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (p: PatientRow) => {
    setEditing(p);
    setForm({ ...p });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Users className="h-6 w-6 text-primary" /> Patient directory
        </h1>
        <p className="text-sm text-muted-foreground">
          Every registered patient. Search and update their details.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, MRN, phone, ID number…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              pager.setPage(0);
            }}
            className="pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} patient{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Patient</th>
              <th className="px-3 py-2">MRN</th>
              <th className="px-3 py-2">DOB</th>
              <th className="px-3 py-2">Gender</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">ID number</th>
              <th className="px-3 py-2">Registered</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {patients.isLoading && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading patients…</td></tr>
            )}
            {!patients.isLoading && pager.slice.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No patients{search ? " match your search" : ""}.</td></tr>
            )}
            {pager.slice.map((p) => (
              <tr key={p.id} className="border-t hover:bg-accent/40">
                <td className="px-3 py-2 font-medium">
                  <Link to="/reception" className="hover:underline">{p.full_name}</Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.medical_record_number ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString("en-GB") : "—"}
                </td>
                <td className="px-3 py-2 capitalize text-muted-foreground">{p.gender ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.phone ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.id_number ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(p.created_at).toLocaleDateString("en-GB")}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label={`Edit ${p.full_name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager {...pager} label="patients" />

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit patient · <span className="font-mono text-sm">{editing?.medical_record_number}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Full name</Label>
              <Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Date of birth</Label>
              <Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender ?? ""} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>ID type</Label>
              <Select value={form.id_type ?? "national_id"} onValueChange={(v) => setForm({ ...form, id_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="national_id">National ID</SelectItem>
                  <SelectItem value="passport">Passport</SelectItem>
                  <SelectItem value="birth_certificate">Birth certificate</SelectItem>
                  <SelectItem value="alien_id">Alien ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ID number</Label>
              <Input value={form.id_number ?? ""} onChange={(e) => setForm({ ...form, id_number: e.target.value })} />
            </div>
            <div>
              <Label>Insurance provider</Label>
              <Input value={form.insurance_provider ?? ""} onChange={(e) => setForm({ ...form, insurance_provider: e.target.value })} />
            </div>
            <div>
              <Label>Insurance number</Label>
              <Input value={form.insurance_number ?? ""} onChange={(e) => setForm({ ...form, insurance_number: e.target.value })} />
            </div>
            <div>
              <Label>Emergency contact name</Label>
              <Input value={form.emergency_contact_name ?? ""} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} />
            </div>
            <div>
              <Label>Emergency contact phone</Label>
              <Input value={form.emergency_contact_phone ?? ""} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => update.mutate()} disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
