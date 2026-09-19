import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { toast } from "sonner";
import { Plus, Users, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function CustomerPricingTab() {
  const customers = useQuery(api.sales.listCustomers);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("none");
  const [showAdd, setShowAdd] = useState(false);

  if (!customers) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium whitespace-nowrap">Customer:</Label>
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger className="w-[250px] cursor-pointer">
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select a customer...</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name} {c.tier ? `(${c.tier})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedCustomerId !== "none" && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Set Price</Button>
            </DialogTrigger>
            <AddCustomerPriceDialog
              customerId={selectedCustomerId as Id<"customers">}
              onClose={() => setShowAdd(false)}
            />
          </Dialog>
        )}
      </div>

      {selectedCustomerId === "none" ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>Select a customer</EmptyTitle>
            <EmptyDescription>Choose a customer above to view and manage their special pricing</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <CustomerPriceList customerId={selectedCustomerId as Id<"customers">} />
      )}
    </div>
  );
}

function CustomerPriceList({ customerId }: { customerId: Id<"customers"> }) {
  const prices = useQuery(api.pricing.listCustomerPrices, { customerId });
  const removePrice = useMutation(api.pricing.removeCustomerPrice);

  if (!prices) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (prices.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No custom prices set for this customer. Click "Set Price" to add product-specific pricing.
        </CardContent>
      </Card>
    );
  }

  const handleRemove = async (id: Id<"customerPrices">) => {
    try {
      await removePrice({ id });
      toast.success("Custom price removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3 font-medium">Product</th>
            <th className="text-left p-3 font-medium">SKU</th>
            <th className="text-right p-3 font-medium">Base Price</th>
            <th className="text-right p-3 font-medium">Customer Price</th>
            <th className="text-right p-3 font-medium">Savings</th>
            <th className="text-right p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {prices.map((p) => {
            const savings = p.basePrice - p.price;
            const savingsPercent = p.basePrice > 0 ? ((savings / p.basePrice) * 100).toFixed(1) : "0";
            return (
              <tr key={p._id} className="hover:bg-muted/30">
                <td className="p-3 font-medium">{p.productName}</td>
                <td className="p-3 text-muted-foreground">{p.productSku || "—"}</td>
                <td className="p-3 text-right">${p.basePrice.toFixed(2)}</td>
                <td className="p-3 text-right font-medium">${p.price.toFixed(2)}</td>
                <td className="p-3 text-right">
                  {savings > 0 ? (
                    <Badge variant="secondary" className="text-green-700 dark:text-green-300">-{savingsPercent}%</Badge>
                  ) : savings < 0 ? (
                    <Badge variant="secondary" className="text-red-700 dark:text-red-300">+{Math.abs(Number(savingsPercent))}%</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleRemove(p._id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AddCustomerPriceDialog({ customerId, onClose }: { customerId: Id<"customers">; onClose: () => void }) {
  const products = useQuery(api.products.listProducts, {});
  const setPrice = useMutation(api.pricing.setCustomerPrice);
  const [productId, setProductId] = useState("");
  const [price, setPrice2] = useState("");

  const selectedProduct = products?.find((p) => p._id === productId);

  const handleSubmit = async () => {
    if (!productId || !price) {
      toast.error("Select a product and enter a price");
      return;
    }
    try {
      await setPrice({
        customerId,
        productId: productId as Id<"products">,
        price: Number(price),
      });
      toast.success("Customer price set");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set price");
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Set Customer-Specific Price</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Product</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select product" /></SelectTrigger>
            <SelectContent>
              {(products ?? []).filter((p) => p.isActive).map((p) => (
                <SelectItem key={p._id} value={p._id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""} — ${p.unitPrice.toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProduct && (
            <p className="text-xs text-muted-foreground">Base price: ${selectedProduct.unitPrice.toFixed(2)}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Customer Price</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice2(e.target.value)}
            placeholder="0.00"
          />
          {selectedProduct && price && Number(price) < selectedProduct.unitPrice && (
            <p className="text-xs text-green-600">
              {((1 - Number(price) / selectedProduct.unitPrice) * 100).toFixed(1)}% discount from base price
            </p>
          )}
        </div>
        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Set Price</Button>
      </div>
    </DialogContent>
  );
}
