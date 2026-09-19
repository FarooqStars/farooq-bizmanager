import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import { useState } from "react";
import { Wallet, Package, Settings2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const METHOD_LABELS: Record<string, string> = {
  fifo: "FIFO (First In, First Out)",
  lifo: "LIFO (Last In, First Out)",
  weighted_average: "Weighted Average",
};

export default function ValuationReportTab() {
  const { fmt } = useCurrency();
  const companyProfile = useQuery(api.companyProfile.get);
  const warehouseList = useQuery(api.products.listWarehouses);
  const classes = useQuery(api.inventoryValuation.listClasses);
  const updateGlobalMethod = useMutation(api.inventoryValuation.updateGlobalValuationMethod);

  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");

  const reportArgs: { warehouseId?: Id<"warehouses">; classId?: Id<"inventoryClasses"> } = {};
  if (warehouseFilter !== "all") {
    reportArgs.warehouseId = warehouseFilter as Id<"warehouses">;
  }
  if (classFilter !== "all") {
    reportArgs.classId = classFilter as Id<"inventoryClasses">;
  }

  const report = useQuery(api.inventoryValuation.getValuationReport, reportArgs);

  const handleMethodChange = async (method: string) => {
    try {
      await updateGlobalMethod({ method: method as "fifo" | "lifo" | "weighted_average" });
      toast.success("Global valuation method updated");
    } catch {
      toast.error("Failed to update method");
    }
  };

  if (!report) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global Settings */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Settings2 className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Global Valuation Method</p>
                <p className="text-xs text-muted-foreground">Default method for all products without a specific setting</p>
              </div>
            </div>
            <Select
              value={companyProfile?.inventoryValuationMethod ?? "weighted_average"}
              onValueChange={handleMethodChange}
            >
              <SelectTrigger className="w-[240px] cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
                <SelectItem value="lifo">LIFO (Last In, First Out)</SelectItem>
                <SelectItem value="weighted_average">Weighted Average</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger className="w-[200px] cursor-pointer"><SelectValue placeholder="All Warehouses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouseList?.map((w) => (
              <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[200px] cursor-pointer"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes?.filter((c) => c.isActive).map((c) => (
              <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{fmt(report.totalValue)}</p>
              <p className="text-xs text-muted-foreground">Total Inventory Value</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{report.items.length}</p>
              <p className="text-xs text-muted-foreground">Products with Stock</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Settings2 className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{METHOD_LABELS[report.globalMethod]?.split(" ")[0] ?? "WA"}</p>
              <p className="text-xs text-muted-foreground">Default Method</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Valuation Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Inventory Valuation Detail</CardTitle>
        </CardHeader>
        <CardContent>
          {report.items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No inventory items found with the selected filters</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2 px-2 font-medium">Product</th>
                    <th className="text-left py-2 px-2 font-medium">SKU</th>
                    <th className="text-left py-2 px-2 font-medium">Class</th>
                    <th className="text-center py-2 px-2 font-medium">Method</th>
                    <th className="text-right py-2 px-2 font-medium">Qty</th>
                    <th className="text-right py-2 px-2 font-medium">Unit Cost</th>
                    <th className="text-right py-2 px-2 font-medium">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((item) => (
                    <tr key={item.productId} className="border-b last:border-0">
                      <td className="py-2 px-2 font-medium">{item.productName}</td>
                      <td className="py-2 px-2 text-muted-foreground">{item.sku ?? "—"}</td>
                      <td className="py-2 px-2">
                        {item.className ? (
                          <Badge variant="secondary" className="text-[10px]">{item.className}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Badge variant="secondary" className="text-[10px] uppercase">{item.method.replace("_", " ")}</Badge>
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{item.quantity}</td>
                      <td className="py-2 px-2 text-right font-mono">{fmt(item.unitCost)}</td>
                      <td className="py-2 px-2 text-right font-mono font-semibold">{fmt(item.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td colSpan={6} className="py-2 px-2 text-right">Total:</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(report.totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
