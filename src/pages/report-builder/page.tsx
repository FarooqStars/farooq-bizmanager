import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Wand2,
  Plus,
  Trash2,
  Download,
  Save,
  FolderOpen,
  Play,
  X,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";

// ── Data sources & columns ──────────────────────────────────────────────────

const DATA_SOURCES = [
  { value: "sales", label: "Sales" },
  { value: "purchases", label: "Purchases / Bills" },
  { value: "inventory", label: "Products & Inventory" },
  { value: "customers", label: "Customers" },
  { value: "vendors", label: "Vendors" },
  { value: "expenses", label: "Expenses" },
  { value: "invoices", label: "Invoices" },
  { value: "employees", label: "Employees" },
  { value: "journal", label: "Journal Entries" },
] as const;

const COLUMNS_BY_SOURCE: Record<string, Array<{ value: string; label: string }>> = {
  sales: [
    { value: "date", label: "Date" },
    { value: "customerName", label: "Customer" },
    { value: "totalAmount", label: "Amount" },
    { value: "status", label: "Status" },
    { value: "paymentMethod", label: "Payment Method" },
    { value: "discount", label: "Discount" },
    { value: "notes", label: "Notes" },
  ],
  peritem: [],
  purchases: [
    { value: "title", label: "Title" },
    { value: "vendorId", label: "Vendor" },
    { value: "amount", label: "Amount" },
    { value: "dueDate", label: "Due Date" },
    { value: "status", label: "Status" },
    { value: "notes", label: "Notes" },
  ],
  inventory: [
    { value: "name", label: "Name" },
    { value: "sku", label: "SKU" },
    { value: "unitPrice", label: "Unit Price" },
    { value: "category", label: "Category" },
    { value: "lowStockThreshold", label: "Low Stock Threshold" },
    { value: "isActive", label: "Active" },
  ],
  customers: [
    { value: "name", label: "Name" },
  ],
  vendors: [
    { value: "name", label: "Name" },
    { value: "contactName", label: "Contact" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "address", label: "Address" },
    { value: "isActive", label: "Active" },
  ],
  expenses: [
    { value: "title", label: "Title" },
    { value: "amount", label: "Amount" },
    { value: "date", label: "Date" },
    { value: "notes", label: "Notes" },
  ],
  invoices: [
    { value: "invoiceNumber", label: "Invoice #" },
    { value: "customerName", label: "Customer" },
    { value: "totalAmount", label: "Amount" },
    { value: "status", label: "Status" },
    { value: "dueDate", label: "Due Date" },
    { value: "issueDate", label: "Issue Date" },
  ],
  employees: [
    { value: "firstName", label: "First Name" },
    { value: "lastName", label: "Last Name" },
    { value: "email", label: "Email" },
    { value: "position", label: "Position" },
    { value: "department", label: "Department" },
    { value: "salary", label: "Salary" },
    { value: "startDate", label: "Start Date" },
    { value: "status", label: "Status" },
  ],
  journal: [
    { value: "date", label: "Date" },
    { value: "description", label: "Description" },
    { value: "debitAccount", label: "Debit Account" },
    { value: "creditAccount", label: "Credit Account" },
    { value: "amount", label: "Amount" },
    { value: "reference", label: "Reference" },
  ],
};

const OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "between", label: "Between" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" },
] as const;

type DataSource = (typeof DATA_SOURCES)[number]["value"];
type FilterConfig = {
  field: string;
  operator: string;
  value: string;
  value2?: string;
};

// ── Main component ──────────────────────────────────────────────────────────

export default function ReportBuilderPage() {
  const [dataSource, setDataSource] = useState<DataSource>("sales");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [groupBy, setGroupBy] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [runConfig, setRunConfig] = useState<{
    dataSource: DataSource;
    filters: FilterConfig[];
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [reportName, setReportName] = useState("");

  const savedReports = useQuery(api.reportBuilder.list);
  const saveReport = useMutation(api.reportBuilder.save);
  const removeReport = useMutation(api.reportBuilder.remove);

  // Run report query only when user clicks "Run"
  const reportResult = useQuery(
    api.reportBuilder.runReport,
    runConfig
      ? {
          dataSource: runConfig.dataSource,
          filters: runConfig.filters.map((f) => ({
            field: f.field,
            operator: f.operator as "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "between" | "is_empty" | "is_not_empty",
            value: f.value,
            value2: f.value2,
          })),
          sortBy: runConfig.sortBy || undefined,
          sortOrder: runConfig.sortOrder || undefined,
        }
      : "skip"
  );

  const availableColumns = useMemo(
    () => COLUMNS_BY_SOURCE[dataSource] ?? [],
    [dataSource]
  );

  // When data source changes, reset columns and filters
  const handleSourceChange = (val: string) => {
    const source = val as DataSource;
    setDataSource(source);
    setSelectedColumns([]);
    setFilters([]);
    setGroupBy("");
    setSortBy("");
    setRunConfig(null);
  };

  const toggleColumn = (col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const selectAllColumns = () => {
    setSelectedColumns(availableColumns.map((c) => c.value));
  };

  const addFilter = () => {
    const firstField = availableColumns[0]?.value ?? "";
    setFilters([...filters, { field: firstField, operator: "contains", value: "" }]);
  };

  const updateFilter = (index: number, updates: Partial<FilterConfig>) => {
    setFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const removeFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRun = () => {
    if (selectedColumns.length === 0) {
      toast.error("Select at least one column");
      return;
    }
    setRunConfig({
      dataSource,
      filters: filters.filter((f) => f.field),
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined,
    });
  };

  const handleSave = async () => {
    if (!reportName.trim()) {
      toast.error("Enter a report name");
      return;
    }
    try {
      await saveReport({
        name: reportName.trim(),
        dataSource,
        columns: selectedColumns,
        filters: filters.filter((f) => f.field).map((f) => ({
          field: f.field,
          operator: f.operator as "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "between" | "is_empty" | "is_not_empty",
          value: f.value,
          value2: f.value2,
        })),
        groupBy: groupBy || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
        isPublic: true,
      });
      toast.success("Report saved");
      setShowSave(false);
      setReportName("");
    } catch {
      toast.error("Failed to save report");
    }
  };

  const handleLoadReport = (report: NonNullable<typeof savedReports>[number]) => {
    // "peritem" was removed in Milestone 7 — fall back to "sales" for legacy saved reports
    const ds = report.dataSource === "peritem" ? "sales" : report.dataSource;
    setDataSource(ds as typeof dataSource);
    setSelectedColumns(report.columns);
    setFilters(
      report.filters.map((f) => ({
        field: f.field,
        operator: f.operator,
        value: f.value,
        value2: f.value2,
      }))
    );
    setGroupBy(report.groupBy ?? "");
    setSortBy(report.sortBy ?? "");
    setSortOrder(report.sortOrder ?? "asc");
    setShowLoad(false);
    // Auto-run loaded report
    setRunConfig({
      dataSource: ds as typeof dataSource,
      filters: report.filters.map((f) => ({
        field: f.field,
        operator: f.operator,
        value: f.value,
        value2: f.value2,
      })),
      sortBy: report.sortBy || undefined,
      sortOrder: report.sortOrder || undefined,
    });
  };

  const handleExportCSV = () => {
    if (!reportResult?.rows || reportResult.rows.length === 0) {
      toast.error("No data to export");
      return;
    }
    const cols = selectedColumns.length > 0 ? selectedColumns : Object.keys(reportResult.rows[0]);
    const exportData = reportResult.rows.map((row) => {
      const out: Record<string, string> = {};
      for (const col of cols) {
        const val = row[col];
        out[col] = val === null || val === undefined ? "" : String(val);
      }
      return out;
    });
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report-${dataSource}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  // Filter rows to show only selected columns
  const displayRows = useMemo(() => {
    if (!reportResult?.rows) return [];
    if (selectedColumns.length === 0) return reportResult.rows;
    return reportResult.rows;
  }, [reportResult, selectedColumns]);

  const displayColumns = useMemo(() => {
    if (selectedColumns.length > 0) return selectedColumns;
    if (displayRows.length > 0) return Object.keys(displayRows[0]);
    return [];
  }, [selectedColumns, displayRows]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="w-6 h-6" /> Report Builder
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build custom reports with flexible filters, grouping, and export
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLoad(true)}
            className="cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 mr-1" /> Load
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowSave(true)}
            className="cursor-pointer"
          >
            <Save className="w-4 h-4 mr-1" /> Save
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCSV}
            disabled={!reportResult?.rows?.length}
            className="cursor-pointer"
          >
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* Left Panel: Configuration */}
        <div className="space-y-4">
          {/* Data Source */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">Data Source</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Select value={dataSource} onValueChange={handleSourceChange}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_SOURCES.map((ds) => (
                    <SelectItem key={ds.value} value={ds.value}>
                      {ds.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Columns */}
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Columns</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllColumns}
                  className="text-xs cursor-pointer h-7"
                >
                  Select All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-wrap gap-1.5">
                {availableColumns.map((col) => (
                  <Badge
                    key={col.value}
                    variant={selectedColumns.includes(col.value) ? "default" : "secondary"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleColumn(col.value)}
                  >
                    {col.label}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Filters</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addFilter}
                  className="text-xs cursor-pointer h-7"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {filters.length === 0 && (
                <p className="text-xs text-muted-foreground">No filters applied</p>
              )}
              {filters.map((f, idx) => (
                <div key={idx} className="space-y-2 p-2 border rounded-md relative">
                  <button
                    onClick={() => removeFilter(idx)}
                    className="absolute top-1 right-1 text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <Select
                    value={f.field}
                    onValueChange={(v) => updateFilter(idx, { field: v })}
                  >
                    <SelectTrigger className="h-8 text-xs cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableColumns.map((col) => (
                        <SelectItem key={col.value} value={col.value}>
                          {col.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={f.operator}
                    onValueChange={(v) => updateFilter(idx, { operator: v })}
                  >
                    <SelectTrigger className="h-8 text-xs cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {f.operator !== "is_empty" && f.operator !== "is_not_empty" && (
                    <Input
                      placeholder="Value..."
                      value={f.value}
                      onChange={(e) => updateFilter(idx, { value: e.target.value })}
                      className="h-8 text-xs"
                    />
                  )}
                  {f.operator === "between" && (
                    <Input
                      placeholder="Value 2..."
                      value={f.value2 ?? ""}
                      onChange={(e) => updateFilter(idx, { value2: e.target.value })}
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Sort */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5" /> Sort
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Select value={sortBy || "none"} onValueChange={(v) => setSortBy(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs cursor-pointer">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {availableColumns.map((col) => (
                    <SelectItem key={col.value} value={col.value}>
                      {col.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sortBy && (
                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
                  <SelectTrigger className="h-8 text-xs cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Run Button */}
          <Button onClick={handleRun} className="w-full cursor-pointer">
            <Play className="w-4 h-4 mr-2" /> Run Report
          </Button>
        </div>

        {/* Right Panel: Results */}
        <Card className="min-h-[400px]">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Results
                {reportResult && (
                  <span className="text-muted-foreground font-normal ml-2">
                    ({reportResult.totalCount} rows{reportResult.totalCount > 1000 ? ", showing first 1000" : ""})
                  </span>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {/* Disclaimer shown whenever a source with monetary document fields is selected */}
            {(["sales", "invoices", "purchases", "expenses"] as DataSource[]).includes(dataSource) && (
              <p className="text-xs text-muted-foreground bg-muted/50 border rounded px-3 py-2 mb-3">
                Document totals are taken from the source documents and are not ledger-derived. They may differ from the financial statements. For reportable figures use the Financial Statements reports.
              </p>
            )}
            {!runConfig && (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Configure your report and click "Run Report"
              </div>
            )}
            {runConfig && !reportResult && (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            )}
            {runConfig && reportResult && displayRows.length === 0 && (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                No data matches your filters
              </div>
            )}
            {runConfig && reportResult && displayRows.length > 0 && (
              <div className="overflow-auto max-h-[600px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {displayColumns.map((col) => {
                        const colDef = availableColumns.find((c) => c.value === col);
                        return (
                          <TableHead key={col} className="text-xs whitespace-nowrap">
                            {colDef?.label ?? col}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.map((row, idx) => (
                      <TableRow key={idx}>
                        {displayColumns.map((col) => {
                          const val = row[col];
                          return (
                            <TableCell key={col} className="text-xs whitespace-nowrap">
                              {val === null || val === undefined
                                ? ""
                                : typeof val === "boolean"
                                  ? val ? "Yes" : "No"
                                  : String(val)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Save Dialog */}
      <Dialog open={showSave} onOpenChange={setShowSave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Report Name</Label>
              <Input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g. Monthly Sales Summary"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Current config: {DATA_SOURCES.find((d) => d.value === dataSource)?.label},{" "}
              {selectedColumns.length} columns, {filters.length} filters
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSave(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleSave} className="cursor-pointer">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Dialog */}
      <Dialog open={showLoad} onOpenChange={setShowLoad}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load Saved Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-auto">
            {!savedReports && <Skeleton className="h-10 w-full" />}
            {savedReports && savedReports.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No saved reports yet
              </p>
            )}
            {savedReports?.map((report) => (
              <div
                key={report._id}
                className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 cursor-pointer"
                onClick={() => handleLoadReport(report)}
              >
                <div>
                  <p className="text-sm font-medium">{report.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {DATA_SOURCES.find((d) => d.value === report.dataSource)?.label} &middot;{" "}
                    {report.columns.length} columns
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeReport({ id: report._id });
                    toast.success("Report deleted");
                  }}
                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
