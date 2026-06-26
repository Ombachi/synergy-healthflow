import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Match {
  id: string; full_name: string; date_of_birth: string | null; phone: string | null;
  medical_record_number: string | null; score: number;
}

/** Live fuzzy-match against existing patients. Render below the new-patient form
 *  so receptionists can pick an existing record instead of creating a duplicate. */
export function DuplicatePatientCheck({
  name, dateOfBirth, phone, onSelectExisting,
}: { name: string; dateOfBirth?: string | null; phone?: string | null; onSelectExisting?: (id: string) => void }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = (name ?? "").trim();
    if (trimmed.length < 3 && !phone && !dateOfBirth) { setMatches([]); return; }
    const handle = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase.rpc("find_duplicate_patients" as never, {
        _name: trimmed || null, _dob: dateOfBirth || null, _phone: phone || null,
      } as never);
      setMatches(((data as unknown as Match[]) ?? []).filter(m => m.score >= 0.35));
      setLoading(false);
    }, 350);
    return () => clearTimeout(handle);
  }, [name, dateOfBirth, phone]);

  if (matches.length === 0 && !loading) return null;
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="flex items-center gap-1 font-medium text-amber-800">
        <AlertTriangle className="h-4 w-4"/> Possible duplicate{matches.length>1?"s":""} found
      </div>
      <ul className="mt-1 space-y-1">
        {matches.map(m => (
          <li key={m.id} className="flex items-center justify-between gap-2">
            <span>
              <b>{m.full_name}</b>
              {m.medical_record_number && <span className="text-muted-foreground"> · {m.medical_record_number}</span>}
              {m.date_of_birth && <span className="text-muted-foreground"> · DOB {m.date_of_birth}</span>}
              {m.phone && <span className="text-muted-foreground"> · {m.phone}</span>}
              <span className="ml-1 text-xs text-muted-foreground">({Math.round(m.score*100)}%)</span>
            </span>
            {onSelectExisting && (
              <button type="button" className="text-xs text-primary underline" onClick={()=>onSelectExisting(m.id)}>Use this patient</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
