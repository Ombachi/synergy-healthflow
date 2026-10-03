import { supabase } from "@/integrations/supabase/client";
import { emitOutbox, listOutbox, openRecord, patchRecord, removeRecord, type Op } from "./outbox";

export type NetState = "online" | "offline" | "syncing";

let state: NetState = "online";
const subs = new Set<() => void>();
const setState = (s: NetState) => { if (s !== state) { state = s; subs.forEach((f) => f()); } };
export const getNetState = () => state;
export const onNetState = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const m = `${(e as { message?: string })?.message ?? e}`.toLowerCase();
  return m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")
    || m.includes("network request failed") || m.includes("timeout") || m.includes("502") || m.includes("503") || m.includes("504");
}

/** Run ops in order. Duplicate-key errors mean the row already landed (idempotent replay). */
export async function executeOps(ops: Op[]) {
  for (const op of ops) {
    const q = supabase.from(op.table as never);
    if (op.kind === "insert") {
      const { error } = await q.insert(op.values as never);
      if (error && error.code !== "23505") throw error;
    } else {
      let u = q.update(op.values as never);
      for (const [k, v] of Object.entries(op.match)) u = u.eq(k, v as never);
      const { error } = await u;
      if (error) throw error;
    }
  }
}

async function heartbeat(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const r = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

let running = false;
export async function syncNow() {
  if (running) return;
  running = true;
  try {
    if (!(await heartbeat())) { setState("offline"); return; }
    const items = (await listOutbox()).filter((r) => r.status !== "failed");
    if (items.length === 0) { setState("online"); return; }
    setState("syncing");
    // Strict chronological order: stop at the first network failure so later
    // items that depend on earlier ones (e.g. queue entry → visit) never run first.
    for (const rec of items) {
      await patchRecord(rec.id, { status: "syncing" });
      try {
        const payload = await openRecord(rec);
        await executeOps(payload.ops);
        await removeRecord(rec.id, "synced", rec.action);
      } catch (e) {
        if (isNetworkError(e)) {
          await patchRecord(rec.id, { status: "pending" });
          setState("offline");
          return;
        }
        // Server rejected it (conflict, permissions, validation) — needs a human.
        await patchRecord(rec.id, { status: "failed", retryCount: rec.retryCount + 1, lastError: (e as Error).message });
      }
    }
    setState("online");
  } finally {
    running = false;
    emitOutbox();
  }
}

export async function retryRecord(id: string) {
  await patchRecord(id, { status: "pending", lastError: undefined });
  await syncNow();
}

export async function discardRecord(id: string, action: string) {
  await removeRecord(id, "discarded", action, "Discarded by user");
}

let started = false;
/** Call once from a client effect. Uses online/offline events plus polling fallback. */
export function startSyncManager() {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  const kick = () => void syncNow();
  const off = () => setState("offline");
  window.addEventListener("online", kick);
  window.addEventListener("offline", off);
  const timer = window.setInterval(kick, 20000);
  kick();
  return () => {
    started = false;
    window.removeEventListener("online", kick);
    window.removeEventListener("offline", off);
    window.clearInterval(timer);
  };
}
