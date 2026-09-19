import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Shared helper for deep-linking from global search to a specific record.
 *
 * A search result navigates to e.g. `/products?focus=<id>`. The destination
 * page uses this hook to (1) know which record to highlight, (2) scroll it
 * into view, and (3) briefly flash a ring around it. The `focus` param is
 * cleared from the URL once handled so refreshes/back navigation stay clean.
 */
export function useFocusItem() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    setActiveId(focusId);

    // Wait a tick for the list to render, then scroll the item into view.
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`focus-${focusId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    // Remove the ?focus param without adding a history entry.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("focus");
        return next;
      },
      { replace: true },
    );

    // Clear the highlight after the flash animation.
    const clearTimer = setTimeout(() => setActiveId(null), 2600);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const isFocused = useCallback((id: string) => activeId === id, [activeId]);

  return { focusId, isFocused };
}

/** DOM id used so the focused card can be scrolled into view. */
export function focusElementId(id: string) {
  return `focus-${id}`;
}

/** Tailwind classes applied to a focused card for a brief highlight flash. */
export const FOCUS_RING_CLASS =
  "ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow duration-300";
