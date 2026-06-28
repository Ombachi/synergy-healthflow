import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/requests")({ component: RequestsPage });

const CATEGORIES = ["equipment", "it_support", "hr", "procurement", "maintenance"] as const;
type Cat = (typeof CATEGORIES)[number];

interface IRequest {
  id: string; requester_id: string; category: Cat; title: string; description: string | null;
  priority: string; status: string; decision_notes: string | null; created_at: string;
}

function RequestsPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isApprover = hasRole("admin") || hasRole("hr_officer") || hasRole("hr_manager") || hasRole("procurement");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "equipment" as Cat, title: "", description: "", priority: "normal" });

  const q = useQuery({
    queryKey: ["internal-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("internal_requests" as never)
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as IRequest[]) ?? [];
    },
  });

  async function submit() {
    if (!form.title) return toast.error("Title required");
    const { error } = await supabase.from("internal_requests" as never).insert({
      requester_id: user?.id, category: form.category, title: form.title,
      description: form.description, priority: form.priority,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Request submitted");
    setOpen(false); setForm({ category: "equipment", title: "", description: "", priority: "normal" });
    qc.invalidateQueries({ queryKey: ["internal-requests"] });
  }

  async function decide(id: string, status: string) {
    const notes = window.prompt(`Notes for ${status} (optional)`) ?? "";
    const { error } = await supabase.from("internal_requests" as never).update({
      status, decision_notes: notes || null, decided_by: user?.id, decided_at: new Date().toISOString(),
    } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["internal-requests"] });
  }

  const mine = (q.data ?? []).filter((r) => r.requester_id === user?.id);
  const inbox = (q.data ?? []).filter((r) => r.requester_id !== user?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Internal requests</h1>
          <p className="text-sm text-muted-foreground">Equipment, IT, HR, procurement, maintenance.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>New request</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New internal request</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Category</Label>
                <select className="w-full rounded border bg-background p-2 text-sm" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Cat })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                </select>
              </div>
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div>
                <Label>Priority</Label>
                <select className="w-full rounded border bg-background p-2 text-sm" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option><option value="normal">Normal</option>
                  <option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </div>
              <Button className="w-full" onClick={submit}>Submit</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My requests ({mine.length})</TabsTrigger>
          {isApprover && <TabsTrigger value="inbox">Approver inbox ({inbox.length})</TabsTrigger>}
        </TabsList>
        <TabsContent value="mine" className="space-y-2">
          {mine.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> :
            mine.map((r) => <RequestCard key={r.id} r={r} />)}
        </TabsContent>
        {isApprover && (
          <TabsContent value="inbox" className="space-y-2">
            {inbox.length === 0 ? <p className="text-sm text-muted-foreground">Nothing pending.</p> :
              inbox.map((r) => (
                <RequestCard key={r.id} r={r}>
                  {["submitted", "in_review", "clarification"].includes(r.status) && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={() => decide(r.id, "approved")}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decide(r.id, "clarification")}>Need info</Button>
                      <Button size="sm" variant="destructive" onClick={() => decide(r.id, "rejected")}>Reject</Button>
                      <Button size="sm" variant="secondary" onClick={() => decide(r.id, "fulfilled")}>Fulfilled</Button>
                    </div>
                  )}
                </RequestCard>
              ))}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function RequestCard({ r, children }: { r: IRequest; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{r.title}</CardTitle>
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{r.status}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="text-xs text-muted-foreground">{r.category} • {r.priority} • {new Date(r.created_at).toLocaleString()}</div>
        {r.description && <p>{r.description}</p>}
        {r.decision_notes && <p className="text-xs italic text-muted-foreground">Notes: {r.decision_notes}</p>}
        {children}
      </CardContent>
    </Card>
  );
}
