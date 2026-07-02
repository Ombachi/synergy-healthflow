import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/access-reviews")({
  component: AccessReviewsPage,
});

function currentQuarter() {
  const d = new Date();
  return { q: Math.floor(d.getMonth() / 3) + 1, y: d.getFullYear() };
}

function AccessReviewsPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  if (!hasRole("admin")) return <p className="text-muted-foreground">Admin only.</p>;

  const reviews = useQuery({
    queryKey: ["access-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_reviews" as never)
        .select("*")
        .order("year", { ascending: false })
        .order("quarter", { ascending: false });
      if (error) throw error;
      return (data as unknown as any[]) ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["access-review-items", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_review_items" as never)
        .select("id, user_id, role, decision, reviewed_at, notes")
        .eq("review_id", selected);
      if (error) throw error;
      const rows = (data as unknown as any[]) ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profs } = await supabase
        .from("profiles" as never).select("id, full_name").in("id", ids);
      const nameOf = new Map((profs as unknown as any[] | null ?? []).map((p) => [p.id, p.full_name]));
      return rows.map((r) => ({ ...r, full_name: nameOf.get(r.user_id) ?? r.user_id.slice(0, 8) }));
    },
  });

  async function openReview() {
    const { q, y } = currentQuarter();
    const { data, error } = await supabase.rpc("open_access_review" as never, { _quarter: q, _year: y } as never);
    if (error) return toast.error(error.message);
    toast.success(`Opened Q${q} ${y}`);
    qc.invalidateQueries({ queryKey: ["access-reviews"] });
    setSelected(data as unknown as string);
  }

  async function setDecision(itemId: string, decision: string) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("access_review_items" as never).update({
      decision, reviewed_by: u.user?.id, reviewed_at: new Date().toISOString(),
    } as never).eq("id", itemId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["access-review-items", selected] });
  }

  async function complete() {
    if (!selected) return;
    const pending = items.data?.filter((i) => i.decision === "pending").length ?? 0;
    if (pending > 0 && !confirm(`${pending} rows still pending — treat them as "keep" and complete review?`)) return;
    const { error } = await supabase.rpc("complete_access_review" as never, { _review: selected } as never);
    if (error) return toast.error(error.message);
    toast.success("Review completed; revocations applied");
    qc.invalidateQueries();
  }

  const currentReview = reviews.data?.find((r) => r.id === selected);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ClipboardCheck className="h-5 w-5 text-primary" /> Quarterly access reviews
          </h1>
          <p className="text-sm text-muted-foreground">
            Certify every user role each quarter. Completing a review automatically removes any role marked "revoke".
          </p>
        </div>
        <Button size="sm" onClick={openReview}><Plus className="h-4 w-4" /> Open current quarter</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-3 py-2 text-sm font-medium">Reviews</div>
          <div className="divide-y">
            {reviews.data?.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">None yet.</div>
            )}
            {reviews.data?.map((r) => (
              <button key={r.id} onClick={() => setSelected(r.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 ${selected === r.id ? "bg-muted/50" : ""}`}>
                <span>{r.period_label}</span>
                <Badge variant={r.status === "completed" ? "outline" : "default"}>{r.status}</Badge>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          {!selected && <p className="text-sm text-muted-foreground">Select a review to certify.</p>}
          {selected && currentReview && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{currentReview.period_label}</div>
                  <div className="text-xs text-muted-foreground">Status: {currentReview.status}</div>
                </div>
                {currentReview.status !== "completed" && (
                  <Button size="sm" onClick={complete}>Complete review</Button>
                )}
              </div>
              <div className="overflow-hidden rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.data?.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="px-3 py-2">{i.full_name}</td>
                        <td className="px-3 py-2 text-xs">{i.role}</td>
                        <td className="px-3 py-2">
                          {currentReview.status === "completed" ? (
                            <Badge variant="outline">{i.decision}</Badge>
                          ) : (
                            <Select value={i.decision} onValueChange={(v) => setDecision(i.id, v)}>
                              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="keep">Keep</SelectItem>
                                <SelectItem value="revoke">Revoke</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
