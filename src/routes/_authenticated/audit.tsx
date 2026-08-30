import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Pager, usePager } from "@/components/pager";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditLogs,
});

interface AuditRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  visit_id: string | null;
  patient_id: string | null;
  created_at: string;
}

function AuditLogs() {
  const { hasAnyRole } = useAuth();
  const allowed = hasAnyRole(["doctor", "nurse", "admin"]);

  const logs = useQuery({
    queryKey: ["audit-logs"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs" as never)
        .select("id, entity_type, entity_id, action, actor_id, visit_id, patient_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as unknown as AuditRow[]) ?? [];
    },
  });

  if (!allowed) {
    return <p className="text-muted-foreground">You do not have access to audit logs.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Shield className="h-5 w-5 text-primary" /> Audit log</h1>
        <p className="text-sm text-muted-foreground">Last 200 changes to clinical records.</p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Entity</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Visit</th>
            </tr>
          </thead>
          <tbody>
            {logs.isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {logs.data?.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No activity yet.</td></tr>}
            {logs.data?.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2 text-muted-foreground">{new Date(l.created_at).toLocaleString("en-GB")}</td>
                <td className="px-4 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{l.entity_type}</span></td>
                <td className="px-4 py-2 capitalize">{l.action}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{l.actor_id?.slice(0, 8) ?? "system"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{l.visit_id?.slice(0, 8) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
