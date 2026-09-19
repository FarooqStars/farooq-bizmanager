import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/convex/_generated/api.js";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { cn } from "@/lib/utils.ts";
import { SEARCH_PAGES } from "@/lib/search-pages.ts";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Search, Package, Users, Truck, Boxes, Building2, ShoppingCart, Warehouse, X,
  Compass, UserCog, ClipboardList, Receipt, TrendingDown, Briefcase, Landmark,
  CornerDownLeft, ArrowUp, ArrowDown,
} from "lucide-react";
import type { ElementType } from "react";

type Row = {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
};

const typeIcons: Record<string, ElementType> = {
  Navigation: Compass,
  Product: Package,
  Vendor: ShoppingCart,
  Customer: Users,
  Vehicle: Truck,
  Asset: Boxes,
  "Team Member": UserCog,
  Warehouse: Warehouse,
  Employee: Users,
  Order: ClipboardList,
  Bill: Receipt,
  Expense: TrendingDown,
  Project: Briefcase,
  "Bank Account": Landmark,
};

const typeColors: Record<string, string> = {
  Navigation: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  Product: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Vendor: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Customer: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Vehicle: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Asset: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  "Team Member": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  Warehouse: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  Employee: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  Order: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  Bill: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Expense: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  Project: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  "Bank Account": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

// Show groups in this order; anything not listed falls to the end.
const GROUP_ORDER = [
  "Navigation", "Product", "Customer", "Vendor", "Order", "Bill", "Expense",
  "Warehouse", "Vehicle", "Asset", "Project", "Bank Account", "Employee", "Team Member",
];

const PLURAL: Record<string, string> = {
  Navigation: "Pages",
  "Bank Account": "Bank Accounts",
  "Team Member": "Team Members",
};

function pluralize(type: string) {
  return PLURAL[type] ?? `${type}s`;
}

interface GlobalSearchProps {
  onClose?: () => void;
}

export default function GlobalSearch({ onClose }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [debouncedQuery] = useDebounce(query, 180);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const currentUser = useQuery(api.users.getCurrentUser);
  const userRole = currentUser?.role ?? "staff";

  const trimmed = debouncedQuery.trim();
  const hasQuery = trimmed.length >= 2;

  const entityResults = useQuery(
    api.search.globalSearch,
    hasQuery ? { q: trimmed } : "skip",
  );

  // Navigation matches are computed instantly on the client from the page catalog.
  const navResults: Row[] = useMemo(() => {
    if (!hasQuery) return [];
    const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    return SEARCH_PAGES
      .filter((p) => !p.roles || p.roles.includes(userRole))
      .map((p) => {
        // Use the translated sidebar label so search matches what the user sees.
        const label = t(p.labelKey, { defaultValue: p.label });
        const haystack = `${label} ${p.label} ${p.keywords.join(" ")} ${p.to}`.toLowerCase();
        const allMatch = tokens.every((tok) => haystack.includes(tok));
        if (!allMatch) return null;
        // Rank label matches above keyword-only matches.
        const labelHit = tokens.every((tok) => label.toLowerCase().includes(tok));
        return { page: p, label, score: labelHit ? 2 : 1 };
      })
      .filter((x): x is { page: (typeof SEARCH_PAGES)[number]; label: string; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .map(({ page, label }) => ({
        type: "Navigation",
        id: `nav-${page.to}`,
        title: label,
        subtitle: "Go to page",
        route: page.to,
      }));
  }, [trimmed, hasQuery, userRole, t]);

  const isEntityLoading = hasQuery && entityResults === undefined;

  // Merge: navigation first, then entities.
  const flatResults: Row[] = useMemo(
    () => [...navResults, ...(Array.isArray(entityResults) ? entityResults : [])],
    [navResults, entityResults],
  );

  // Group while preserving group order.
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of flatResults) {
      if (!map.has(r.type)) map.set(r.type, []);
      map.get(r.type)!.push(r);
    }
    return Array.from(map.entries()).sort(
      (a, b) => {
        const ia = GROUP_ORDER.indexOf(a[0]);
        const ib = GROUP_ORDER.indexOf(b[0]);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      },
    );
  }, [flatResults]);

  const closeAll = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const go = useCallback(
    (route: string) => {
      navigate(route);
      closeAll();
      onClose?.();
    },
    [navigate, closeAll, onClose],
  );

  // Global keyboard shortcut (Cmd/Ctrl+K) and Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeAll]);

  // Reset active row when the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, flatResults.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = flatResults[activeIndex];
      if (target) go(target.route);
    }
  };

  let flatIdx = 0;

  return (
    <>
      {/* Trigger button — shown in sidebar */}
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors border border-sidebar-border/50 cursor-pointer"
      >
        <Search className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-sidebar-border/50 rounded font-mono">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeAll} />

          <div className="relative w-full max-w-xl bg-card rounded-xl shadow-2xl border overflow-hidden">
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search anything — products, customers, pages, orders..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoComplete="off"
              />
              {isEntityLoading && <Spinner className="w-4 h-4 text-muted-foreground" />}
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="hidden sm:flex items-center text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {query.trim().length < 2 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Type at least 2 characters to search everything
                </div>
              ) : flatResults.length === 0 && isEntityLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Spinner className="w-4 h-4" /> Searching...
                </div>
              ) : flatResults.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No results for{" "}
                  <span className="font-medium text-foreground">{`"${query}"`}</span>
                </div>
              ) : (
                <div className="py-2">
                  {groups.map(([type, items]) => {
                    const TypeIcon = typeIcons[type] ?? Building2;
                    const colorClass = typeColors[type] ?? "bg-muted text-muted-foreground";
                    return (
                      <div key={type}>
                        <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {pluralize(type)}
                        </p>
                        {items.map((item) => {
                          const currentIdx = flatIdx++;
                          const isActive = currentIdx === activeIndex;
                          return (
                            <button
                              key={item.id}
                              onClick={() => go(item.route)}
                              onMouseEnter={() => setActiveIndex(currentIdx)}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer",
                                isActive ? "bg-accent" : "hover:bg-accent/50",
                              )}
                            >
                              <div className={cn("w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0", colorClass)}>
                                <TypeIcon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{item.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                              </div>
                              {isActive && (
                                <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer hint */}
            {flatResults.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 border-t text-xs text-muted-foreground bg-muted/30">
                <span className="flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" /> navigate
                </span>
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="w-3 h-3" /> open
                </span>
                <span className="ml-auto">
                  {flatResults.length} result{flatResults.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
