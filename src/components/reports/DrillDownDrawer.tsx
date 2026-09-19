/**
 * DrillDownDrawer — shows the raw posted journal lines that make up any
 * clicked monetary figure in a financial report.
 *
 * Usage:
 *   const drill = useDrillDown();
 *   <td onClick={() => drill.open({ label: "Revenue", lines: revenueLines })}>
 *     {fmt(total)}
 *   </td>
 *   <DrillDownDrawer state={drill} />
 */
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { format } from "date-fns";
import { useState } from "react";
import type { PostedLine } from "@/convex/lib/reportQueries.ts";

export type DrillLine = Pick<
  PostedLine,
  "_id" | "date" | "debit" | "credit" | "description" | "accountId"
> & {
  accountName?: string;
  entryNumber?: string;
  entryDescription?: string;
};

export type DrillDownState = {
  isOpen: boolean;
  label: string;
  lines: DrillLine[];
  open: (payload: { label: string; lines: DrillLine[] }) => void;
  close: () => void;
};

export function useDrillDown(): DrillDownState {
  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [lines, setLines] = useState<DrillLine[]>([]);

  return {
    isOpen,
    label,
    lines,
    open: ({ label: l, lines: ls }) => {
      setLabel(l);
      setLines(ls);
      setIsOpen(true);
    },
    close: () => setIsOpen(false),
  };
}

function fmtAmount(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { state: DrillDownState };

export default function DrillDownDrawer({ state }: Props) {
  const total = state.lines.reduce((s, l) => s + l.debit - l.credit, 0);

  return (
    <Sheet open={state.isOpen} onOpenChange={(v) => !v && state.close()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto print:hidden">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle>{state.label}</SheetTitle>
          <SheetDescription>
            {state.lines.length} journal line{state.lines.length !== 1 ? "s" : ""} — net{" "}
            <span className={total < 0 ? "text-destructive" : "text-foreground"}>
              {fmtAmount(Math.abs(total))}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-0 text-sm">
          {/* Header row */}
          <div className="grid grid-cols-[90px_1fr_80px_80px] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
            <span>Date</span>
            <span>Description</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
          </div>

          {state.lines.length === 0 && (
            <p className="py-6 text-center text-muted-foreground text-sm">No lines to display.</p>
          )}

          {state.lines.map((line) => (
            <div
              key={line._id}
              className="grid grid-cols-[90px_1fr_80px_80px] gap-2 px-2 py-2 border-b last:border-0 hover:bg-muted/40 transition-colors"
            >
              <span className="text-muted-foreground tabular-nums">
                {format(new Date(line.date), "dd MMM yy")}
              </span>
              <div className="min-w-0">
                <p className="truncate">{line.description ?? line.entryDescription ?? "—"}</p>
                {line.accountName && (
                  <p className="text-xs text-muted-foreground truncate">{line.accountName}</p>
                )}
                {line.entryNumber && (
                  <Badge variant="outline" className="text-[10px] mt-0.5 h-4">
                    {line.entryNumber}
                  </Badge>
                )}
              </div>
              <span className="text-right tabular-nums">
                {line.debit > 0 ? fmtAmount(line.debit) : ""}
              </span>
              <span className="text-right tabular-nums">
                {line.credit > 0 ? fmtAmount(line.credit) : ""}
              </span>
            </div>
          ))}

          {state.lines.length > 0 && (
            <div className="grid grid-cols-[90px_1fr_80px_80px] gap-2 px-2 py-2 font-semibold border-t bg-muted/30">
              <span className="col-span-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                Total
              </span>
              <span className="text-right tabular-nums">
                {fmtAmount(state.lines.reduce((s, l) => s + l.debit, 0))}
              </span>
              <span className="text-right tabular-nums">
                {fmtAmount(state.lines.reduce((s, l) => s + l.credit, 0))}
              </span>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
