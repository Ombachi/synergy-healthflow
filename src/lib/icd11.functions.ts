import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withCatalogFallback } from "./icd11-fallback";

export const searchIcd11Codes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ query: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(50).optional() }))
  .handler(async ({ data, context }) => {
    const { searchIcd11 } = await import("./icd11.server");
    try {
      const result = await withCatalogFallback(() => searchIcd11(data.query, data.limit ?? 15), async () => {
        const term = data.query.replace(/[%_\\,()]/g, " ").trim();
        if (!term) return [];
        const { data: rows, error } = await context.supabase.from("icd11_codes")
          .select("code,title,chapter").or(`code.ilike.%${term}%,title.ilike.%${term}%`).order("code").limit(data.limit ?? 15);
        if (error) throw error;
        return (rows ?? []).map((r) => ({ ...r, uri: null }));
      }, (rows) => rows.length > 0);
      return { results: result.value, source: result.source, error: null as string | null };
    } catch {
      return { results: [], source: "catalog" as const, error: "Diagnosis search is temporarily unavailable. Please try again." };
    }
  });

export const getIcd11Code = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string().min(1).max(20) }))
  .handler(async ({ data, context }) => {
    const { lookupIcd11Code } = await import("./icd11.server");
    try {
      const result = await withCatalogFallback(() => lookupIcd11Code(data.code), async () => {
        const { data: row, error } = await context.supabase.from("icd11_codes").select("code,title,chapter").eq("code", data.code).maybeSingle();
        if (error) throw error;
        return row ? { ...row, uri: null } : null;
      }, (row) => row !== null);
      return { result: result.value, source: result.source, error: null as string | null };
    } catch {
      return { result: null, source: "catalog" as const, error: "Diagnosis lookup is temporarily unavailable. Please try again." };
    }
  });
