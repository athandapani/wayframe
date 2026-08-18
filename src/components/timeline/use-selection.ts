"use client";

// Multi-milestone selection (mass-edit) — viewer/
// session state, not document content and not itself undo-tracked (only
// the bulk edit it eventually produces is, via useCorrectionBox's own
// history stack). Not persisted to localStorage either: unlike a display
// preference, "which markers are selected right now" has no reason to
// survive a reload.
import { useCallback, useState } from "react";

export interface UseSelectionResult {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  replace: (ids: Iterable<string>) => void;
  addAll: (ids: Iterable<string>) => void;
  clear: () => void;
}

export function useSelection(): UseSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const replace = useCallback((ids: Iterable<string>) => setSelectedIds(new Set(ids)), []);
  const addAll = useCallback((ids: Iterable<string>) => setSelectedIds((prev) => new Set([...prev, ...ids])), []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return { selectedIds, isSelected: (id) => selectedIds.has(id), toggle, replace, addAll, clear };
}
