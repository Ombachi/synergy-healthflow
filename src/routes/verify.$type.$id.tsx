import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Heart, ShieldQuestion } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verify/$type/$id")({
  component: VerifyDoc,
});

type DocType = "rx" | "lab" | "imaging" | "discharge" | "sick" | "invoice";

const DOC_LABEL: Record<DocType, string> = {
  rx: "Prescription",
  lab: "Laboratory report",
  imaging: "Imaging report",
  discharge: "Discharge summary",
  sick: "Sick-off note",
  invoice: "Invoice",
};

interface VerifyRow {
  exists_flag: boolean;
  signed: boolean;
  signer_name: string | null;
  signer_role: string | null;
  signed_at: string | null;
  hash_prefix: string | null;
}

function VerifyDoc() {
  const { type, id } = Route.useParams();
  const docType = type as DocType;
  const label = DOC_LABEL[docType];

  const q = useQuery({
    queryKey: ["verify", type, id],
    enabled: !!label,
    queryFn: async (): Promise<VerifyRow | null> => {
      if (docType === "rx") {
        const { data, error } = await supabase.rpc("verify_prescription" as never, { rx_id: id } as never);
        if (error) throw error;
        const arr = data as unknown as VerifyRow[] | null;
        return arr?.[0] ?? null;
      }
      // Fallback: check signature registry for any signed record of this doc.
      const { data, error } = await supabase
        .from("signatures" as never)
        .select("signer_name, signer_role, signed_at, hash_prefix")
        .eq("record_type", docType)
        .eq("record_id", id)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      const row = data as unknown as { signer_name: string | null; signer_role: string | null; signed_at: string | null; hash_prefix: string | null } | null;
      if (!row) return { exists_flag: false, signed: false, signer_name: null, signer_role: null, signed_at: null, hash_prefix: null };
      return { exists_flag: true, signed: true, ...row };
    },
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6">
      <div className="flex items-center gap-2 text-lg font-bold">
        <Heart className="h-6 w-6 text-primary" /> Litu Vault
      </div>
      <div className="w-full rounded-xl border bg-card p-6 text-center shadow-sm">
        {!label ? (
          <>
            <ShieldQuestion className="mx-auto h-12 w-12 text-muted-foreground" />
            <h1 className="mt-2 text-xl font-semibold">Unknown document type</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              "{type}" is not a recognized verification target.
            </p>
            <Link to="/" className="mt-4 inline-block text-xs text-primary underline">Return home</Link>
          </>
        ) : q.isLoading ? (
          <p className="text-muted-foreground">Verifying {label.toLowerCase()}…</p>
        ) : q.data?.signed ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <h1 className="mt-2 text-xl font-semibold">{label} verified</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This {label.toLowerCase()} is authentic and signed by a Litu Vault clinician.
            </p>
            <div className="mt-4 rounded border bg-muted/30 p-3 text-left text-sm">
              <div>
                Signed by <b>{q.data.signer_name ?? "—"}</b>
                {q.data.signer_role && <> ({q.data.signer_role})</>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {q.data.signed_at ? new Date(q.data.signed_at).toLocaleString("en-GB") : ""}
              </div>
              {q.data.hash_prefix && (
                <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                  Signature hash: {q.data.hash_prefix}…
                </div>
              )}
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              No patient or clinical information is disclosed on this public page.
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-2 text-xl font-semibold">Cannot verify</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {q.data?.exists_flag ? `This ${label.toLowerCase()} exists but has not been signed.` : `${label} not found.`}
            </p>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">Public verification endpoint</p>
    </div>
  );
}
