import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/documents")({
  component: () => (
    <RoleGate path="/hr/documents">
      <DocsPage />
    </RoleGate>
  ),
});

const CATEGORIES = ["SOP", "Policy", "HR manual", "Clinical guideline", "Lab manual", "Safety manual", "Training", "Form", "Template"];

type Doc = {
  id: string; title: string; category: string; version: string;
  description: string | null; storage_path: string;
  effective_date: string | null; expires_at: string | null;
  requires_ack: boolean; published: boolean; created_at: string;
};

function DocsPage() {
  const { user, hasAnyRole } = useAuth();
  const isHR = hasAnyRole(["admin", "hr_officer", "hr_manager"]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      let q = supabase.from("hr_documents" as never).select("*").order("created_at", { ascending: false }).limit(200);
      if (!isHR) q = q.eq("published", true);
      const { data } = await q;
      setDocs((data ?? []) as Doc[]);

      const { data: a } = await supabase.from("hr_document_acks" as never).select("document_id").eq("employee_id", user.id);
      const map: Record<string, boolean> = {};
      ((a ?? []) as Array<{ document_id: string }>).forEach((r) => { map[r.document_id] = true; });
      setAcks(map);
    })();
  }, [user, isHR, refresh]);

  async function download(d: Doc) {
    const { data, error } = await supabase.storage.from("hr-documents").createSignedUrl(d.storage_path, 60);
    if (error || !data) { toast.error(error?.message ?? "Download failed"); return; }
    window.open(data.signedUrl, "_blank");
    if (user) {
      await supabase.from("hr_document_views" as never).insert({ document_id: d.id, employee_id: user.id } as never);
    }
  }

  async function acknowledge(d: Doc) {
    if (!user) return;
    const { error } = await supabase.from("hr_document_acks" as never).insert({ document_id: d.id, employee_id: user.id } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Acknowledged");
    setAcks((m) => ({ ...m, [d.id]: true }));
  }

  const filtered = docs.filter((d) => {
    if (cat !== "all" && d.category !== cat) return false;
    if (query && !`${d.title} ${d.description ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">SOPs & Policies</h1>
          <p className="text-sm text-muted-foreground">Organisational knowledge repository. HR can publish new documents; staff can read, download, and acknowledge.</p>
        </div>
        {isHR && <UploadDialog onDone={() => setRefresh((x) => x + 1)} />}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[220px]">
          <Label className="text-xs">Search</Label>
          <Input placeholder="Title or description" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="space-y-1 w-56">
          <Label className="text-xs">Category</Label>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Documents ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? <p className="text-sm text-muted-foreground">No documents.</p> : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Title</th>
                  <th className="text-left p-2">Category</th>
                  <th className="text-left p-2">Version</th>
                  <th className="text-left p-2">Effective</th>
                  <th className="text-left p-2">Expires</th>
                  <th className="text-left p-2">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{d.title}</div>
                      {d.description && <div className="text-xs text-muted-foreground">{d.description}</div>}
                    </td>
                    <td className="p-2">{d.category}</td>
                    <td className="p-2">{d.version}</td>
                    <td className="p-2">{d.effective_date ?? "—"}</td>
                    <td className="p-2">{d.expires_at ?? "—"}</td>
                    <td className="p-2">
                      {!d.published && <Badge variant="outline" className="bg-muted">draft</Badge>}
                      {d.requires_ack && (acks[d.id]
                        ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700">acknowledged</Badge>
                        : <Badge variant="outline" className="bg-amber-500/15 text-amber-700">ack required</Badge>)}
                    </td>
                    <td className="p-2 text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => download(d)}>Open</Button>
                      {d.requires_ack && !acks[d.id] && <Button size="sm" onClick={() => acknowledge(d)}>Acknowledge</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadDialog({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [version, setVersion] = useState("1.0");
  const [description, setDescription] = useState("");
  const [effective, setEffective] = useState("");
  const [expires, setExpires] = useState("");
  const [requiresAck, setRequiresAck] = useState(false);
  const [publish, setPublish] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user || !file || !title) { toast.error("Pick a file and title"); return; }
    setBusy(true);
    const path = `${user.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("hr-documents").upload(path, file, { upsert: false });
    if (upErr) { setBusy(false); toast.error(upErr.message); return; }
    const { error } = await supabase.from("hr_documents" as never).insert({
      title, category, version, description: description || null,
      storage_path: path, file_name: file.name, mime_type: file.type,
      effective_date: effective || null, expires_at: expires || null,
      requires_ack: requiresAck, published: publish, uploaded_by: user.id,
    } as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Document published");
    setOpen(false); setTitle(""); setDescription(""); setFile(null); onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Upload document</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Upload SOP / Policy</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2 space-y-1"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Version</Label><Input value={version} onChange={(e) => setVersion(e.target.value)} /></div>
          <div className="space-y-1"><Label>Effective date</Label><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></div>
          <div className="space-y-1"><Label>Expires</Label><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
          <div className="md:col-span-2 space-y-1"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="md:col-span-2 space-y-1">
            <Label>File</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} /> Requires acknowledgement</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish immediately</label>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy}>{busy ? "Uploading…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
