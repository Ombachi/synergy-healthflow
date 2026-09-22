import process from "node:process";

// WHO ICD-11 API access (server-only).
// Tokens are cached in-memory for the lifetime of the worker instance.

const TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token";
const LINEARIZATION = "https://id.who.int/icd/release/11/2025-01/mms";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.value;

  const clientId = process.env["ICD11_CLIENT_ID"];
  const clientSecret = process.env["ICD11_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("ICD-11 credentials are not configured");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "icdapi_access",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`ICD-11 authentication failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function icdFetch(url: string) {
  const token = await getToken();
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Language": "en",
      "API-Version": "v2",
    },
  });
  if (!res.ok) throw new Error(`ICD-11 request failed (${res.status})`);
  return res.json() as Promise<Record<string, unknown>>;
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").trim();

export interface Icd11Result {
  code: string;
  title: string;
  chapter: string | null;
  uri: string | null;
}

export async function searchIcd11(query: string, limit = 15): Promise<Icd11Result[]> {
  const url =
    `${LINEARIZATION}/search?q=${encodeURIComponent(query)}` +
    `&useFlexisearch=true&flatResults=true&highlightingEnabled=false`;
  const json = await icdFetch(url);
  const entities = (json["destinationEntities"] as Array<Record<string, unknown>> | undefined) ?? [];

  return entities
    .map((e) => ({
      code: stripTags(String(e["theCode"] ?? "")),
      title: stripTags(String(e["title"] ?? "")),
      chapter: e["chapter"] ? stripTags(String(e["chapter"])) : null,
      uri: e["id"] ? String(e["id"]) : null,
    }))
    .filter((r) => r.title.length > 0)
    .slice(0, limit);
}

export async function lookupIcd11Code(code: string): Promise<Icd11Result | null> {
  const url = `${LINEARIZATION}/codeinfo/${encodeURIComponent(code)}`;
  try {
    const info = await icdFetch(url);
    const stemId = info["stemId"] ? String(info["stemId"]) : null;
    if (!stemId) return null;
    const entity = await icdFetch(stemId);
    const title = entity["title"] as { "@value"?: string } | undefined;
    return {
      code,
      title: stripTags(String(title?.["@value"] ?? code)),
      chapter: null,
      uri: stemId,
    };
  } catch {
    return null;
  }
}
