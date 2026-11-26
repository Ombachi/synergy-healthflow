import { useCallback, useEffect, useRef, useState } from "react";

/** Auto-saves form state to sessionStorage under `key` and restores it when the user returns. */
export function useSessionDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    hydrated.current = false;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) { setValue(JSON.parse(raw) as T); setRestored(true); }
    } catch { /* ignore corrupt draft */ }
    hydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ }
  }, [key, value]);

  const clear = useCallback(() => {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    setRestored(false);
  }, [key]);

  return [value, setValue, { restored, clear }] as const;
}
