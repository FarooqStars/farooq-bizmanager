import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { toast } from "sonner";
import { Plus, List, Star, Users, Crown, Truck } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const tierIcons: Record<string, typeof Star> = {
  retail: Users,
  wholesale: Truck,
  vip: Crown,
  distributor: Star,
};

const tierLabels: Record<string, string> = {
  retail: "Retail",
  wholesale: "Wholesale",
  vip: "VIP",
  distributor: "Distributor",
};

export default function PriceListsTab() {
  const priceLists = useQuery(api.pricing.listPriceLists, {});
  const [showCreate, setShowCreate] = useState(false);
  const [selectedList, setSelectedList] = useState<Id<"priceLists"> | null>(null);

  if (!priceLists) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (selectedList) {
    return <PriceListDetail priceListId={selectedList} onBack={() => setSelectedList(null)} />;
  }

  if (priceLists.length === 0) {
    return (
      <div>
        <div className="flex justify-end mb-4">
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Create Price List</Button>
            </DialogTrigger>
            <CreatePriceListDialog onClose={() => setShowCreate(false)} />
          </Dialog>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><List /></EmptyMedia>
            <EmptyTitle>No price lists</EmptyTitle>
            <EmptyDescription>Create tier-based price lists for different customer groups (retail, wholesale, VIP)</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Create Price List</Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Create Price List</Button>
          </DialogTrigger>
          <CreatePriceListDialog onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {priceLists.map((pl) => {
          const TierIcon = pl.tier ? tierIcons[pl.tier] : List;
          return (
            <Card
              key={pl._id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedList(pl._id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <TierIcon className="w-5 h-5 text-primary" />
                    <CardTitle className="text-sm font-medium">{pl.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    {pl.isDefault && <Badge>Default</Badge>}
                    <Badge variant={pl.isActive ? "default" : "secondary"}>
                      {pl.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{pl.tier ? tierLabels[pl.tier] : "All customers"}</span>
                  <span>{pl.itemCount} product{pl.itemCount !== 1 ? "s" : ""}</span>
                </div>
                {pl.description && <p className="text-xs text-muted-foreground mt-1 truncate">{pl.description}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PriceListDetail({ priceListId, onBack }: { priceListId: Id<"priceLists">; onBack: () => void }) {
  const priceList = useQuery(api.pricing.getPriceList, { priceListId });
  const products = useQuery(api.products.listProducts, { type: "product" });
  const addItem = useMutation(api.pricing.addPriceListItem);
  const removeItem = useMutation(api.pricing.removePriceListItem);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productId, setProductId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [minQty, setMinQty] = useState("");

  if (!priceList || !products) return <Skeleton className="h-64 w-full" />;

  const existingProductIds = new Set(priceList.items.map((i) => i.productId));
  const availableProducts = products.filter((p) => !existingProductIds.has(p._id));

  const handleAddProduct = async () => {
    if (!productId || !unitPrice) { toast.error("Select product and set price"); return; }
    try {
      await addItem({
        priceListId,
        productId: productId as Id<"products">,
        unitPrice: Number(unitPrice),
        minQuantity: minQty ? Number(minQty) : undefined,
      });
      toast.success("Product added to price list");
      setShowAddProduct(false);
      setProductId("");
      setUnitPrice("");
      setMinQty("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    }
  };

  const handleRemove = async (itemId: Id<"priceListItems">) => {
    try {
      await removeItem({ itemId });
      toast.success("Removed from price list");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{priceList.name}</h3>
          <p className="text-sm text-muted-foreground">
            {priceList.tier ? `${tierLabels[priceList.tier]} tier` : "All customers"}
            {priceList.currency ? ` - ${priceList.currency}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="cursor-pointer" onClick={() => setShowAddProduct(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Product
          </Button>
          <Button variant="secondary" className="cursor-pointer" onClick={onBack}>Back</Button>
        </div>
      </div>

      {showAddProduct && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label>Product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((p) => (
                      <SelectItem key={p._id} value={p._id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32 space-y-1">
                <Label>Price</Label>
                <Input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div className="w-28 space-y-1">
                <Label>Min Qty</Label>
                <Input type="number" min="1" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="Any" />
              </div>
              <Button className="cursor-pointer" onClick={handleAddProduct}>Add</Button>
              <Button variant="secondary" className="cursor-pointer" onClick={() => setShowAddProduct(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {priceList.items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No products in this price list yet. Add products to set custom prices.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-left p-3 font-medium">SKU</th>
                <th className="text-right p-3 font-medium">Base Price</th>
                <th className="text-right p-3 font-medium">List Price</th>
                <th className="text-right p-3 font-medium">Discount</th>
                <th className="text-right p-3 font-medium">Min Qty</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {priceList.items.map((item) => {
                const discount = item.basePrice > 0
                  ? ((item.basePrice - item.unitPrice) / item.basePrice * 100).toFixed(1)
                  : "0";
                return (
                  <tr key={item._id} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">{item.productName}</td>
                    <td className="p-3 text-muted-foreground">{item.productSku || "—"}</td>
                    <td className="p-3 text-right">${item.basePrice.toFixed(2)}</td>
                    <td className="p-3 text-right font-medium">${item.unitPrice.toFixed(2)}</td>
                    <td className="p-3 text-right">
                      {Number(discount) > 0 && (
                        <Badge variant="secondary" className="text-green-700 dark:text-green-300">-{discount}%</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">{item.minQuantity ?? "Any"}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleRemove(item._id)}>
                        Remove
                      </Button>
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

function CreatePriceListDialog({ onClose }: { onClose: () => void }) {
  const createPriceList = useMutation(api.pricing.createPriceList);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState("");
  const [currency, setCurrency] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const handleSubmit = async () => {
    if (!name) { toast.error("Name is required"); return; }
    try {
      await createPriceList({
        name,
        description: description || undefined,
        tier: tier ? (tier as "retail" | "wholesale" | "vip" | "distributor") : undefined,
        currency: currency || undefined,
        isDefault,
      });
      toast.success("Price list created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Create Price List</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wholesale Pricing" />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Customer Tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="All tiers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="wholesale">Wholesale</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
                <SelectItem value="distributor">Distributor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Currency</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="e.g. QAR" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded" />
          <span className="text-sm">Set as default price list</span>
        </label>
        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Create Price List</Button>
      </div>
    </DialogContent>
  );
}
