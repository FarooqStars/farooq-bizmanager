/**
 * ReportShell — shared wrapper for every financial report page.
 *
 * Provides:
 *  - Company header (name + logo, print only)
 *  - Report title + subtitle
 *  - DateRangePicker slot
 *  - Print / PDF / Excel / Share toolbar (hidden on print)
 *  - Unconditional base-currency disclaimer footer
 *  - Children slot for the report table / content
 *
 * The currency disclaimer is ALWAYS rendered — never conditional.
 */
import { useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Printer, Download, FileSpreadsheet, Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import DateRangePicker, { type DateRange } from "./DateRangePicker.tsx";

type Props = {
  title: string;
  subtitle?: string;
  /** ISO date range for the current report period */
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  /** Additional toolbar items (e.g. filters) rendered before the action buttons */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Called when the user clicks Export Excel. Should return CSV/XLSX data URL or trigger download. */
  onExportExcel?: () => void;
  /** Called when the user clicks Export CSV (fallback when onExportExcel not provided). */
  onExportCsv?: () => void;
};

export const CURRENCY_DISCLAIMER =
  "All figures are shown in base currency. Foreign-currency conversion is not yet supported.";

export default function ReportShell({
  title,
  subtitle,
  dateRange,
  onDateRangeChange,
  toolbar,
  children,
  className,
  onExportExcel,
  onExportCsv,
}: Props) {
  const profile = useQuery(api.companyProfile.get);
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => window.print();

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className={cn("flex flex-col min-h-full", className)}>
      {/* ── Toolbar (hidden on print) ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b print:hidden">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {toolbar}

          <DateRangePicker
            value={dateRange}
            onChange={onDateRangeChange}
            fiscalYearStartMonth={profile?.fiscalYearStartMonth ?? 1}
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrint}
            className="cursor-pointer gap-1.5"
          >
            <Printer className="w-4 h-4" />
            Print
          </Button>

          {(onExportExcel ?? onExportCsv) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onExportExcel ?? onExportCsv}
              className="cursor-pointer gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleShare}
            className="cursor-pointer gap-1.5"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // PDF via browser print dialog with print CSS
              window.print();
            }}
            className="cursor-pointer gap-1.5"
          >
            <Download className="w-4 h-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* ── Print header (visible on print only) ─────────────────────── */}
      <div className="hidden print:block px-8 pt-6 pb-2">
        <div className="flex items-start justify-between border-b pb-3 mb-4">
          <div>
            <p className="text-xl font-bold">{profile?.nameEn ?? "Company"}</p>
            {profile?.nameAr && (
              <p className="text-sm text-muted-foreground" dir="rtl">{profile.nameAr}</p>
            )}
          </div>
          <div className="text-right text-sm text-muted-foreground">
            {profile?.phone && <p>{profile.phone}</p>}
            {profile?.email && <p>{profile.email}</p>}
            {profile?.crNumber && <p>CR: {profile.crNumber}</p>}
          </div>
        </div>
        <h1 className="text-lg font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        <p className="text-sm text-muted-foreground mt-1">
          Period: {dateRange.startDate} to {dateRange.endDate}
        </p>
      </div>

      {/* ── Report content ─────────────────────────────────────────────── */}
      <div ref={contentRef} className="flex-1 overflow-auto px-4 py-4 print:px-8 print:py-2">
        {children}
      </div>

      {/* ── Currency disclaimer (ALWAYS rendered — never conditional) ─── */}
      <footer className="px-4 py-3 border-t text-xs text-muted-foreground print:px-8 print:py-2">
        {CURRENCY_DISCLAIMER}
      </footer>
    </div>
  );
}
