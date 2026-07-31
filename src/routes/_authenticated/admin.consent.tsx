import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/consent")({
  component: ConsentAdmin,
});

function ConsentAdmin() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("templates");

  if (!hasRole("admin")) return <p className="text-muted-foreground">Admin only.</p>;

  const templates = useQuery({
    queryKey: ["consent-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consent_templates" as never)
        .select("id, code, title, body, version, active, created_at")
        .order("code")
        .order("version", { ascending: false });
      if (error) throw error;
      return (data as unknown as any[]) ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["consent-events-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consent_events" as never)
        .select("id, patient_id, template_code, template_version, action, actor_id, notes, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as any[]) ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FileText className="h-5 w-5 text-primary" /> Consent management
        </h1>
        <p className="text-sm text-muted-foreground">
          Version consent forms and see the full history of every grant / withdrawal per patient.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="events">Recent events</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-3">
          <div className="flex justify-end">
            <NewTemplateDialog onSaved={() => qc.invalidateQueries({ queryKey: ["consent-templates"] })} />
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Version</th>
                  <th className="px-4 py-2 font-medium">Active</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {templates.data?.map((t) => (
                  <tr key={t.id} className="border-t align-top">
                    <td className="px-4 py-2 text-xs">{t.code}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap">{t.body}</div>
                    </td>
                    <td className="px-4 py-2 text-xs">v{t.version}</td>
                    <td className="px-4 py-2 text-xs">{t.active ? "Active" : "Retired"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="events">
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Patient</th>
                  <th className="px-4 py-2 font-medium">Consent</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {events.data?.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No consent events yet.</td></tr>
                )}
                {events.data?.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("en-GB")}</td>
                    <td className="px-4 py-2 text-xs">{e.patient_id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-xs">{e.template_code} v{e.template_version}</td>
                    <td className="px-4 py-2 text-xs capitalize">{e.action}</td>
                    <td className="px-4 py-2 text-xs">{e.notes ?? "—"}</td>
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

function NewTemplateDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [version, setVersion] = useState(1);

  async function save() {
    if (!code || !title || !body) return toast.error("All fields required");
    const { error } = await supabase.from("consent_templates" as never).insert({
      code, title, body, version, active: true,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setOpen(false);
    setCode(""); setTitle(""); setBody(""); setVersion(1);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> New version</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New consent template / version</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Code (stable identifier)</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="general_treatment" /></div>
          <div><Label>Version</Label><Input type="number" min={1} value={version} onChange={(e) => setVersion(parseInt(e.target.value || "1"))} /></div>
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Body</Label><Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
