import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { toast } from "sonner";
import { Plus, Calendar, CheckCircle, XCircle } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { format } from "date-fns";

export default function ScheduledChangesTab() {
  const changes = useQuery(api.pricing.listScheduledChanges, {});
  const products = useQuery(api.products.listProducts, { type: "product" });
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const applyChange = useMutation(api.pricing.applyScheduledChange);
  const cancelChange = useMutation(api.pricing.cancelScheduledChange);

  if (!changes || !products) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const filteredChanges = statusFilter === "all"
    ? changes
    : changes.filter((c) => c.status === statusFilter);

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    applied: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const handleApply = async (changeId: Id<"scheduledPriceChanges">) => {
    try {
      await applyChange({ changeId });
      toast.success("Price change applied - product price updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply");
    }
  };

  const handleCancel = async (changeId: Id<"scheduledPriceChanges">) => {
    try {
      await cancelChange({ changeId });
      toast.success("Price change cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          {["all", "pending", "applied", "cancelled"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "secondary"}
              className="cursor-pointer capitalize"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Schedule Change</Button>
          </DialogTrigger>
          <CreateScheduledChangeDialog products={products} onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      {filteredChanges.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Calendar /></EmptyMedia>
            <EmptyTitle>No scheduled price changes</EmptyTitle>
            <EmptyDescription>Schedule future price changes with effective dates and apply them when ready</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Schedule Change</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-right p-3 font-medium">Current Price</th>
                <th className="text-right p-3 font-medium">New Price</th>
                <th className="text-right p-3 font-medium">Change</th>
                <th className="text-left p-3 font-medium">Effective Date</th>
                <th className="text-left p-3 font-medium">Reason</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredChanges.map((c) => {
                const diff = c.newPrice - c.currentPrice;
                const diffPct = c.currentPrice > 0 ? (diff / c.currentPrice * 100).toFixed(1) : "0";
                return (
                  <tr key={c._id} className="hover:bg-muted/30">
                    <td className="p-3">
                      <span className="font-medium">{c.productName}</span>
                      {c.productSku && <span className="text-xs text-muted-foreground ml-1">({c.productSku})</span>}
                    </td>
                    <td className="p-3 text-right">${c.currentPrice.toFixed(2)}</td>
                    <td className="p-3 text-right font-medium">${c.newPrice.toFixed(2)}</td>
                    <td className="p-3 text-right">
                      <span className={diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : ""}>
                        {diff > 0 ? "+" : ""}{diffPct}%
                      </span>
                    </td>
                    <td className="p-3 text-xs">{format(new Date(c.effectiveDate), "MMM dd, yyyy")}</td>
                    <td className="p-3 text-xs text-muted-foreground truncate max-w-[150px]">{c.reason || "—"}</td>
                    <td className="p-3">
                      <Badge className={statusColors[c.status]}>
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      {c.status === "pending" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => handleApply(c._id)}>
                            <CheckCircle className="w-3 h-3 mr-1" /> Apply
                          </Button>
                          <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleCancel(c._id)}>
                            <XCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type ProductOption = { _id: Id<"products">; name: string; unitPrice: number };

function CreateScheduledChangeDialog({ products, onClose }: { products: ProductOption[]; onClose: () => void }) {
  const create = useMutation(api.pricing.createScheduledChange);
  const [productId, setProductId] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reason, setReason] = useState("");

  const selectedProduct = products.find((p) => p._id === productId);

  const handleSubmit = async () => {
    if (!productId || !newPrice || !effectiveDate) {
      toast.error("Product, new price, and effective date are required");
      return;
    }
    try {
      await create({
        productId: productId as Id<"products">,
        newPrice: Number(newPrice),
        effectiveDate: new Date(effectiveDate).toISOString(),
        reason: reason || undefined,
      });
      toast.success("Price change scheduled");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule");
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Schedule Price Change</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Product</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select product" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p._id} value={p._id}>{p.name} (${p.unitPrice.toFixed(2)})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProduct && (
            <p className="text-xs text-muted-foreground">Current price: ${selectedProduct.unitPrice.toFixed(2)}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>New Price</Label>
            <Input type="number" min="0" step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label>Effective Date</Label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional - e.g. Supplier price increase" rows={2} />
        </div>
        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Schedule Change</Button>
      </div>
    </DialogContent>
  );
}
