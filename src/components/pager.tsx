import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Client-side pagination for long lists/tables.
 * Returns the visible slice plus the controls state.
 */
export function usePager<T>(rows: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Snap back into range whenever the underlying list shrinks (filtering, search…)
  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(rows.length / pageSize))));
  }, [rows.length, pageSize]);

  const slice = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  return { slice, page, setPage, pageCount, total, pageSize };
}

export function Pager({
  page, pageCount, total, pageSize, setPage, label = "records",
}: {
  page: number; pageCount: number; total: number; pageSize: number;
  setPage: (p: number) => void; label?: string;
}) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
      <span>{from}–{to} of {total} {label}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <span className="px-1">Page {page} / {pageCount}</span>
        <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
