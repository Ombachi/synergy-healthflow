import { useEffect, useState } from "react";
import { CloudOff, Cloud, RefreshCw, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useNetState, useOutbox } from "@/lib/offline/use-offline";
import { startSyncManager, syncNow, retryRecord, discardRecord } from "@/lib/offline/sync-manager";
import { listHistory, onOutboxChange, type HistoryRecord } from "@/lib/offline/outbox";

export function SyncCenter() {
  const net = useNetState();
  const items = useOutbox();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  useEffect(() => startSyncManager(), []);
  useEffect(() => {
    const load = () => void listHistory().then(setHistory);
    load();
    const u = onOutboxChange(load);
    return () => { u(); };
  }, []);

  const pending = items.length;
  const label = net === "syncing" ? "Syncing…" : net === "offline" ? `Working offline${pending ? ` (${pending} queued)` : ""}` : pending ? `${pending} to sync` : "Online";
  const Icon = net === "offline" ? CloudOff : net === "syncing" ? RefreshCw : Cloud;
  const tone = net === "offline" ? "text-destructive" : pending ? "text-primary" : "text-muted-foreground";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className={`gap-1.5 text-xs ${tone}`}>
          <Icon className={`h-4 w-4 ${net === "syncing" ? "animate-spin" : ""}`} /> {label}
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader><SheetTitle>Sync Center</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4 text-sm">
          <Button size="sm" onClick={() => void syncNow()} disabled={net === "syncing"}>
            <RefreshCw className="h-4 w-4" /> Sync now
          </Button>
          <div>
            <div className="mb-2 font-medium">Waiting to sync ({pending})</div>
            {pending === 0 && <p className="text-xs text-muted-foreground">Everything is saved to the server.</p>}
            <div className="space-y-2">
              {items.map((r) => (
                <div key={r.id} className="rounded border p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.action}</span>
                    <span className={`text-xs ${r.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("en-GB")}</div>
                  {r.lastError && <div className="mt-1 text-xs text-destructive">{r.lastError}</div>}
                  {r.status === "failed" && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void retryRecord(r.id)}><RotateCcw className="h-3 w-3" /> Retry</Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("Discard this saved change? It will be lost.")) void discardRecord(r.id, r.action); }}><Trash2 className="h-3 w-3" /> Discard</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 font-medium">Recent history</div>
            {history.length === 0 && <p className="text-xs text-muted-foreground">No synced items yet.</p>}
            {history.map((h) => (
              <div key={h.id} className="flex justify-between border-b py-1 text-xs">
                <span>{h.action}</span>
                <span className="text-muted-foreground">{h.result} · {new Date(h.at).toLocaleTimeString("en-GB")}</span>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
