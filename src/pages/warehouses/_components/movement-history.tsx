import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { ArrowDownCircle, ArrowUpCircle, History } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function MovementHistory({ warehouseId }: { warehouseId: Id<"warehouses"> }) {
  const movements = useQuery(api.stockMovements.listMovements, { warehouseId, limit: 50 });

  if (movements === undefined) return <Skeleton className="h-40 w-full" />;

  if (movements.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><History /></EmptyMedia>
          <EmptyTitle>No movement history</EmptyTitle>
          <EmptyDescription>Stock movements for this warehouse will appear here</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Last 50 stock movements</p>
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Product</th>
                <th className="text-right px-3 py-2 font-medium">Qty</th>
                <th className="text-left px-3 py-2 font-medium">Reason</th>
                <th className="text-left px-3 py-2 font-medium">Reference</th>
                <th className="text-left px-3 py-2 font-medium">By</th>
                <th className="text-left px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.map((m) => (
                <tr key={m._id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    {m.type === "in" ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <ArrowDownCircle className="w-3.5 h-3.5" />IN
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-600">
                        <ArrowUpCircle className="w-3.5 h-3.5" />OUT
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium truncate max-w-[150px]">{m.productName}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={m.type === "in" ? "text-green-600" : "text-red-600"}>
                      {m.type === "in" ? "+" : "-"}{m.quantity}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="text-xs capitalize">{m.reason}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[120px]">
                    {m.reference || "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[100px]">{m.userName}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(m.timestamp).toLocaleDateString()}{" "}
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
