import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface VisitRow {
  id: string;
  patient_id: string;
  status: string;
  triage_level: string | null;
  current_stage: string | null;
  opened_at: string;
}
interface PatientRow { id: string; full_name: string }

export function MyActivePatients() {
  const { user, hasAnyRole } = useAuth();
  const isClinical = hasAnyRole(["doctor", "nurse", "admin"]);

  const visits = useQuery({
    queryKey: ["my-active-visits", user?.id],
    enabled: !!user && isClinical,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits" as never)
        .select("id, patient_id, status, triage_level, current_stage, opened_at")
        .or(`assigned_doctor_id.eq.${user!.id},assigned_nurse_id.eq.${user!.id}`)
        .neq("status", "completed")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as VisitRow[]) ?? [];
    },
  });

  const ids = visits.data?.map((v) => v.patient_id) ?? [];
  const patients = useQuery({
    queryKey: ["my-active-patient-names", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("id, full_name")
        .in("id", ids as never);
      if (error) throw error;
      return (data as unknown as PatientRow[]) ?? [];
    },
  });

  if (!isClinical) return null;
  const name = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);

  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="flex items-center gap-2 font-medium">
        <ClipboardList className="h-4 w-4 text-primary" /> My active patients
      </h2>
      {visits.isLoading && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
      {visits.data?.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No patients currently assigned to you.</p>
      )}
      <ul className="mt-3 divide-y">
        {visits.data?.map((v) => (
          <li key={v.id}>
            <Link
              to="/visits/$visitId"
              params={{ visitId: v.id }}
              className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-accent/50 rounded px-2 -mx-2"
            >
              <div>
                <div className="font-medium">{name(v.patient_id)}</div>
                <div className="text-xs text-muted-foreground">
                  Opened {new Date(v.opened_at).toLocaleString("en-GB")}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {v.current_stage && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary capitalize">{v.current_stage}</span>
                )}
                {v.triage_level && v.triage_level !== "routine" && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600 capitalize">{v.triage_level}</span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
