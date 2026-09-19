import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Package, Search } from "lucide-react";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function WarehouseStockView({ warehouseId }: { warehouseId: Id<"warehouses"> }) {
  const stockData = useQuery(api.warehouseBins.getWarehouseStock, { warehouseId });
  const [search, setSearch] = useState("");

  if (!stockData) return <Skeleton className="h-40 w-full" />;

  const { stockItems } = stockData;

  const filtered = stockItems.filter((item) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return item.productName.toLowerCase().includes(s) || item.sku.toLowerCase().includes(s);
  });

  if (stockItems.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Package /></EmptyMedia>
          <EmptyTitle>No stock in this warehouse</EmptyTitle>
          <EmptyDescription>Record stock movements to see inventory levels here</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <Badge variant="secondary">{filtered.length} products</Badge>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Product</th>
                <th className="text-left px-3 py-2 font-medium">SKU</th>
                <th className="text-right px-3 py-2 font-medium">Quantity</th>
                <th className="text-left px-3 py-2 font-medium">Bin Locations</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((item) => (
                <tr key={item.productId} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{item.productName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.sku || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-semibold ${item.totalQty <= 0 ? "text-destructive" : ""}`}>
                      {item.totalQty.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {item.binLocations.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.binLocations.map((loc, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {loc!.label}: {loc!.qty}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">No bin assigned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground border-t">
          Total: {filtered.reduce((sum, i) => sum + i.totalQty, 0).toLocaleString()} units across {filtered.length} products
        </div>
      </div>
    </div>
  );
}
