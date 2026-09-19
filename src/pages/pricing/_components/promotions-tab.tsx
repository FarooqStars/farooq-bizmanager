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
import { Plus, Megaphone, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { format } from "date-fns";

export default function PromotionsTab() {
  const promotions = useQuery(api.pricing.listPromotions, {});
  const products = useQuery(api.products.listProducts, { type: "product" });
  const categories = useQuery(api.products.listCategories, {});
  const [showCreate, setShowCreate] = useState(false);

  const deletePromo = useMutation(api.pricing.deletePromotion);
  const updatePromo = useMutation(api.pricing.updatePromotion);

  if (!promotions || !products || !categories) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const handleToggle = async (id: Id<"promotions">, isActive: boolean) => {
    try {
      await updatePromo({ promotionId: id, isActive: !isActive });
      toast.success(isActive ? "Promotion deactivated" : "Promotion activated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const handleDelete = async (id: Id<"promotions">) => {
    try {
      await deletePromo({ promotionId: id });
      toast.success("Promotion deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const timeStatusColors: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    expired: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Create Promotion</Button>
          </DialogTrigger>
          <CreatePromotionDialog products={products} categories={categories} onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      {promotions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Megaphone /></EmptyMedia>
            <EmptyTitle>No promotions</EmptyTitle>
            <EmptyDescription>Create time-limited promotions with percentage, fixed, or buy-X-get-Y discounts</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Create Promotion</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Discount</th>
                <th className="text-left p-3 font-medium">Applies To</th>
                <th className="text-left p-3 font-medium">Tier</th>
                <th className="text-left p-3 font-medium">Period</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {promotions.map((p) => (
                <tr key={p._id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 capitalize">
                    {p.discountType === "buy_x_get_y" ? "Buy X Get Y" : p.discountType}
                  </td>
                  <td className="p-3">
                    {p.discountType === "percentage" && `${p.discountValue}% off`}
                    {p.discountType === "fixed" && `$${p.discountValue} off`}
                    {p.discountType === "buy_x_get_y" && `Buy ${p.buyQuantity} Get ${p.getQuantity}`}
                  </td>
                  <td className="p-3">{p.productName ?? p.categoryName ?? "All"}</td>
                  <td className="p-3 capitalize">{p.tier ?? "All"}</td>
                  <td className="p-3 text-xs">
                    {format(new Date(p.startDate), "MMM dd")} - {format(new Date(p.endDate), "MMM dd, yyyy")}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Badge className={timeStatusColors[p.timeStatus]}>
                        {p.timeStatus.charAt(0).toUpperCase() + p.timeStatus.slice(1)}
                      </Badge>
                      <Badge
                        variant={p.isActive ? "default" : "secondary"}
                        className="cursor-pointer"
                        onClick={() => handleToggle(p._id, p.isActive)}
                      >
                        {p.isActive ? "On" : "Off"}
                      </Badge>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleDelete(p._id)}>
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

function CreatePromotionDialog({
  products,
  categories,
  onClose,
}: {
  products: ProductOption[];
  categories: CategoryOption[];
  onClose: () => void;
}) {
  const create = useMutation(api.pricing.createPromotion);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed" | "buy_x_get_y">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [buyQty, setBuyQty] = useState("");
  const [getQty, setGetQty] = useState("");
  const [scope, setScope] = useState("all");
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tier, setTier] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleSubmit = async () => {
    if (!name || !startDate || !endDate) {
      toast.error("Name and date range are required");
      return;
    }
    if (discountType !== "buy_x_get_y" && !discountValue) {
      toast.error("Discount value is required");
      return;
    }
    try {
      await create({
        name,
        description: description || undefined,
        discountType,
        discountValue: Number(discountValue || "0"),
        buyQuantity: buyQty ? Number(buyQty) : undefined,
        getQuantity: getQty ? Number(getQty) : undefined,
        productId: scope === "product" ? (productId as Id<"products">) : undefined,
        categoryId: scope === "category" ? (categoryId as Id<"categories">) : undefined,
        tier: tier ? (tier as "retail" | "wholesale" | "vip" | "distributor") : undefined,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      });
      toast.success("Promotion created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    }
  };

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Create Promotion</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Promotion Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Sale 20% Off" />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Discount Type</Label>
            <Select value={discountType} onValueChange={(v) => setDiscountType(v as "percentage" | "fixed" | "buy_x_get_y")}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                <SelectItem value="buy_x_get_y">Buy X Get Y</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {discountType !== "buy_x_get_y" ? (
            <div className="space-y-1">
              <Label>Value</Label>
              <Input type="number" min="0" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === "percentage" ? "e.g. 20" : "e.g. 10.00"} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Buy</Label>
                <Input type="number" min="1" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} placeholder="3" />
              </div>
              <div className="space-y-1">
                <Label>Get</Label>
                <Input type="number" min="1" value={getQty} onChange={(e) => setGetQty(e.target.value)} placeholder="1" />
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
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
          <div className="space-y-1">
            <Label>Customer Tier</Label>
            <Select value={tier || "all_tiers"} onValueChange={(v) => setTier(v === "all_tiers" ? "" : v)}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all_tiers">All Tiers</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="wholesale">Wholesale</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
                <SelectItem value="distributor">Distributor</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            <Label>Start Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>End Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Create Promotion</Button>
      </div>
    </DialogContent>
  );
}
