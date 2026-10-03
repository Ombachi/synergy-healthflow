import { STORES, idbGet, idbPut } from "./idb";

// AES-GCM-256 encryption at rest. The key is a non-extractable CryptoKey
// generated per signed-in user and stored as an opaque handle in IndexedDB:
// the raw key bytes can never be read back out by script.
const keyCache = new Map<string, CryptoKey>();

export async function getUserKey(userId: string): Promise<CryptoKey> {
  const hit = keyCache.get(userId);
  if (hit) return hit;
  const row = await idbGet<{ userId: string; key: CryptoKey }>(STORES.keys, userId);
  let key = row?.key;
  if (!key) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await idbPut(STORES.keys, { userId, key });
  }
  keyCache.set(userId, key);
  return key;
}

export interface Sealed { iv: Uint8Array; data: ArrayBuffer }

export async function seal(userId: string, value: unknown): Promise<Sealed> {
  const key = await getUserKey(userId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { iv, data };
}

export async function unseal<T>(userId: string, s: Sealed): Promise<T> {
  const key = await getUserKey(userId);
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: s.iv as BufferSource }, key, s.data);
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
