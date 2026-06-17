// Standardized workflow status labels + colors used across queues, visits, and dashboards.
// Covers the full hospital lifecycle: Registered → Closed.

export type WorkflowStatus =
  | "registered"
  | "checked_in"
  | "waiting_triage"
  | "triaged"
  | "waiting_doctor"
  | "in_consultation"
  | "lab_ordered"
  | "imaging_ordered"
  | "procedure_ordered"
  | "result_pending"
  | "result_completed"
  | "awaiting_billing"
  | "awaiting_pharmacy"
  | "discharged"
  | "closed"
  // common synonyms emitted by various tables
  | "open"
  | "triage"
  | "doctor"
  | "lab"
  | "radiology"
  | "pharmacy"
  | "billing"
  | "pending"
  | "in_progress"
  | "collected"
  | "resulted"
  | "dispensed"
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "fulfilled"
  | "partially_fulfilled"
  | "paid"
  | "partially_paid"
  | "issued"
  | "void"
  | string;

interface Spec { label: string; tone: "neutral" | "amber" | "blue" | "indigo" | "green" | "rose" | "violet" }

const SPEC: Record<string, Spec> = {
  // visit lifecycle
  registered: { label: "Registered", tone: "neutral" },
  checked_in: { label: "Checked in", tone: "blue" },
  waiting_triage: { label: "Waiting for triage", tone: "amber" },
  triage: { label: "Waiting for triage", tone: "amber" },
  triaged: { label: "Triaged", tone: "indigo" },
  waiting_doctor: { label: "Waiting for doctor", tone: "amber" },
  doctor: { label: "Waiting for doctor", tone: "amber" },
  in_consultation: { label: "Under consultation", tone: "violet" },
  lab_ordered: { label: "Lab ordered", tone: "indigo" },
  lab: { label: "At lab", tone: "indigo" },
  imaging_ordered: { label: "Imaging ordered", tone: "indigo" },
  radiology: { label: "At imaging", tone: "indigo" },
  procedure_ordered: { label: "Procedure ordered", tone: "indigo" },
  result_pending: { label: "Result pending", tone: "amber" },
  result_completed: { label: "Result completed", tone: "green" },
  awaiting_billing: { label: "Awaiting billing", tone: "amber" },
  billing: { label: "Awaiting billing", tone: "amber" },
  awaiting_pharmacy: { label: "Awaiting pharmacy", tone: "amber" },
  pharmacy: { label: "At pharmacy", tone: "amber" },
  discharged: { label: "Discharged", tone: "green" },
  closed: { label: "Closed", tone: "neutral" },
  open: { label: "Open", tone: "blue" },

  // order/result statuses
  pending: { label: "Pending", tone: "amber" },
  in_progress: { label: "In progress", tone: "blue" },
  collected: { label: "Sample collected", tone: "blue" },
  resulted: { label: "Result completed", tone: "green" },
  dispensed: { label: "Dispensed", tone: "green" },

  // stock-request lifecycle
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "blue" },
  approved: { label: "Approved", tone: "indigo" },
  rejected: { label: "Rejected", tone: "rose" },
  fulfilled: { label: "Fulfilled", tone: "green" },
  partially_fulfilled: { label: "Partially fulfilled", tone: "amber" },

  // billing
  paid: { label: "Paid", tone: "green" },
  partially_paid: { label: "Partially paid", tone: "amber" },
  issued: { label: "Issued", tone: "blue" },
  void: { label: "Void", tone: "rose" },
};

const TONE: Record<Spec["tone"], string> = {
  neutral: "bg-muted text-muted-foreground",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

export function workflowLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return SPEC[status]?.label ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function WorkflowChip({ status, className = "" }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">—</span>;
  const spec = SPEC[status];
  const tone = spec ? TONE[spec.tone] : TONE.neutral;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tone} ${className}`}>
      {workflowLabel(status)}
    </span>
  );
}
