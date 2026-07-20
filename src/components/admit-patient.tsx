import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { BedDouble } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface Ward {
  id: string;
  name: string;
  code: string | null;
  available_beds: number;
}

export function AdmitPatientButton({
  visitId,
  patientName,
  disabled,
}: {
  visitId: string;
  patientName: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [wardId, setWardId] = useState<string>("");
  const [reason, setReason] = useState("");

  const wards = useQuery({
    queryKey: ["wards-with-availability"],
    enabled: open,
    queryFn: async () => {
      const { data: wardRows, error } = await supabase
        .from("wards" as never)
        .select("id, name, code")
        .order("name");
      if (error) throw error;
      const { data: bedRows } = await supabase
        .from("beds" as never)
        .select("ward_id, status");
      const counts = new Map<string, number>();
      ((bedRows as { ward_id: string; status: string }[] | null) ?? []).forEach((b) => {
        if (b.status === "free" || b.status === "available") counts.set(b.ward_id, (counts.get(b.ward_id) ?? 0) + 1);
      });
      return ((wardRows as { id: string; name: string; code: string | null }[] | null) ?? []).map((w) => ({
        ...w,
        available_beds: counts.get(w.id) ?? 0,
      })) as Ward[];
    },
  });

  const admit = useMutation({
    mutationFn: async () => {
      if (!wardId) throw new Error("Pick a ward");
      const { data, error } = await supabase.rpc("admit_patient_inpatient" as never, {
        _source_visit: visitId,
        _ward_id: wardId,
        _reason: reason || null,
      } as never);
      if (error) throw error;
      return (data as unknown as { inpatient_visit_id: string; bed_code: string }[])?.[0];
    },
    onSuccess: (row) => {
      toast.success(`Inpatient encounter opened · bed ${row?.bed_code ?? "assigned"}`);
      setOpen(false);
      setWardId("");
      setReason("");
      qc.invalidateQueries();
      if (row?.inpatient_visit_id) {
        navigate({ to: "/visits/$visitId", params: { visitId: row.inpatient_visit_id } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <BedDouble className="h-4 w-4" /> Admit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Admit {patientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Ward</Label>
            <Select value={wardId} onValueChange={setWardId}>
              <SelectTrigger>
                <SelectValue placeholder={wards.isLoading ? "Loading wards…" : "Pick a ward"} />
              </SelectTrigger>
              <SelectContent>
                {wards.data?.map((w) => (
                  <SelectItem
                    key={w.id}
                    value={w.id}
                    disabled={w.available_beds === 0}
                  >
                    {w.name} {w.code ? `· ${w.code}` : ""} · {w.available_beds} bed{w.available_beds === 1 ? "" : "s"} free
                  </SelectItem>
                ))}
                {wards.data?.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No wards configured</div>
                )}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              A new inpatient encounter will be opened on this patient's MRN with the first available bed. Demographics, allergies, chronic conditions, history, diagnoses, medications, labs and imaging are carried forward automatically.
            </p>
          </div>
          <div>
            <Label>Admission reason (optional)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => admit.mutate()}
            disabled={!wardId || admit.isPending}
          >
            {admit.isPending ? "Admitting…" : "Admit patient"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
