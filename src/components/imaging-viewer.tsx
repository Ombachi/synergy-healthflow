import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ScanLine, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { exportImagingReportPDF } from "@/lib/imaging-report-pdf";

interface ImagingOrder {
  id: string; modality: string; body_part: string | null; clinical_question: string | null;
  status: string; findings: string | null; report: string | null; image_path: string | null; performed_by: string | null;
  created_at: string; performed_at: string | null; patient_id: string; visit_id: string | null;
}

export interface ImagingViewerProps {
  patientId: string;
  patientName: string;
  mrn: string | null;
}

/** Master-detail imaging viewer used in patient portal and doctor visit view. */
export function ImagingViewer({ patientId, patientName, mrn }: ImagingViewerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["iv-orders", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("imaging_orders" as never)
        .select("id, modality, body_part, clinical_question, status, findings, report, image_path, created_at, performed_at, patient_id, visit_id, performed_by")
        .eq("patient_id", patientId).order("created_at", { ascending: false });
      return (data as unknown as ImagingOrder[]) ?? [];
    },
  });

  const radiologistIds = Array.from(new Set((orders.data ?? []).map((o) => o.performed_by).filter(Boolean) as string[]));
  const radiologists = useQuery({
    queryKey: ["iv-radiologists", radiologistIds.join(",")], enabled: radiologistIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as never)
        .select("id, full_name").in("id", radiologistIds as never);
      return (data as unknown as { id: string; full_name: string | null }[]) ?? [];
    },
  });
  const radiologistName = (id: string | null | undefined) =>
    (id ? radiologists.data?.find((r) => r.id === id)?.full_name ?? null : null);

  const selected = useMemo(
    () => (orders.data ?? []).find((o) => o.id === selectedId) ?? (orders.data ?? [])[0] ?? null,
    [orders.data, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadSigned() {
      if (!selected?.image_path) { setSignedUrl(null); return; }
      const { data } = await supabase.storage.from("imaging-files").createSignedUrl(selected.image_path, 600);
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    }
    void loadSigned();
    return () => { cancelled = true; };
  }, [selected?.id, selected?.image_path]);

  async function downloadPdf() {
    if (!selected) return;
    let dataUrl: string | null = null;
    if (selected.image_path) {
      const { data } = await supabase.storage.from("imaging-files").download(selected.image_path);
      if (data) {
        dataUrl = await new Promise<string>((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result as string);
          fr.readAsDataURL(data);
        });
      }
    }
    await exportImagingReportPDF({
      order_id: selected.id, modality: selected.modality, ordered_at: selected.created_at,
      findings: selected.findings, report: selected.report,
      patient_name: patientName, mrn, image_data_url: dataUrl,
      radiologist: radiologistName(selected.performed_by),
    });
  }

  if ((orders.data ?? []).length === 0) {
    return <p className="text-sm text-muted-foreground">No imaging studies yet.</p>;
  }

  const isPdf = selected?.image_path?.toLowerCase().endsWith(".pdf");

  return (
    <div className="grid gap-3 md:grid-cols-[280px_1fr]">
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b p-2 text-xs font-medium text-muted-foreground">
          <ScanLine className="h-3.5 w-3.5" /> Studies ({orders.data?.length ?? 0})
        </div>
        <div className="max-h-[65vh] overflow-auto">
          {orders.data?.map((o) => {
            const active = o.id === selected?.id;
            const reported = !!(o.report || o.findings);
            return (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={`flex w-full flex-col gap-0.5 border-l-4 border-b px-3 py-2 text-left text-xs transition ${
                  active ? "border-l-primary bg-accent" : "border-l-transparent hover:bg-accent/40"
                }`}
              >
                <span className="font-medium">{o.modality}{o.body_part ? ` · ${o.body_part}` : ""}</span>
                <span className="text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString("en-GB")} · {reported ? "reported" : o.status}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {!selected ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Select a study.</div>
        ) : (
          <div className="space-y-3 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-base font-semibold">{selected.modality}{selected.body_part ? ` · ${selected.body_part}` : ""}</div>
                <div className="text-xs text-muted-foreground">
                  Ordered {new Date(selected.created_at).toLocaleString("en-GB")}
                  {selected.performed_at && ` · Reported ${new Date(selected.performed_at).toLocaleString("en-GB")}`}
                </div>
              </div>
              {(selected.report || selected.findings) && (
                <Button size="sm" variant="outline" onClick={downloadPdf}>
                  <Download className="h-4 w-4" /> PDF
                </Button>
              )}
            </div>

            {selected.clinical_question && (
              <div className="rounded-md border bg-muted/30 p-2 text-xs">
                <span className="font-medium">Clinical question: </span>{selected.clinical_question}
              </div>
            )}

            {signedUrl && (
              <div className="space-y-1">
                {isPdf ? (
                  <iframe src={signedUrl} title="study" className="h-[55vh] w-full rounded border" />
                ) : (
                  <img src={signedUrl} alt="study" className="max-h-[55vh] w-full rounded border object-contain" />
                )}
                <a href={signedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Open in new tab
                </a>
              </div>
            )}

            {selected.findings && (
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Findings</div>
                <div className="whitespace-pre-wrap">{selected.findings}</div>
              </div>
            )}
            {selected.report && (
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Report</div>
                <div className="whitespace-pre-wrap">{selected.report}</div>
              </div>
            )}
            {!selected.report && !selected.findings && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Report pending.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
