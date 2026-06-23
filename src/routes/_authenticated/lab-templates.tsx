import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/lab-templates")({
  component: LabTemplatesPage,
});

interface Test { id: string; code: string; name: string }
interface Tmpl {
  id: string; test_id: string; parameter_name: string; units: string | null;
  reference_range: string | null;
  reference_low: number | null; reference_high: number | null;
  critical_low: number | null; critical_high: number | null;
  input_type: string; select_options: string | null; display_order: number;
}

const EMPTY: Omit<Tmpl, "id" | "test_id"> = {
  parameter_name: "", units: "", reference_range: "",
  reference_low: null, reference_high: null, critical_low: null, critical_high: null,
  input_type: "numeric", select_options: "", display_order: 0,
};

function LabTemplatesPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const tests = useQuery({
    queryKey: ["labtpl-tests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_tests_catalog" as never).select("id, code, name").order("name");
      if (error) throw error; return (data as unknown as Test[]) ?? [];
    },
  });

  const tmpl = useQuery({
    queryKey: ["labtpl", selectedTest],
    enabled: !!selectedTest,
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_result_templates" as never)
        .select("*").eq("test_id", selectedTest!).order("display_order");
      if (error) throw error; return (data as unknown as Tmpl[]) ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!selectedTest || !form.parameter_name.trim()) throw new Error("Parameter name required");
      const { error } = await supabase.from("lab_result_templates" as never).insert({
        test_id: selectedTest,
        parameter_name: form.parameter_name.trim(),
        units: form.units || null,
        reference_range: form.reference_range || null,
        reference_low: form.reference_low,
        reference_high: form.reference_high,
        critical_low: form.critical_low,
        critical_high: form.critical_high,
        input_type: form.input_type,
        select_options: form.select_options || null,
        display_order: tmpl.data?.length ?? 0,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ ...EMPTY });
      qc.invalidateQueries({ queryKey: ["labtpl", selectedTest] });
      toast.success("Parameter added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lab_result_templates" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labtpl", selectedTest] }),
  });

  if (!hasRole("admin")) return <p className="text-sm text-muted-foreground">Admin access only.</p>;

  const numOrNull = (s: string) => s.trim() === "" ? null : Number(s);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><FlaskConical className="h-6 w-6 text-primary" /> Lab result templates</h1>
        <p className="text-sm text-muted-foreground">Define the parameter rows that lab scientists fill in for each test. Reference ranges drive automatic abnormal flagging.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="rounded-lg border bg-card">
          <div className="border-b p-3 text-sm font-medium">Tests</div>
          <div className="max-h-[60vh] overflow-auto">
            {tests.data?.map((t) => (
              <button key={t.id} onClick={() => setSelectedTest(t.id)}
                className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm hover:bg-accent/40 ${selectedTest === t.id ? "bg-accent" : ""}`}>
                <span>{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.code}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          {!selectedTest ? (
            <div className="p-6 text-sm text-muted-foreground">Select a test to manage its template.</div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs">
                    <tr>
                      <th className="p-2 text-left">Parameter</th>
                      <th className="p-2 text-left">Units</th>
                      <th className="p-2 text-left">Reference</th>
                      <th className="p-2 text-left">Critical</th>
                      <th className="p-2 text-left">Type</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tmpl.data ?? []).length === 0 && (
                      <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No parameters defined yet.</td></tr>
                    )}
                    {tmpl.data?.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2 font-medium">{r.parameter_name}</td>
                        <td className="p-2">{r.units ?? "—"}</td>
                        <td className="p-2">{r.reference_range ?? (r.reference_low != null || r.reference_high != null ? `${r.reference_low ?? ""}–${r.reference_high ?? ""}` : "—")}</td>
                        <td className="p-2">{(r.critical_low != null || r.critical_high != null) ? `${r.critical_low ?? ""} / ${r.critical_high ?? ""}` : "—"}</td>
                        <td className="p-2 capitalize">{r.input_type}</td>
                        <td className="p-2 text-right">
                          <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">Add parameter</div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4"><Label className="text-xs">Name</Label><Input value={form.parameter_name} onChange={(e) => setForm({ ...form, parameter_name: e.target.value })} /></div>
                  <div className="col-span-2"><Label className="text-xs">Units</Label><Input value={form.units ?? ""} onChange={(e) => setForm({ ...form, units: e.target.value })} /></div>
                  <div className="col-span-3"><Label className="text-xs">Reference range (text)</Label><Input value={form.reference_range ?? ""} onChange={(e) => setForm({ ...form, reference_range: e.target.value })} /></div>
                  <div className="col-span-3"><Label className="text-xs">Input type</Label>
                    <select className="h-9 w-full rounded border bg-background px-2 text-sm" value={form.input_type} onChange={(e) => setForm({ ...form, input_type: e.target.value })}>
                      <option value="numeric">Numeric</option>
                      <option value="text">Text</option>
                      <option value="select">Select</option>
                    </select>
                  </div>

                  <div className="col-span-3"><Label className="text-xs">Reference low</Label><Input type="number" value={form.reference_low ?? ""} onChange={(e) => setForm({ ...form, reference_low: numOrNull(e.target.value) })} /></div>
                  <div className="col-span-3"><Label className="text-xs">Reference high</Label><Input type="number" value={form.reference_high ?? ""} onChange={(e) => setForm({ ...form, reference_high: numOrNull(e.target.value) })} /></div>
                  <div className="col-span-3"><Label className="text-xs">Critical low</Label><Input type="number" value={form.critical_low ?? ""} onChange={(e) => setForm({ ...form, critical_low: numOrNull(e.target.value) })} /></div>
                  <div className="col-span-3"><Label className="text-xs">Critical high</Label><Input type="number" value={form.critical_high ?? ""} onChange={(e) => setForm({ ...form, critical_high: numOrNull(e.target.value) })} /></div>

                  {form.input_type === "select" && (
                    <div className="col-span-12"><Label className="text-xs">Select options (comma separated)</Label>
                      <Input value={form.select_options ?? ""} onChange={(e) => setForm({ ...form, select_options: e.target.value })} placeholder="positive, negative, indeterminate" /></div>
                  )}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button onClick={() => add.mutate()} disabled={add.isPending}><Plus className="h-4 w-4" /> Add parameter</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
