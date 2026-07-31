import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/controlled-drugs")({
  component: ControlledDrugs,
});

interface CDR {
  id: string;
  drug_name: string;
  schedule: string;
  direction: string;
  qty: number;
  balance_after: number | null;
  patient_id: string | null;
  prescriber_id: string | null;
  dispenser_id: string | null;
  witness_id: string | null;
  notes: string | null;
  created_at: string;
}

function ControlledDrugs() {
  const { hasAnyRole } = useAuth();
  const allowed = hasAnyRole(["pharmacist", "admin"]);

  const rows = useQuery({
    queryKey: ["cdr"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("controlled_drug_register" as never)
        .select("id, drug_name, schedule, direction, qty, balance_after, patient_id, prescriber_id, dispenser_id, witness_id, notes, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as unknown as CDR[]) ?? [];
    },
  });

  if (!allowed) return <p className="text-muted-foreground">Pharmacists and admins only.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldAlert className="h-5 w-5 text-primary" /> Controlled Drugs Register
        </h1>
        <p className="text-sm text-muted-foreground">
          Statutory register of scheduled narcotics (Schedules I–V). Auto-posted from pharmacy dispenses.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Drug</th>
              <th className="px-3 py-2">Sch</th>
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Patient</th>
              <th className="px-3 py-2">Dispenser</th>
              <th className="px-3 py-2">Witness</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.isLoading && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {rows.data?.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">No entries yet.</td></tr>}
            {rows.data?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-GB")}</td>
                <td className="px-3 py-2 font-medium">{r.drug_name}</td>
                <td className="px-3 py-2"><span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">Sch {r.schedule}</span></td>
                <td className="px-3 py-2 capitalize">{r.direction}</td>
                <td className="px-3 py-2 text-right">{r.qty}</td>
                <td className="px-3 py-2 text-right font-mono">{r.balance_after ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.patient_id?.slice(0, 8) ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.dispenser_id?.slice(0, 8) ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.witness_id?.slice(0, 8) ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
