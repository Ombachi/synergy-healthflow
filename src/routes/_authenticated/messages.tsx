import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Paperclip, Plus, Send, FileText, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/messages")({ component: Messages });

interface Thread { id: string; subject: string; updated_at: string; created_by: string }
interface Message { id: string; thread_id: string; sender_id: string; body: string; created_at: string }
interface Directory { id: string; full_name: string | null; role: string }
interface Attachment { id: string; message_id: string; file_path: string; file_name: string; mime_type: string | null; size_bytes: number | null }

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/.*)$/;

function Messages() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [active, setActive] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const threads = useQuery({ queryKey: ["threads"], queryFn: async () => {
    const { data, error } = await supabase.from("message_threads" as never).select("id, subject, updated_at, created_by").order("updated_at", { ascending: false });
    if (error) throw error; return (data as unknown as Thread[]) ?? [];
  }});

  const messages = useQuery({ queryKey: ["messages", active], enabled: !!active, queryFn: async () => {
    const { data, error } = await supabase.from("messages" as never).select("id, thread_id, sender_id, body, created_at").eq("thread_id", active!).order("created_at");
    if (error) throw error; return (data as unknown as Message[]) ?? [];
  }});

  const msgIds = messages.data?.map((m) => m.id) ?? [];
  const attachments = useQuery({ queryKey: ["att", active, msgIds.join(",")], enabled: msgIds.length > 0, queryFn: async () => {
    const { data, error } = await supabase.from("message_attachments" as never).select("*").in("message_id", msgIds as never);
    if (error) throw error; return (data as unknown as Attachment[]) ?? [];
  }});

  const directory = useQuery({ queryKey: ["directory"], queryFn: async () => {
    const { data, error } = await supabase.rpc("list_messageable_users" as never);
    if (error) throw error; return (data as unknown as Directory[]) ?? [];
  }});

  useEffect(() => {
    if (!active) return;
    const ch = supabase.channel(`msg-${active}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${active}` }, () => {
        qc.invalidateQueries({ queryKey: ["messages", active] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [active, qc]);

  const send = useMutation({
    mutationFn: async () => {
      if (!active || (!body.trim() && !pending)) return;
      const { data: m, error } = await supabase.from("messages" as never).insert({
        thread_id: active, sender_id: user!.id, body: body.trim() || (pending ? `📎 ${pending.name}` : ""),
      } as never).select("id").single();
      if (error) throw error;
      const msgId = (m as { id: string }).id;

      if (pending) {
        if (pending.size > MAX_SIZE) throw new Error("Max 10MB");
        if (!ALLOWED.test(pending.type)) throw new Error("File type not allowed");
        const path = `${user!.id}/${msgId}/${pending.name}`;
        const { error: upErr } = await supabase.storage.from("message-attachments").upload(path, pending);
        if (upErr) throw upErr;
        const { error: aErr } = await supabase.from("message_attachments" as never).insert({
          message_id: msgId, file_path: path, file_name: pending.name,
          mime_type: pending.type, size_bytes: pending.size, uploaded_by: user!.id,
        } as never);
        if (aErr) throw aErr;
      }
    },
    onSuccess: () => { setBody(""); setPending(null); if (fileRef.current) fileRef.current.value = ""; qc.invalidateQueries({ queryKey: ["messages", active] }); qc.invalidateQueries({ queryKey: ["att", active] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createThread = useMutation({
    mutationFn: async () => {
      if (!subject.trim() || pickedIds.length === 0) throw new Error("Subject + recipient required");
      const { data: t, error } = await supabase.from("message_threads" as never).insert({ subject: subject.trim(), created_by: user!.id } as never).select("id").single();
      if (error) throw error;
      const threadId = (t as { id: string }).id;
      const rows = [{ thread_id: threadId, user_id: user!.id }, ...pickedIds.map((id) => ({ thread_id: threadId, user_id: id }))];
      const { error: pErr } = await supabase.from("thread_participants" as never).insert(rows as never);
      if (pErr) throw pErr;
      return threadId;
    },
    onSuccess: (id) => { setOpen(false); setSubject(""); setPickedIds([]); setActive(id); qc.invalidateQueries({ queryKey: ["threads"] }); toast.success("Conversation started"); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function downloadAttachment(a: Attachment) {
    const { data, error } = await supabase.storage.from("message-attachments").createSignedUrl(a.file_path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      <div className="w-72 shrink-0 rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-medium">Conversations</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" variant="ghost"><Plus className="h-4 w-4" /></Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New conversation</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
                <div>
                  <Label>Recipients</Label>
                  <div className="mt-1 max-h-56 space-y-1 overflow-auto rounded border p-2">
                    {directory.data?.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                        <input type="checkbox" checked={pickedIds.includes(d.id)}
                          onChange={(e) => setPickedIds((p) => e.target.checked ? [...p, d.id] : p.filter((x) => x !== d.id))} />
                        <span>{d.full_name ?? d.id.slice(0,8)}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{d.role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={() => createThread.mutate()} disabled={createThread.isPending}>Start</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="divide-y">
          {threads.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No conversations.</div>}
          {threads.data?.map((t) => (
            <button key={t.id} onClick={() => setActive(t.id)}
              className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent ${active === t.id ? "bg-accent" : ""}`}>
              <span className="font-medium">{t.subject}</span>
              <span className="text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleString("en-GB")}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-lg border bg-card">
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-2 h-8 w-8" /> Select a conversation
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-auto p-4">
              {messages.data?.map((m) => {
                const atts = attachments.data?.filter((a) => a.message_id === m.id) ?? [];
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${mine ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.body && <div>{m.body}</div>}
                    {atts.map((a) => (
                      <button key={a.id} onClick={() => downloadAttachment(a)}
                        className={`mt-2 flex items-center gap-2 rounded border px-2 py-1 text-xs ${mine ? "border-primary-foreground/30 hover:bg-primary-foreground/10" : "border-border hover:bg-background"}`}>
                        {a.mime_type?.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                        <span className="truncate max-w-[200px]">{a.file_name}</span>
                        <span className="opacity-70">{a.size_bytes ? `${Math.round(a.size_bytes/1024)}KB` : ""}</span>
                      </button>
                    ))}
                    <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleTimeString("en-GB")}</div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2 border-t p-3">
              {pending && (
                <div className="flex items-center justify-between rounded border bg-muted/50 px-2 py-1 text-xs">
                  <span>📎 {pending.name} ({Math.round(pending.size/1024)}KB)</span>
                  <button className="text-destructive" onClick={() => { setPending(null); if (fileRef.current) fileRef.current.value=""; }}>×</button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,image/*,text/*"
                  onChange={(e) => setPending(e.target.files?.[0] ?? null)} />
                <Button size="icon" variant="outline" onClick={() => fileRef.current?.click()} title="Attach file"><Paperclip className="h-4 w-4" /></Button>
                <Textarea rows={2} placeholder="Type a message..." value={body} onChange={(e) => setBody(e.target.value)} />
                <Button onClick={() => send.mutate()} disabled={send.isPending || (!body.trim() && !pending)}><Send className="h-4 w-4" /></Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
