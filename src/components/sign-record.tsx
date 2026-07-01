import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface Sig {
  id: string;
  signer_id: string;
  signer_name: string;
  signer_role: string | null;
  signature_hash: string;
  signed_at: string;
}

async function sha256(text: string) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function SignRecord({
  entityType,
  entityId,
  label = "Sign & lock",
  payload,
}: {
  entityType: "discharge_summary" | "prescription";
  entityId: string;
  label?: string;
  /** Text content hashed into the signature to bind signer to content. */
  payload?: string;
}) {
  const qc = useQueryClient();
  const { user, roles, profile } = useAuth();

  const sig = useQuery({
    queryKey: ["sig", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signatures" as never)
        .select("id, signer_id, signer_name, signer_role, signature_hash, signed_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Sig) ?? null;
    },
  });

  const sign = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in required");
      const hash = await sha256(`${entityType}:${entityId}:${user.id}:${payload ?? ""}:${Date.now()}`);
      const { error } = await supabase.from("signatures" as never).insert({
        entity_type: entityType,
        entity_id: entityId,
        signer_id: user.id,
        signer_name: profile?.full_name ?? user.email ?? "Unknown",
        signer_role: roles[0] ?? null,
        signature_hash: hash,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sig", entityType, entityId] });
      toast.success("Signed and locked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (sig.isLoading) return null;

  if (sig.data) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
        <Lock className="h-3.5 w-3.5 text-primary" />
        <span>
          Signed by <b>{sig.data.signer_name}</b>
          {sig.data.signer_role && <> ({sig.data.signer_role})</>} on{" "}
          {new Date(sig.data.signed_at).toLocaleString()}
        </span>
        <code className="ml-2 rounded bg-background/60 px-1 py-0.5 text-[10px]">
          {sig.data.signature_hash.slice(0, 12)}…
        </code>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={() => sign.mutate()} disabled={sign.isPending}>
      <PenLine className="mr-1 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
