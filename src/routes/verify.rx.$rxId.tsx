import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verify/rx/$rxId")({
  component: VerifyRx,
});

interface VerifyRow {
  exists_flag: boolean;
  signed: boolean;
  signer_name: string | null;
  signer_role: string | null;
  signed_at: string | null;
  hash_prefix: string | null;
}

function VerifyRx() {
  const { rxId } = Route.useParams();

  const q = useQuery({
    queryKey: ["verify-rx", rxId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("verify_prescription" as never, { rx_id: rxId } as never);
      if (error) throw error;
      const arr = data as unknown as VerifyRow[] | null;
      return arr?.[0] ?? null;
    },
  });

  const loading = q.isLoading;
  const r = q.data;
  const valid = !!r?.exists_flag && !!r?.signed;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6">
      <div className="flex items-center gap-2 text-lg font-bold">
        <Heart className="h-6 w-6 text-primary" /> Vitalis / LituCare
      </div>
      <div className="w-full rounded-xl border bg-card p-6 text-center shadow-sm">
        {loading ? (
          <p className="text-muted-foreground">Verifying…</p>
        ) : valid ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <h1 className="mt-2 text-xl font-semibold">Prescription verified</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This prescription is authentic and signed by a Vitalis clinician.
            </p>
            <div className="mt-4 rounded border bg-muted/30 p-3 text-left text-sm">
              <div>
                Signed by <b>{r!.signer_name ?? "—"}</b>
                {r!.signer_role && <> ({r!.signer_role})</>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {r!.signed_at ? new Date(r!.signed_at).toLocaleString() : ""}
              </div>
              <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                Signature hash: {r!.hash_prefix ?? "—"}…
              </div>
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              No patient or medication information is disclosed on this public page.
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-2 text-xl font-semibold">Cannot verify</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {r?.exists_flag ? "This prescription exists but has not been signed." : "Prescription not found."}
            </p>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">Public verification endpoint</p>
    </div>
  );
}
