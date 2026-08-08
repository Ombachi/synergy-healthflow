import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import {
  listPortalInvitations, listInvitationEvents, issuePortalInvitation, issueAllPortalInvitations,
} from "@/lib/portal-invitations.functions";
import { Copy, MailCheck, RefreshCw, Send, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/portal-invitations")({
  component: PortalInvitationsPage,
});

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  active_account: { label: "Portal active", variant: "default" },
  activated: { label: "Activated", variant: "default" },
  pending: { label: "Invite pending", variant: "secondary" },
  expired: { label: "Expired", variant: "destructive" },
  none: { label: "No invite", variant: "outline" },
};

function PortalInvitationsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);

  const listFn = useServerFn(listPortalInvitations);
  const eventsFn = useServerFn(listInvitationEvents);
  const issueFn = useServerFn(issuePortalInvitation);
  const bulkFn = useServerFn(issueAllPortalInvitations);

  const rowsQ = useQuery({ queryKey: ["portal-invites"], queryFn: () => listFn() as Promise<any[]> });
  const eventsQ = useQuery({ queryKey: ["portal-invite-events"], enabled: isAdmin, queryFn: () => eventsFn() as Promise<any[]> });

  const issueM = useMutation({
    mutationFn: (patientId: string) => issueFn({ data: { patientId } }) as Promise<any>,
    onSuccess: (res) => {
      if (res.status === "already_active") toast.info("This patient already has an active portal account.");
      else if (res.status === "no_contact") toast.error("No email or phone on file for this patient.");
      else if (res.delivered) toast.success("Activation email sent.");
      else {
        setLastLink(res.link);
        toast.warning("Invitation created, but delivery is unavailable — copy the secure link below and share it directly.");
      }
      qc.invalidateQueries({ queryKey: ["portal-invites"] });
      qc.invalidateQueries({ queryKey: ["portal-invite-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkM = useMutation({
    mutationFn: () => bulkFn() as Promise<any>,
    onSuccess: (res) => {
      toast.success(`${res.issued} invitations created · ${res.sent} emailed · ${res.skipped} skipped (no contact).`, { duration: 8000 });
      qc.invalidateQueries({ queryKey: ["portal-invites"] });
      qc.invalidateQueries({ queryKey: ["portal-invite-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const list = rowsQ.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((r) =>
      [r.full_name, r.email, r.phone, r.mrn].some((v) => String(v ?? "").toLowerCase().includes(s)));
  }, [rowsQ.data, q]);

  if (!isAdmin) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">Patient portal invitations</h1>
        <p className="mt-2 text-sm text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Patient portal invitations</h1>
          <p className="text-sm text-muted-foreground">
            Issue and resend secure, single-use activation links. Resending always invalidates the previous link.
          </p>
        </div>
        <Button onClick={() => bulkM.mutate()} disabled={bulkM.isPending}>
          <Send className="h-4 w-4" /> {bulkM.isPending ? "Sending…" : "Invite all registered patients"}
        </Button>
      </div>

      {lastLink && (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-medium">Secure activation link (share directly)</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={lastLink} className="font-mono text-xs" />
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(lastLink); toast.success("Copied"); }}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="patients">
        <TabsList>
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="audit">Security audit</TabsTrigger>
        </TabsList>

        <TabsContent value="patients" className="space-y-4">
          <Input placeholder="Search by name, MRN, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Link expires</th>
                  <th className="px-4 py-3">Last sent</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rowsQ.isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
                {rows.map((r) => {
                  const st = STATUS_LABEL[r.status] ?? STATUS_LABEL["none"]!;
                  return (
                    <tr key={r.patient_id} className="border-t">
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.mrn}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>{r.email ?? "—"}</div><div>{r.phone ?? ""}</div>
                      </td>
                      <td className="px-4 py-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(r.expires_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(r.last_sent_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm" variant="outline"
                          disabled={r.has_account || issueM.isPending}
                          onClick={() => issueM.mutate(r.patient_id)}
                        >
                          {r.status === "none" ? <MailCheck className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          {r.status === "none" ? "Send invite" : "Resend link"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" /> Invitation & activation audit trail
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {eventsQ.isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
                {(eventsQ.data ?? []).map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-4 py-2 text-xs text-muted-foreground">{fmt(e.created_at)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={e.event.includes("failed") ? "destructive" : e.event === "activation_succeeded" ? "default" : "secondary"}>
                        {e.event.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{e.patient_name ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{e.reason ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{e.channel ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{e.ip_address ?? "—"}</td>
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
