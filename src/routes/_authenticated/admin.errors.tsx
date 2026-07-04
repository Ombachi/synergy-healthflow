import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/errors")({ component: ErrorsPage });

type Row = {
  id: string;
  occurred_at: string;
  env: string;
  route: string | null;
  message: string;
  stack: string | null;
  user_id: string | null;
  context: Record<string, unknown> | null;
};

function ErrorsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["error-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("error_events")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold">Error monitor</h1>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => refetch()}>
          Refresh
        </Button>
      </header>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No errors recorded. 🎉
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">When</th>
                <th className="p-2 text-left">Env</th>
                <th className="p-2 text-left">Route</th>
                <th className="p-2 text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <>
                  <tr
                    key={r.id}
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="cursor-pointer border-t hover:bg-muted/50"
                  >
                    <td className="p-2 text-xs">{new Date(r.occurred_at).toLocaleString()}</td>
                    <td className="p-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.env}</span>
                    </td>
                    <td className="p-2 font-mono text-xs">{r.route ?? "—"}</td>
                    <td className="p-2">{r.message}</td>
                  </tr>
                  {expanded === r.id && (
                    <tr key={r.id + "-x"} className="border-t bg-muted/30">
                      <td colSpan={4} className="p-3">
                        {r.stack && (
                          <pre className="mb-2 overflow-x-auto rounded bg-background p-2 text-xs">
                            {r.stack}
                          </pre>
                        )}
                        {r.context && (
                          <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
                            {JSON.stringify(r.context, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
