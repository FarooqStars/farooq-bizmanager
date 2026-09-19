import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Warehouse,
  Users,
  Package,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";

export default function ReportTab() {
  const { t } = useTranslation();
  const report = useQuery(api.branches.getBranchReport, {});

  if (report === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (report.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
          <EmptyTitle>{t("branches.report.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("branches.report.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Totals
  const totalWarehouses = report.reduce((sum, b) => sum + b.warehouseCount, 0);
  const totalEmployees = report.reduce((sum, b) => sum + b.employeeCount, 0);
  const totalStock = report.reduce((sum, b) => sum + b.totalStock, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{report.length}</p>
              <p className="text-xs text-muted-foreground">{t("branches.report.activeBranches")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Warehouse className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalWarehouses}</p>
              <p className="text-xs text-muted-foreground">{t("branches.report.totalWarehouses")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Users className="size-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalEmployees}</p>
              <p className="text-xs text-muted-foreground">{t("branches.report.totalEmployees")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Package className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalStock.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{t("branches.report.totalStock")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branch breakdown */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{t("branches.report.branch")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("branches.report.location")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("branches.warehouses")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("branches.employees")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("branches.report.stock")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.map((branch) => (
              <tr key={branch._id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{branch.name}</span>
                    <span className="text-xs text-muted-foreground">({branch.code})</span>
                    {branch.isHeadquarters && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        HQ
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[branch.city, branch.country].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-center">{branch.warehouseCount}</td>
                <td className="px-4 py-3 text-center">{branch.employeeCount}</td>
                <td className="px-4 py-3 text-center font-medium">{branch.totalStock.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
