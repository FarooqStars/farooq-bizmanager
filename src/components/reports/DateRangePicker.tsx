/**
 * DateRangePicker — shared across all financial reports.
 *
 * Presets (in order an accountant uses them):
 *   Today | This Week | This Month | Last Month | This Quarter | Last Quarter
 *   This Year | Last Year | Fiscal Year to Date | Custom
 *
 * Fiscal-year-aware: uses companyProfile.fiscalYearStartMonth (1 = Jan, default).
 * Selected range is passed to parent via onChange({ startDate, endDate }) as
 * ISO 8601 strings ("YYYY-MM-DD").
 */
import { useState } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter,
  subQuarters, startOfYear, endOfYear, subYears, setMonth } from "date-fns";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { cn } from "@/lib/utils.ts";

export type DateRange = { startDate: string; endDate: string };

type Preset =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "fiscal_ytd"
  | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  last_quarter: "Last Quarter",
  this_year: "This Year",
  last_year: "Last Year",
  fiscal_ytd: "Fiscal Year to Date",
  custom: "Custom",
};

const PRESETS: Preset[] = [
  "today",
  "this_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "fiscal_ytd",
  "custom",
];

function fmt(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function resolvePreset(preset: Preset, fiscalStartMonth: number): DateRange {
  const now = new Date();
  switch (preset) {
    case "today":
      return { startDate: fmt(startOfDay(now)), endDate: fmt(endOfDay(now)) };
    case "this_week":
      return { startDate: fmt(startOfWeek(now, { weekStartsOn: 1 })), endDate: fmt(endOfWeek(now, { weekStartsOn: 1 })) };
    case "this_month":
      return { startDate: fmt(startOfMonth(now)), endDate: fmt(endOfMonth(now)) };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { startDate: fmt(startOfMonth(lm)), endDate: fmt(endOfMonth(lm)) };
    }
    case "this_quarter":
      return { startDate: fmt(startOfQuarter(now)), endDate: fmt(endOfQuarter(now)) };
    case "last_quarter": {
      const lq = subQuarters(now, 1);
      return { startDate: fmt(startOfQuarter(lq)), endDate: fmt(endOfQuarter(lq)) };
    }
    case "this_year":
      return { startDate: fmt(startOfYear(now)), endDate: fmt(endOfYear(now)) };
    case "last_year": {
      const ly = subYears(now, 1);
      return { startDate: fmt(startOfYear(ly)), endDate: fmt(endOfYear(ly)) };
    }
    case "fiscal_ytd": {
      // Fiscal year starts on fiscalStartMonth (1-based). If we're past that month
      // in the current calendar year, the FY started this year; otherwise last year.
      const fyStartMonth0 = fiscalStartMonth - 1; // convert to 0-based
      const fyStartThisYear = setMonth(startOfYear(now), fyStartMonth0);
      const fyStart = fyStartThisYear <= now ? fyStartThisYear : subYears(fyStartThisYear, 1);
      return { startDate: fmt(fyStart), endDate: fmt(now) };
    }
    case "custom":
      // Caller manages start/end manually; return current month as fallback.
      return { startDate: fmt(startOfMonth(now)), endDate: fmt(endOfMonth(now)) };
  }
}

type Props = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** fiscalYearStartMonth: 1 = January (default), 4 = April, 7 = July, etc. */
  fiscalYearStartMonth?: number;
  className?: string;
};

export default function DateRangePicker({
  value,
  onChange,
  fiscalYearStartMonth = 1,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<Preset>("last_month");
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);
  const [customStep, setCustomStep] = useState<"start" | "end">("start");

  const handlePreset = (preset: Preset) => {
    setActivePreset(preset);
    if (preset !== "custom") {
      onChange(resolvePreset(preset, fiscalYearStartMonth));
      setOpen(false);
    } else {
      // Stay open for custom date selection
      setCustomStart(undefined);
      setCustomEnd(undefined);
      setCustomStep("start");
    }
  };

  const handleCustomDay = (day: Date | undefined) => {
    if (!day) return;
    if (customStep === "start") {
      setCustomStart(day);
      setCustomEnd(undefined);
      setCustomStep("end");
    } else {
      const end = day < (customStart ?? day) ? customStart! : day;
      const start = day < (customStart ?? day) ? day : customStart!;
      setCustomEnd(end);
      onChange({ startDate: fmt(start), endDate: fmt(end) });
      setOpen(false);
    }
  };

  const displayLabel = (() => {
    if (activePreset !== "custom") return PRESET_LABELS[activePreset];
    if (value.startDate === value.endDate) return format(new Date(value.startDate), "dd MMM yyyy");
    return `${format(new Date(value.startDate), "dd MMM yyyy")} – ${format(new Date(value.endDate), "dd MMM yyyy")}`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          className={cn("gap-2 font-normal print:hidden cursor-pointer", className)}
        >
          <CalendarIcon className="w-4 h-4" />
          {displayLabel}
          <ChevronDown className="w-3 h-3 ml-1 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 flex">
        {/* Preset list */}
        <div className="flex flex-col border-r py-2 min-w-[180px]">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              className={cn(
                "text-left px-4 py-1.5 text-sm hover:bg-muted cursor-pointer transition-colors",
                activePreset === p && "bg-primary/10 text-primary font-medium",
              )}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Custom calendar — only shown when Custom is selected */}
        {activePreset === "custom" && (
          <div className="p-3 space-y-2">
            <p className="text-xs text-muted-foreground px-1">
              {customStep === "start" ? "Select start date" : "Select end date"}
            </p>
            <Calendar
              mode="single"
              selected={customStep === "end" ? customEnd : customStart}
              onSelect={handleCustomDay}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
