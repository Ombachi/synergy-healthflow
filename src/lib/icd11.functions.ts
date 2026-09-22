import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const searchIcd11Codes = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string().min(2).max(120), limit: z.number().min(1).max(50).optional() }))
  .handler(async ({ data }) => {
    const { searchIcd11 } = await import("./icd11.server");
    try {
      const results = await searchIcd11(data.query, data.limit ?? 15);
      return { results, error: null as string | null };
    } catch (e) {
      return { results: [], error: e instanceof Error ? e.message : "ICD-11 lookup failed" };
    }
  });

export const getIcd11Code = createServerFn({ method: "POST" })
  .inputValidator(z.object({ code: z.string().min(1).max(20) }))
  .handler(async ({ data }) => {
    const { lookupIcd11Code } = await import("./icd11.server");
    try {
      return { result: await lookupIcd11Code(data.code), error: null as string | null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "ICD-11 lookup failed" };
    }
  });
