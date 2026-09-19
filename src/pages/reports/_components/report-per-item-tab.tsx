import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";
import { Download, ShoppingBag, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { fmt } from "./report-utils.tsx";

type PerItemRow = {
  productName: string;
  sku: string;
  category: string;
  totalQty: number;
  avgPrice: number;
  totalRevenue: number;
  costPrice: number;
  totalCogs: number;
  profit: number;
  margin: number;
};

type SortKey = keyof PerItemRow;

const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean; kind: "currency" | "number" | "percent" | "text" }> = [
  { key: "productName", label: "Product Name", numeric: false, kind: "text" },
  { key: "sku", label: "SKU", numeric: false, kind: "text" },
  { key: "category", label: "Category", numeric: false, kind: "text" },
  { key: "totalQty", label: "Total Qty Sold", numeric: true, kind: "number" },
  { key: "avgPrice", label: "Avg Selling Price", numeric: true, kind: "currency" },
  { key: "totalRevenue", label: "Total Revenue", numeric: true, kind: "currency" },
  { key: "costPrice", label: "Cost Price", numeric: true, kind: "currency" },
  { key: "totalCogs", label: "Total COGS", numeric: true, kind: "currency" },
  { key: "profit", label: "Profit", numeric: true, kind: "currency" },
  { key: "margin", label: "Margin %", numeric: true, kind: "percent" },
];

function fmtCell(value: string | number, kind: "currency" | "number" | "percent" | "text") {
  if (kind === "currency") return fmt(Number(value));
  if (kind === "percent") return `${Number(value).toFixed(2)}%`;
  if (kind === "number") return Number(value).toLocaleString("en-US");
  return String(value || "—");
}

export default function PerItemTab() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const report = useQuery(api.reports.perItem.getPerItemReport, {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const sortedRows = useMemo(() => {
    if (!report?.rows) return [];
    const rows = [...report.rows];
    const dir = sortDir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }, [report, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "productName" || key === "sku" || key === "category" ? "asc" : "desc");
    }
  };

  const handleExportCSV = () => {
    if (sortedRows.length === 0) {
      toast.error("No data to export");
      return;
    }
    const exportData = sortedRows.map((r) => ({
      "Product Name": r.productName,
      SKU: r.sku,
      Category: r.category,
      "Total Qty Sold": r.totalQty,
      "Avg Selling Price": r.avgPrice,
      "Total Revenue": r.totalRevenue,
      "Cost Price": r.costPrice,
      "Total COGS": r.totalCogs,
      Profit: r.profit,
      "Margin %": r.margin,
    }));
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `per-item-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const summaryCards = report
    ? [
        { label: "Total Products Sold", value: report.summary.uniqueProducts.toLocaleString("en-US"), accent: "text-foreground" },
        { label: "Total Units Sold", value: report.summary.totalUnitsSold.toLocaleString("en-US"), accent: "text-foreground" },
        { label: "Total Revenue", value: fmt(report.summary.totalRevenue), accent: "text-green-600" },
        { label: "Total COGS", value: fmt(report.summary.totalCogs), accent: "text-amber-600" },
        { label: "Total Profit", value: fmt(report.summary.totalProfit), accent: report.summary.totalProfit >= 0 ? "text-primary" : "text-destructive" },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Date range filter + export */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer h-9"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="cursor-pointer"
          onClick={handleExportCSV}
          disabled={!report || sortedRows.length === 0}
        >
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      {!report ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {summaryCards.map((c) => (
            <Card key={c.label}>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-xl font-bold ${c.accent}`}>{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      {!report ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : sortedRows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingBag />
            </EmptyMedia>
            <EmptyTitle>No item sales found</EmptyTitle>
            <EmptyDescription>
              There are no product sales in the selected date range. Try adjusting the filters.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`text-xs whitespace-nowrap cursor-pointer select-none ${col.numeric ? "text-right" : ""}`}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className={`inline-flex items-center gap-1 ${col.numeric ? "flex-row-reverse" : ""}`}>
                      {col.label}
                      {sortKey === col.key &&
                        (sortDir === "desc" ? (
                          <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUp className="w-3 h-3" />
                        ))}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row, idx) => (
                <TableRow key={idx}>
                  {COLUMNS.map((col) => {
                    const isProfit = col.key === "profit";
                    const profitColor = isProfit
                      ? row.profit >= 0
                        ? "text-green-600"
                        : "text-destructive"
                      : "";
                    return (
                      <TableCell
                        key={col.key}
                        className={`text-xs whitespace-nowrap ${col.numeric ? "text-right tabular-nums" : ""} ${profitColor} ${col.key === "productName" ? "font-medium" : ""}`}
                      >
                        {fmtCell(row[col.key], col.kind)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
