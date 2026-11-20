export interface Icd11Result {
  code: string;
  title: string;
  chapter: string | null;
  uri: string | null;
}

export async function withCatalogFallback<T>(primary: () => Promise<T>, local: () => Promise<T>, usable: (value: T) => boolean): Promise<{ value: T; source: "who" | "catalog" }> {
  try {
    const value = await primary();
    if (usable(value)) return { value, source: "who" };
  } catch { /* Missing credentials, network failures and deadlines use the catalog. */ }
  return { value: await local(), source: "catalog" };
}