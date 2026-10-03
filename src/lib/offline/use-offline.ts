import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { enqueue, listOutbox, onOutboxChange, type Op, type OutboxRecord } from "./outbox";
import { executeOps, getNetState, isNetworkError, onNetState, syncNow, type NetState } from "./sync-manager";

export function useNetState(): NetState {
  return useSyncExternalStore((f) => { const u = onNetState(f); return () => { u(); }; }, getNetState, () => "online");
}

export function useOutbox(): OutboxRecord[] {
  const [items, setItems] = useState<OutboxRecord[]>([]);
  useEffect(() => {
    const load = () => void listOutbox().then(setItems);
    load();
    const u = onOutboxChange(load);
    return () => { u(); };
  }, []);
  return items;
}

export interface OfflineResult { queued: boolean }

/**
 * Online: writes straight to the database. Offline or on a network failure:
 * encrypts and stores the writes in the on-device outbox for later sync.
 * Build ops with client-generated ids so a replay can never duplicate rows.
 */
export function useOfflineMutation<V>(
  label: string,
  buildOps: (vars: V) => Op[] | Promise<Op[]>,
  opts: Omit<UseMutationOptions<OfflineResult, Error, V>, "mutationFn"> = {},
) {
  const { user } = useAuth();
  return useMutation<OfflineResult, Error, V>({
    ...opts,
    mutationFn: async (vars) => {
      const ops = await buildOps(vars);
      if (getNetState() !== "offline") {
        try {
          await executeOps(ops);
          return { queued: false };
        } catch (e) {
          if (!isNetworkError(e)) throw e;
        }
      }
      if (!user) throw new Error("Sign in required to save offline");
      await enqueue(user.id, label, { ops, label });
      toast.info("Saved on this device. It will sync when the connection is back.");
      void syncNow();
      return { queued: true };
    },
  });
}
