import { useCallback, useEffect, useRef, useState } from "react";
import { getCache, setCache } from "./offline/db";
import { DEFAULT_FIELD_STATE, restoreFieldState, type FieldListState } from "../../lib/quality/field-list";

export function useQualityFieldState(key: string) {
  const [saved, setSaved] = useState<{ key: string; value: FieldListState } | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getCache(key).then(cache => { if (active) setSaved({ key, value: restoreFieldState(cache?.value) }); }).catch(() => {
      if (active) { setError("Saved filters could not be loaded."); setSaved({ key, value: { ...DEFAULT_FIELD_STATE } }); }
    });
    return () => { active = false; };
  }, [key]);
  const update = useCallback((value: FieldListState) => {
    setSaved({ key, value });
    writes.current = writes.current.catch(() => undefined).then(() => setCache(key, value)).then(() => setError(null)).catch(() => setError("Filters remain active, but could not be saved on this device."));
  }, [key]);
  return { state: saved?.key === key ? saved.value : DEFAULT_FIELD_STATE, ready: saved?.key === key, update, error };
}
