import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNotifications } from "@/hooks/use-notifications";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/announcements")({ component: AnnouncementsPage });

interface Ann { id: string; title: string; body: string; pinned: boolean; published_at: string; expires_at: string | null }
interface Pref { user_id: string; email_enabled: boolean; sms_enabled: boolean; email_address: string | null; phone_number: string | null }

function AnnouncementsPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const canPost = hasRole("admin") || hasRole("hr_officer") || hasRole("hr_manager");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", pinned: false });
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  const anns = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("announcements" as never).select("*")
        .order("pinned", { ascending: false }).order("published_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data as unknown as Ann[]) ?? [];
    },
  });

  const prefs = useQuery({
    queryKey: ["np", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("notification_preferences" as never).select("*").eq("user_id", user!.id).maybeSingle();
      return (data as unknown as Pref) ?? null;
    },
  });

  const [p, setP] = useState<Pref>({ user_id: "", email_enabled: true, sms_enabled: false, email_address: "", phone_number: "" });
  useEffect(() => {
    if (prefs.data) setP(prefs.data);
    else if (user) setP((x) => ({ ...x, user_id: user.id, email_address: user.email ?? "" }));
  }, [prefs.data, user]);

  async function publish() {
    if (!form.title || !form.body) return toast.error("Title and body required");
    const { error } = await supabase.from("announcements" as never).insert({
      title: form.title, body: form.body, pinned: form.pinned,
      audience: "all", created_by: user?.id,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Published"); setOpen(false); setForm({ title: "", body: "", pinned: false });
    qc.invalidateQueries({ queryKey: ["announcements"] });
  }

  async function savePrefs() {
    const { error } = await supabase.from("notification_preferences" as never).upsert({
      user_id: user!.id, email_enabled: p.email_enabled, sms_enabled: p.sms_enabled,
      email_address: p.email_address || null, phone_number: p.phone_number || null,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Preferences saved");
    qc.invalidateQueries({ queryKey: ["np", user?.id] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notifications & Announcements</h1>
          <p className="text-sm text-muted-foreground">Hospital-wide updates and your alert preferences.</p>
        </div>
        {canPost && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>New announcement</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Broadcast announcement</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Body</Label><Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
                <div className="flex items-center gap-2"><Switch checked={form.pinned} onCheckedChange={(v) => setForm({ ...form, pinned: v })} /><Label>Pin to top</Label></div>
                <Button className="w-full" onClick={publish}>Publish</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="announcements">
        <TabsList>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="inbox">Inbox {unreadCount > 0 && <span className="ml-1 rounded bg-primary px-1.5 text-[10px] text-primary-foreground">{unreadCount}</span>}</TabsTrigger>
          <TabsTrigger value="prefs">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-2">
          {(anns.data ?? []).map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between">
                  <CardTitle className="text-base">{a.pinned && "📌 "}{a.title}</CardTitle>
                  <span className="text-xs text-muted-foreground">{new Date(a.published_at).toLocaleString("en-GB")}</span>
                </div>
              </CardHeader>
              <CardContent><p className="whitespace-pre-wrap text-sm">{a.body}</p></CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="inbox" className="space-y-2">
          <div className="flex justify-end">{unreadCount > 0 && <Button size="sm" variant="ghost" onClick={() => markAllRead()}>Mark all read</Button>}</div>
          {notifications.length === 0 ? <p className="text-sm text-muted-foreground">No notifications.</p> :
            notifications.map((n) => (
              <div key={n.id} onClick={() => !n.read_at && markRead(n.id)}
                className={`cursor-pointer rounded border p-3 text-sm ${!n.read_at ? "bg-primary/5" : ""}`}>
                <div className="flex justify-between"><span className="font-medium">{n.title}</span><span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("en-GB")}</span></div>
                {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
              </div>
            ))}
        </TabsContent>

        <TabsContent value="prefs">
          <Card>
            <CardHeader><CardTitle>Delivery preferences</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded border p-3">
                <div><div className="font-medium">Email alerts</div><div className="text-xs text-muted-foreground">Receive critical notifications by email.</div></div>
                <Switch checked={p.email_enabled} onCheckedChange={(v) => setP({ ...p, email_enabled: v })} />
              </div>
              <div><Label>Email address</Label><Input value={p.email_address ?? ""} onChange={(e) => setP({ ...p, email_address: e.target.value })} /></div>
              <div className="flex items-center justify-between rounded border p-3">
                <div><div className="font-medium">SMS alerts</div><div className="text-xs text-muted-foreground">Text messages for urgent updates.</div></div>
                <Switch checked={p.sms_enabled} onCheckedChange={(v) => setP({ ...p, sms_enabled: v })} />
              </div>
              <div><Label>Phone number</Label><Input value={p.phone_number ?? ""} onChange={(e) => setP({ ...p, phone_number: e.target.value })} /></div>
              <Button onClick={savePrefs}>Save preferences</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
