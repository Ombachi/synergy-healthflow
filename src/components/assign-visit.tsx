import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  visitId: string;
  assignedDoctorId: string | null;
  assignedNurseId: string | null;
}

interface StaffOpt { id: string; full_name: string | null; role: string }

export function AssignVisit({ visitId, assignedDoctorId, assignedNurseId }: Props) {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canAssign = hasAnyRole(["admin", "doctor", "nurse"]);
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<string>(assignedDoctorId ?? "");
  const [nur, setNur] = useState<string>(assignedNurseId ?? "");

  const staff = useQuery({
    queryKey: ["assignable-staff"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_messageable_users" as never);
      if (error) throw error;
      return ((data as unknown as StaffOpt[]) ?? []).filter((s) => s.role === "doctor" || s.role === "nurse");
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const updates: Record<string, string | null> = {};
      if (doc !== (assignedDoctorId ?? "")) updates.assigned_doctor_id = doc || null;
      if (nur !== (assignedNurseId ?? "")) updates.assigned_nurse_id = nur || null;
      if (Object.keys(updates).length === 0) return;
      const { error } = await supabase.from("visits" as never).update(updates as never).eq("id", visitId);
      if (error) throw error;
      const history: Record<string, unknown>[] = [];
      if (updates.assigned_doctor_id && doc) {
        history.push({ visit_id: visitId, role: "doctor", user_id: doc, assigned_by: user!.id });
      }
      if (updates.assigned_nurse_id && nur) {
        history.push({ visit_id: visitId, role: "nurse", user_id: nur, assigned_by: user!.id });
      }
      if (history.length) {
        await supabase.from("visit_assignments" as never).insert(history as never);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visit", visitId] });
      qc.invalidateQueries({ queryKey: ["my-active-visits"] });
      setOpen(false);
      toast.success("Assignment updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canAssign) return null;

  const docs = (staff.data ?? []).filter((s) => s.role === "doctor");
  const nurses = (staff.data ?? []).filter((s) => s.role === "nurse");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><UserCog className="h-4 w-4" /> Assign</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign clinicians</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Doctor</Label>
            <Select value={doc || "__none__"} onValueChange={(v) => setDoc(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {docs.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name ?? s.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nurse</Label>
            <Select value={nur || "__none__"} onValueChange={(v) => setNur(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {nurses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name ?? s.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
