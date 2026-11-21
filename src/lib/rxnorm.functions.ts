import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RxConcept } from "./rxnorm-parse";

export const searchRxNorm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ query: z.string().trim().min(2).max(80) }))
  .handler(async ({ data, context }) => {
    const term = data.query.replace(/[%_\\,()]/g, " ").trim();
    const local = async (): Promise<RxConcept[]> => {
      const { data: rows } = await context.supabase.from("rxnorm_concepts")
        .select("rxcui,name,tty,synonym,strength,dose_form").ilike("name", `%${term}%`).order("name").limit(30);
      return (rows ?? []) as RxConcept[];
    };
    try {
      const { fetchRxNavDrugs } = await import("./rxnorm.server");
      const results = (await fetchRxNavDrugs(term)).slice(0, 60);
      if (results.length) {
        const now = new Date().toISOString();
        const { error } = await context.supabase.from("rxnorm_concepts")
          .upsert(results.map((r) => ({ ...r, prescribable: true, updated_at: now })), { onConflict: "rxcui" });
        if (error) console.error("rxnorm cache", error.message);
        return { results, source: "rxnav" as const, error: null as string | null };
      }
      return { results: await local(), source: "cache" as const, error: null as string | null };
    } catch (e) {
      console.error("rxnav", e);
      try { return { results: await local(), source: "cache" as const, error: null as string | null }; }
      catch { return { results: [] as RxConcept[], source: "cache" as const, error: "Drug search is temporarily unavailable." }; }
    }
  });
