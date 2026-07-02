import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/soft-deleted")({
  component: SoftDeletedPage,
});

function SoftDeletedPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("patients");

  if (!hasRole("admin")) return <p className="text-muted-foreground">Admin only.</p>;

  const patients = useQuery({
    queryKey: ["soft-deleted-patients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("id, full_name, medical_record_number, deleted_at, deleted_by, deletion_reason")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as any[]) ?? [];
    },
  });

  const visits = useQuery({
    queryKey: ["soft-deleted-visits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits" as never)
        .select("id, patient_id, reason, status, deleted_at, deleted_by, deletion_reason")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as any[]) ?? [];
    },
  });

  async function restore(kind: "patient" | "visit", id: string) {
    const fn = kind === "patient" ? "restore_patient" : "restore_visit";
    const arg = kind === "patient" ? { _patient: id } : { _visit: id };
    const { error } = await supabase.rpc(fn as never, arg as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Restored");
      qc.invalidateQueries();
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Archive className="h-5 w-5 text-primary" /> Soft-deleted records
        </h1>
        <p className="text-sm text-muted-foreground">
          Admin-only recovery bin. Deletions are logged to the audit trail; restore returns the record to active use.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="patients">Patients ({patients.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="visits">Visits ({visits.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="patients">
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">MRN</th>
                  <th className="px-4 py-2 font-medium">Deleted</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {patients.data?.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Nothing here.</td></tr>
                )}
                {patients.data?.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2">{p.full_name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{p.medical_record_number}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(p.deleted_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-xs">{p.deletion_reason ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => restore("patient", p.id)}>Restore</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="visits">
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Reason</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Deleted</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {visits.data?.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Nothing here.</td></tr>
                )}
                {visits.data?.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-4 py-2">{v.reason ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{v.status}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(v.deleted_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-xs">{v.deletion_reason ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => restore("visit", v.id)}>Restore</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
