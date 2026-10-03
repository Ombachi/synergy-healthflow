// Minimal native IndexedDB wrapper for the offline engine.
const DB_NAME = "litu-vault-offline";
const VERSION = 1;
export const STORES = { outbox: "mutation_outbox", cache: "offline_cache", keys: "keys", history: "sync_history" } as const;

let dbp: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.outbox)) db.createObjectStore(STORES.outbox, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORES.cache)) db.createObjectStore(STORES.cache, { keyPath: "key" });
        if (!db.objectStoreNames.contains(STORES.keys)) db.createObjectStore(STORES.keys, { keyPath: "userId" });
        if (!db.objectStoreNames.contains(STORES.history)) db.createObjectStore(STORES.history, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

export async function idbPut(store: string, value: unknown) {
  const db = await openDb();
  return wrap(db.transaction(store, "readwrite").objectStore(store).put(value));
}
export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store, "readonly").objectStore(store).get(key)) as Promise<T | undefined>;
}
export async function idbAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store, "readonly").objectStore(store).getAll()) as Promise<T[]>;
}
export async function idbDelete(store: string, key: IDBValidKey) {
  const db = await openDb();
  return wrap(db.transaction(store, "readwrite").objectStore(store).delete(key));
}
