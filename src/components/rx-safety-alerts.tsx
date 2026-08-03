import { AlertTriangle, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import type { SafetyWarning } from "@/lib/rx-safety";

const STYLES: Record<string, { box: string; icon: typeof Info }> = {
  major: { box: "border-destructive/40 bg-destructive/10 text-destructive", icon: ShieldAlert },
  moderate: { box: "border-amber-500/40 bg-amber-500/10 text-amber-700", icon: AlertTriangle },
  minor: { box: "border-blue-500/40 bg-blue-500/10 text-blue-700", icon: Info },
};

/**
 * Renders drug–allergy and drug–drug interaction warnings raised at
 * prescribe / dispense time.
 */
export function RxSafetyAlerts({
  warnings,
  showClear = true,
  compact = false,
}: {
  warnings: SafetyWarning[];
  showClear?: boolean;
  compact?: boolean;
}) {
  if (warnings.length === 0) {
    if (!showClear) return null;
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs text-green-700">
        <ShieldCheck className="h-4 w-4" /> No allergy or interaction alerts found.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => {
        const s = STYLES[w.severity] ?? STYLES.moderate;
        const Icon = s.icon;
        return (
          <div key={i} className={`rounded-md border px-3 py-2 text-xs ${s.box}`}>
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">{w.title}</div>
                {!compact && <div className="mt-0.5 opacity-90">{w.detail}</div>}
                {w.advice && <div className="mt-0.5 font-medium">Action: {w.advice}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function hasBlockingWarning(warnings: SafetyWarning[]): boolean {
  return warnings.some((w) => w.severity === "major");
}
