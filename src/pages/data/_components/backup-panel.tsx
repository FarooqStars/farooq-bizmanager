import { useState } from "react";
import { useQuery, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { HardDrive, Download, Loader2, Database, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type TableName =
  | "products"
  | "customers"
  | "vendors"
  | "sales"
  | "saleItems"
  | "expenses"
  | "expenseCategories"
  | "invoices"
  | "invoiceItems"
  | "bills"
  | "employees"
  | "categories"
  | "warehouses"
  | "inventory"
  | "journalEntries"
  | "journalLines"
  | "accounts"
  | "payments"
  | "customFields"
  | "customFieldValues";

const ALL_TABLES: TableName[] = [
  "products",
  "customers",
  "vendors",
  "sales",
  "saleItems",
  "expenses",
  "expenseCategories",
  "invoices",
  "invoiceItems",
  "bills",
  "employees",
  "categories",
  "warehouses",
  "inventory",
  "journalEntries",
  "journalLines",
  "accounts",
  "payments",
  "customFields",
  "customFieldValues",
];

export default function BackupPanel() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const tableCounts = useQuery(api.backup.getTableCounts);
  const convex = useConvex();

  const totalRecords = tableCounts?.reduce((sum, t) => sum + t.count, 0) ?? 0;

  const handleFullBackup = async () => {
    setExporting(true);
    setProgress(0);

    try {
      const backup: Record<string, Record<string, unknown>[]> = {};
      let completed = 0;

      for (const table of ALL_TABLES) {
        const result = await convex.query(api.backup.exportTable, { tableName: table });
        if (result.data.length > 0) {
          backup[table] = result.data;
        }
        completed++;
        setProgress(Math.round((completed / ALL_TABLES.length) * 100));
      }

      // Generate JSON file
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bizmanager-backup-${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Full backup downloaded successfully");
    } catch (err) {
      toast.error("Backup failed. Please try again.");
      console.error(err);
    } finally {
      setExporting(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="w-5 h-5" /> Full Data Backup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export all your business data as a single JSON file. This includes products, customers, vendors,
            sales, invoices, expenses, employees, inventory, journal entries, and custom fields.
          </p>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                <strong>{tableCounts?.length ?? "..."}</strong> tables
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{totalRecords.toLocaleString()} total records</Badge>
            </div>
          </div>

          {/* Table breakdown */}
          {!tableCounts && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          )}
          {tableCounts && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {tableCounts
                .filter((t) => t.count > 0)
                .map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center justify-between px-2 py-1 border rounded text-xs"
                  >
                    <span className="truncate">{t.name}</span>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {t.count}
                    </Badge>
                  </div>
                ))}
            </div>
          )}

          {exporting && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Exporting... {progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleFullBackup}
            disabled={exporting || totalRecords === 0}
            className="cursor-pointer"
          >
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "Exporting..." : "Download Full Backup (JSON)"}
          </Button>

          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Backups are for archiving purposes. To restore data, use the CSV Import tab 
              or contact your system administrator. The JSON backup contains all document IDs for reference.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
