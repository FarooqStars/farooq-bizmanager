import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { toast } from "sonner";
import { Plus, Percent, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function QuantityDiscountsTab() {
  const discounts = useQuery(api.pricing.listQuantityDiscounts, {});
  const products = useQuery(api.products.listProducts, { type: "product" });
  const categories = useQuery(api.products.listCategories, {});
  const [showCreate, setShowCreate] = useState(false);

  const deleteDiscount = useMutation(api.pricing.deleteQuantityDiscount);
  const updateDiscount = useMutation(api.pricing.updateQuantityDiscount);

  if (!discounts || !products || !categories) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const handleToggle = async (id: Id<"quantityDiscounts">, isActive: boolean) => {
    try {
      await updateDiscount({ discountId: id, isActive: !isActive });
      toast.success(isActive ? "Discount deactivated" : "Discount activated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const handleDelete = async (id: Id<"quantityDiscounts">) => {
    try {
      await deleteDiscount({ discountId: id });
      toast.success("Discount deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Add Discount Rule</Button>
          </DialogTrigger>
          <CreateDiscountDialog products={products} categories={categories} onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      {discounts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Percent /></EmptyMedia>
            <EmptyTitle>No volume discounts</EmptyTitle>
            <EmptyDescription>Create quantity-based discount rules like "Buy 10+ get 15% off"</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Add Discount Rule</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Applies To</th>
                <th className="text-left p-3 font-medium">Quantity Range</th>
                <th className="text-left p-3 font-medium">Discount</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {discounts.map((d) => (
                <tr key={d._id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{d.name}</td>
                  <td className="p-3">
                    {d.productName ?? d.categoryName ?? "All products"}
                  </td>
                  <td className="p-3">
                    {d.minQuantity}+ {d.maxQuantity ? `(max ${d.maxQuantity})` : ""}
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">
                      {d.discountType === "percentage" ? `${d.discountValue}% off` : `$${d.discountValue} off`}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={d.isActive ? "default" : "secondary"}
                      className="cursor-pointer"
                      onClick={() => handleToggle(d._id, d.isActive)}
                    >
                      {d.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleDelete(d._id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type ProductOption = { _id: Id<"products">; name: string };
type CategoryOption = { _id: Id<"categories">; name: string };

function CreateDiscountDialog({
  products,
  categories,
  onClose,
}: {
  products: ProductOption[];
  categories: CategoryOption[];
  onClose: () => void;
}) {
  const create = useMutation(api.pricing.createQuantityDiscount);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("all");
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");

  const handleSubmit = async () => {
    if (!name || !minQty || !discountValue) {
      toast.error("Name, min quantity, and discount value are required");
      return;
    }
    try {
      await create({
        name,
        productId: scope === "product" ? (productId as Id<"products">) : undefined,
        categoryId: scope === "category" ? (categoryId as Id<"categories">) : undefined,
        minQuantity: Number(minQty),
        maxQuantity: maxQty ? Number(maxQty) : undefined,
        discountType,
        discountValue: Number(discountValue),
      });
      toast.success("Discount rule created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Create Volume Discount</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Rule Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Buy 10+ get 15% off" />
        </div>
        <div className="space-y-1">
          <Label>Applies To</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              <SelectItem value="product">Specific Product</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {scope === "product" && (
          <div className="space-y-1">
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (<SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        )}
        {scope === "category" && (
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (<SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Min Quantity</Label>
            <Input type="number" min="1" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="e.g. 10" />
          </div>
          <div className="space-y-1">
            <Label>Max Quantity</Label>
            <Input type="number" min="1" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder="No limit" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Discount Type</Label>
            <Select value={discountType} onValueChange={(v) => setDiscountType(v as "percentage" | "fixed")}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Value</Label>
            <Input type="number" min="0" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === "percentage" ? "e.g. 15" : "e.g. 5.00"} />
          </div>
        </div>
        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Create Discount Rule</Button>
      </div>
    </DialogContent>
  );
}
