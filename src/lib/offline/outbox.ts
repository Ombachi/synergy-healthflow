import { STORES, idbAll, idbDelete, idbGet, idbPut } from "./idb";
import { seal, unseal, sha256Hex, type Sealed } from "./crypto";

/** One database write. Rows carry client-generated ids so replays are idempotent. */
export type Op =
  | { kind: "insert"; table: string; values: Record<string, unknown> }
  | { kind: "update"; table: string; values: Record<string, unknown>; match: Record<string, unknown> };

export interface OutboxPayload { ops: Op[]; label: string }

export type OutboxStatus = "pending" | "syncing" | "failed";

/** What is stored on disk: metadata in clear, the actual clinical data encrypted. */
export interface OutboxRecord {
  id: string;
  idempotencyKey: string;
  userId: string;
  action: string;      // human label, e.g. "Check-in"
  createdAt: number;
  retryCount: number;
  status: OutboxStatus;
  lastError?: string;
  signature: string;   // SHA-256 over idempotencyKey + plaintext payload
  sealed: Sealed;
}

export interface HistoryRecord { id: string; action: string; at: number; result: "synced" | "discarded"; detail?: string }

type Listener = () => void;
const listeners = new Set<Listener>();
export const onOutboxChange = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };
export const emitOutbox = () => listeners.forEach((l) => l());

export async function enqueue(userId: string, action: string, payload: OutboxPayload) {
  const id = crypto.randomUUID();
  const rec: OutboxRecord = {
    id, idempotencyKey: id, userId, action,
    createdAt: Date.now(), retryCount: 0, status: "pending",
    signature: await sha256Hex(id + JSON.stringify(payload)),
    sealed: await seal(userId, payload),
  };
  await idbPut(STORES.outbox, rec);
  emitOutbox();
  return rec;
}

export async function listOutbox(): Promise<OutboxRecord[]> {
  try { return (await idbAll<OutboxRecord>(STORES.outbox)).sort((a, b) => a.createdAt - b.createdAt); }
  catch { return []; }
}

export async function openRecord(rec: OutboxRecord): Promise<OutboxPayload> {
  const payload = await unseal<OutboxPayload>(rec.userId, rec.sealed);
  const sig = await sha256Hex(rec.idempotencyKey + JSON.stringify(payload));
  if (sig !== rec.signature) throw new Error("Integrity check failed — record was altered on this device");
  return payload;
}

export async function patchRecord(id: string, patch: Partial<OutboxRecord>) {
  const rec = await idbGet<OutboxRecord>(STORES.outbox, id);
  if (!rec) return;
  await idbPut(STORES.outbox, { ...rec, ...patch });
  emitOutbox();
}

export async function removeRecord(id: string, result: HistoryRecord["result"], action: string, detail?: string) {
  await idbDelete(STORES.outbox, id);
  await idbPut(STORES.history, { id, action, at: Date.now(), result, detail } satisfies HistoryRecord);
  emitOutbox();
}

export async function listHistory(): Promise<HistoryRecord[]> {
  try { return (await idbAll<HistoryRecord>(STORES.history)).sort((a, b) => b.at - a.at).slice(0, 50); }
  catch { return []; }
}
