import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldAlert, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/breaches")({
  component: BreachRegister,
});

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-blue-500/10 text-blue-700",
  medium: "bg-yellow-500/10 text-yellow-700",
  high: "bg-orange-500/10 text-orange-700",
  critical: "bg-red-500/10 text-red-700",
};

function hoursSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

function BreachRegister() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  if (!hasRole("admin")) return <p className="text-muted-foreground">Admin only.</p>;

  const incidents = useQuery({
    queryKey: ["breach-incidents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breach_incidents" as never)
        .select("*")
        .order("discovered_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as any[]) ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["breach-events", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breach_incident_events" as never)
        .select("*").eq("incident_id", selected).order("created_at");
      if (error) throw error;
      return (data as unknown as any[]) ?? [];
    },
  });

  async function updateIncident(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("breach_incidents" as never).update(patch as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["breach-incidents"] });
    qc.invalidateQueries({ queryKey: ["breach-events", id] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldAlert className="h-5 w-5 text-primary" /> Breach notification register
          </h1>
          <p className="text-sm text-muted-foreground">
            HIPAA & Kenya DPA: notify the Data Protection Commissioner within 72 hours of discovery for high-risk breaches.
          </p>
        </div>
        <NewIncidentDialog onSaved={() => qc.invalidateQueries({ queryKey: ["breach-incidents"] })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Incident</th>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Clock</th>
              </tr>
            </thead>
            <tbody>
              {incidents.data?.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No incidents logged.</td></tr>
              )}
              {incidents.data?.map((i) => {
                const hrs = hoursSince(i.discovered_at);
                const overdue = hrs > 72 && i.status !== "closed";
                return (
                  <tr key={i.id} className={`cursor-pointer border-t ${selected === i.id ? "bg-muted/40" : ""}`} onClick={() => setSelected(i.id)}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{i.title}</div>
                      <div className="text-xs text-muted-foreground">{new Date(i.discovered_at).toLocaleString()}</div>
                    </td>
                    <td className="px-3 py-2"><Badge className={SEVERITY_COLOR[i.severity]}>{i.severity}</Badge></td>
                    <td className="px-3 py-2 text-xs capitalize">{i.status.replace("_"," ")}</td>
                    <td className={`px-3 py-2 text-xs ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      <Clock className="inline h-3 w-3" /> {hrs}h
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected && incidents.data && (
          <IncidentDetail
            incident={incidents.data.find((x) => x.id === selected)}
            events={events.data ?? []}
            onUpdate={(patch) => updateIncident(selected, patch)}
          />
        )}
      </div>
    </div>
  );
}

function IncidentDetail({ incident, events, onUpdate }: { incident: any; events: any[]; onUpdate: (p: Record<string, unknown>) => void }) {
  const [status, setStatus] = useState(incident.status);
  const [affected, setAffected] = useState<number>(incident.affected_patient_count ?? 0);
  const [notifiedAt, setNotifiedAt] = useState<string>(incident.notified_at?.slice(0, 16) ?? "");
  const [channel, setChannel] = useState(incident.notification_channel ?? "");
  const [dpa, setDpa] = useState(incident.dpa_reference ?? "");
  const [root, setRoot] = useState(incident.root_cause ?? "");
  const [rem, setRem] = useState(incident.remediation ?? "");

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <div className="text-lg font-semibold">{incident.title}</div>
        <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{incident.description}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="assessing">Assessing</SelectItem>
              <SelectItem value="notifying">Notifying</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Affected patients</Label>
          <Input type="number" value={affected} onChange={(e) => setAffected(parseInt(e.target.value || "0"))} />
        </div>
        <div>
          <Label>Notified at</Label>
          <Input type="datetime-local" value={notifiedAt} onChange={(e) => setNotifiedAt(e.target.value)} />
        </div>
        <div>
          <Label>Channel</Label>
          <Input placeholder="email / letter / DPA portal" value={channel} onChange={(e) => setChannel(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>DPA reference</Label>
          <Input value={dpa} onChange={(e) => setDpa(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Root cause</Label>
          <Textarea rows={2} value={root} onChange={(e) => setRoot(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Remediation</Label>
          <Textarea rows={2} value={rem} onChange={(e) => setRem(e.target.value)} />
        </div>
      </div>
      <Button
        onClick={() => onUpdate({
          status,
          affected_patient_count: affected,
          notified_at: notifiedAt ? new Date(notifiedAt).toISOString() : null,
          notification_channel: channel || null,
          dpa_reference: dpa || null,
          root_cause: root || null,
          remediation: rem || null,
        })}
      >Save changes</Button>

      <div>
        <div className="text-sm font-medium mt-4 mb-2">Event log</div>
        <div className="space-y-1 text-xs">
          {events.map((e) => (
            <div key={e.id} className="border-l-2 border-primary/40 pl-2">
              <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
              {" — "}
              <span className="font-medium">{e.event_type}</span>
              {e.from_status && ` (${e.from_status} → ${e.to_status})`}
              {e.note && <div className="text-muted-foreground">{e.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewIncidentDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [affected, setAffected] = useState(0);

  async function save() {
    if (!title || !desc) return toast.error("Title and description required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("breach_incidents" as never).insert({
      title, description: desc, severity, affected_patient_count: affected, reported_by: u.user?.id,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Incident logged");
    setOpen(false);
    setTitle(""); setDesc(""); setSeverity("medium"); setAffected(0);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /> Log incident</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log breach incident</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div>
            <Label>Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Affected patients (estimate)</Label><Input type="number" value={affected} onChange={(e) => setAffected(parseInt(e.target.value || "0"))} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Log</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
