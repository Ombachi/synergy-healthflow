import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface ActiveAdmission {
  id: string;
  patient_id: string;
  bed_id: string | null;
  admitted_at: string;
  admission_reason: string | null;
  primary_diagnosis: string | null;
  patient_name?: string;
  bed_code?: string;
  ward_name?: string;
}

export function useActiveAdmissions() {
  return useQuery({
    queryKey: ["haims-active-admissions"],
    queryFn: async (): Promise<ActiveAdmission[]> => {
      const { data: adm } = await supabase
        .from("admissions" as never)
        .select("*")
        .eq("status", "active")
        .order("admitted_at", { ascending: false });
      const list = (adm as unknown as ActiveAdmission[]) ?? [];
      if (list.length === 0) return [];
      const pIds = Array.from(new Set(list.map((a) => a.patient_id)));
      const bIds = Array.from(new Set(list.map((a) => a.bed_id).filter(Boolean) as string[]));
      const { data: pats } = await supabase.from("patients" as never).select("id, full_name").in("id", pIds as never);
      const { data: beds } = await supabase.from("beds" as never).select("id, code, ward_id").in("id", bIds as never);
      const wardIds = Array.from(new Set(((beds as { ward_id: string }[]) ?? []).map((b) => b.ward_id)));
      const { data: wards } = await supabase.from("wards" as never).select("id, name").in("id", wardIds as never);
      const pMap = new Map(((pats as { id: string; full_name: string }[]) ?? []).map((p) => [p.id, p.full_name]));
      const bMap = new Map(((beds as { id: string; code: string; ward_id: string }[]) ?? []).map((b) => [b.id, b]));
      const wMap = new Map(((wards as { id: string; name: string }[]) ?? []).map((w) => [w.id, w.name]));
      return list.map((a) => {
        const b = a.bed_id ? bMap.get(a.bed_id) : undefined;
        return {
          ...a,
          patient_name: pMap.get(a.patient_id) ?? a.patient_id.slice(0, 8),
          bed_code: b?.code,
          ward_name: b ? wMap.get(b.ward_id) : undefined,
        };
      });
    },
  });
}

export function AdmissionPicker({
  value, onChange, label = "Inpatient",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const { data } = useActiveAdmissions();
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select an active inpatient" /></SelectTrigger>
        <SelectContent>
          {(data ?? []).map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.patient_name} — {a.ward_name ?? "?"} {a.bed_code ?? ""}
            </SelectItem>
          ))}
          {(data ?? []).length === 0 && <div className="p-2 text-xs text-muted-foreground">No active admissions</div>}
        </SelectContent>
      </Select>
    </div>
  );
}
