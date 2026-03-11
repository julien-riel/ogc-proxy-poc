import { useCallback, useState } from 'react';
import type { RequestLogEntry } from '../types/ogc.js';

export interface UseRequestLogReturn {
  entries: RequestLogEntry[];
  addEntry: (entry: RequestLogEntry) => void;
  clear: () => void;
}

/** Manages the debug request log. Entries are stored in reverse chronological order. */
export function useRequestLog(): UseRequestLogReturn {
  const [entries, setEntries] = useState<RequestLogEntry[]>([]);

  const addEntry = useCallback((entry: RequestLogEntry) => {
    setEntries((prev) => [entry, ...prev]);
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, addEntry, clear };
}
