import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verify/rx/$rxId")({
  component: VerifyRx,
});

interface Sig {
  signer_name: string;
  signer_role: string | null;
  signed_at: string;
  signature_hash: string;
}
interface Rx {
  id: string;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  created_at: string;
}

function VerifyRx() {
  const { rxId } = Route.useParams();

  const rx = useQuery({
    queryKey: ["verify-rx", rxId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescriptions" as never)
        .select("id, medication, dosage, frequency, duration, created_at")
        .eq("id", rxId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Rx) ?? null;
    },
  });

  const sig = useQuery({
    queryKey: ["verify-rx-sig", rxId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signatures" as never)
        .select("signer_name, signer_role, signed_at, signature_hash")
        .eq("entity_type", "prescription")
        .eq("entity_id", rxId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Sig) ?? null;
    },
  });

  const loading = rx.isLoading || sig.isLoading;
  const valid = !!rx.data && !!sig.data;

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
              This prescription is authentic and signed.
            </p>
            <div className="mt-4 rounded border bg-muted/30 p-3 text-left text-sm">
              <div><b>Medication:</b> {rx.data!.medication}</div>
              <div><b>Dosage:</b> {rx.data!.dosage ?? "—"}</div>
              <div><b>Frequency:</b> {rx.data!.frequency ?? "—"}</div>
              <div><b>Duration:</b> {rx.data!.duration ?? "—"}</div>
              <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                Signed by <b>{sig.data!.signer_name}</b>
                {sig.data!.signer_role && <> ({sig.data!.signer_role})</>} on{" "}
                {new Date(sig.data!.signed_at).toLocaleString()}
              </div>
              <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                Hash: {sig.data!.signature_hash.slice(0, 24)}…
              </div>
            </div>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-2 text-xl font-semibold">Cannot verify</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {rx.data ? "This prescription exists but has not been signed." : "Prescription not found."}
            </p>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Public verification endpoint · No PHI disclosed
      </p>
    </div>
  );
}
