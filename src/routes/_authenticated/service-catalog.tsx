import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/service-catalog")({
  component: () => <RoleGate path="/service-catalog"><ServiceCatalogPage /></RoleGate>,
});

interface Service {
  id: string; code: string; name: string; category: string; unit_price_cents: number; active: boolean;
}

function ServiceCatalogPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Service | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", category: "general", unit_price: 0 });

  const list = useQuery({
    queryKey: ["service-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_catalog" as never).select("*").order("category").order("name");
      if (error) throw error;
      return (data as unknown as Service[]) ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        category: form.category,
        unit_price_cents: Math.round(Number(form.unit_price) * 100),
      };
      if (!payload.code || !payload.name) throw new Error("Code and name required");
      if (editing) {
        const { error } = await supabase.from("service_catalog" as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_catalog" as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setOpen(false); setEditing(null); setForm({ code: "", name: "", category: "general", unit_price: 0 });
      qc.invalidateQueries({ queryKey: ["service-catalog"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: Service) => {
      const { error } = await supabase.from("service_catalog" as never)
        .update({ active: !s.active } as never).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-catalog"] }),
  });

  function openEdit(s: Service) {
    setEditing(s);
    setForm({ code: s.code, name: s.name, category: s.category, unit_price: s.unit_price_cents / 100 });
    setOpen(true);
  }
  function openNew() {
    setEditing(null);
    setForm({ code: "", name: "", category: "general", unit_price: 0 });
    setOpen(true);
  }

  const grouped = (list.data ?? []).reduce<Record<string, Service[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s); return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Receipt className="h-6 w-6 text-primary" /> Service catalog</h1>
          <p className="text-sm text-muted-foreground">Billable services and unit prices used for invoicing.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4" /> New service</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} service</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                <div><Label>Unit price (KES)</Label><Input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="rounded-lg border bg-card">
          <div className="border-b p-3 font-medium capitalize">{cat}</div>
          <div className="divide-y">
            {items.map((s) => (
              <div key={s.id} className="grid grid-cols-12 items-center gap-2 p-3 text-sm">
                <div className="col-span-3 font-mono text-primary">{s.code}</div>
                <div className="col-span-5">{s.name}</div>
                <div className="col-span-2 text-right font-medium">KES {(s.unit_price_cents / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
                <div className="col-span-2 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant={s.active ? "outline" : "secondary"} onClick={() => toggleActive.mutate(s)}>
                    {s.active ? "Active" : "Inactive"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
