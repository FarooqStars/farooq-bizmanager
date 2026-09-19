import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Warehouse } from "lucide-react";

type ProductWithCategory = {
  _id: Id<"products">;
  name: string;
  sku?: string;
  barcode?: string;
  description?: string;
  categoryId?: Id<"categories">;
  type: "product" | "service";
  unitPrice: number;
  costPrice?: number;
  unit?: string;
  unitGroupId?: Id<"unitGroups">;
  purchaseUnit?: string;
  sellingUnit?: string;
  lowStockThreshold?: number;
  reorderPoint?: number;
  preferredVendorId?: Id<"vendors">;
  incomeAccountId?: Id<"accounts">;
  expenseAccountId?: Id<"accounts">;
  assetAccountId?: Id<"accounts">;
  openingStock?: number;
  openingStockValue?: number;
  openingStockDate?: string;
  openingStockWarehouseId?: Id<"warehouses">;
  isActive: boolean;
  category?: { name: string } | null;
};

export default function ProductDialogEnhanced({
  product,
  defaultType,
  onClose,
}: {
  product?: ProductWithCategory;
  defaultType: "product" | "service";
  onClose: () => void;
}) {
  const categories = useQuery(api.products.listCategories);
  const vendors = useQuery(api.vendors.listVendors);
  const accounts = useQuery(api.accounting.listAccounts, {});
  const warehouses = useQuery(api.products.listWarehouses);
  const unitGroups = useQuery(api.unitMeasures.listGroups, {});
  const createProduct = useMutation(api.products.createProduct);
  const updateProduct = useMutation(api.products.updateProduct);
  const createCategory = useMutation(api.products.createCategory);

  // Inventory per warehouse (for existing products)
  const inventoryData = useQuery(
    api.products.getInventoryByProduct,
    product ? { productId: product._id } : "skip"
  );

  const type = product?.type ?? defaultType;

  // Basic tab
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState<string>(product?.categoryId ?? "none");
  const [unitPrice, setUnitPrice] = useState(product?.unitPrice !== undefined ? String(product.unitPrice) : "");
  const [costPrice, setCostPrice] = useState(product?.costPrice !== undefined ? String(product.costPrice) : "");
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [unitGroupId, setUnitGroupId] = useState<string>(product?.unitGroupId ?? "none");
  const [purchaseUnit, setPurchaseUnit] = useState(product?.purchaseUnit ?? "");
  const [sellingUnit, setSellingUnit] = useState(product?.sellingUnit ?? "");

  // Inventory tab
  const [lowStockThreshold, setLowStockThreshold] = useState(
    product?.lowStockThreshold !== undefined ? String(product.lowStockThreshold) : ""
  );
  const [reorderPoint, setReorderPoint] = useState(
    product?.reorderPoint !== undefined ? String(product.reorderPoint) : ""
  );
  const [preferredVendorId, setPreferredVendorId] = useState<string>(product?.preferredVendorId ?? "none");

  // Accounts tab
  const [incomeAccountId, setIncomeAccountId] = useState<string>(product?.incomeAccountId ?? "none");
  const [expenseAccountId, setExpenseAccountId] = useState<string>(product?.expenseAccountId ?? "none");
  const [assetAccountId, setAssetAccountId] = useState<string>(product?.assetAccountId ?? "none");

  // Opening Stock tab
  const [openingStock, setOpeningStock] = useState(product?.openingStock !== undefined ? String(product.openingStock) : "");
  const [openingStockValue, setOpeningStockValue] = useState(product?.openingStockValue !== undefined ? String(product.openingStockValue) : "");
  const [openingStockDate, setOpeningStockDate] = useState(product?.openingStockDate ?? "");
  const [openingStockWarehouseId, setOpeningStockWarehouseId] = useState<string>(product?.openingStockWarehouseId ?? "none");

  // Category management
  const [newCatName, setNewCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredCats = categories?.filter((c) => c.type === type || c.type === "both") ?? [];
  const incomeAccounts = accounts?.filter((a) => a.type === "revenue") ?? [];
  const expenseAccounts = accounts?.filter((a) => a.type === "expense") ?? [];
  const assetAccounts = accounts?.filter((a) => a.type === "asset") ?? [];

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await createCategory({ name: newCatName.trim(), type });
      setNewCatName("");
      setShowNewCat(false);
      toast.success("Category added");
    } catch {
      toast.error("Failed to add category");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const price = parseFloat(unitPrice);
    if (isNaN(price) || price < 0) { toast.error("Enter a valid price"); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        description: description.trim() || undefined,
        categoryId: categoryId !== "none" ? (categoryId as Id<"categories">) : undefined,
        unitPrice: price,
        costPrice: costPrice ? Number(costPrice) : undefined,
        unit: unit.trim() || undefined,
        unitGroupId: unitGroupId !== "none" ? (unitGroupId as Id<"unitGroups">) : undefined,
        purchaseUnit: purchaseUnit.trim() || undefined,
        sellingUnit: sellingUnit.trim() || undefined,
        lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : undefined,
        reorderPoint: reorderPoint ? Number(reorderPoint) : undefined,
        preferredVendorId: preferredVendorId !== "none" ? preferredVendorId as Id<"vendors"> : undefined,
        incomeAccountId: incomeAccountId !== "none" ? incomeAccountId as Id<"accounts"> : undefined,
        expenseAccountId: expenseAccountId !== "none" ? expenseAccountId as Id<"accounts"> : undefined,
        assetAccountId: assetAccountId !== "none" ? assetAccountId as Id<"accounts"> : undefined,
        openingStock: openingStock ? Number(openingStock) : undefined,
        openingStockValue: openingStockValue ? Number(openingStockValue) : undefined,
        openingStockDate: openingStockDate || undefined,
        openingStockWarehouseId: openingStockWarehouseId !== "none" ? openingStockWarehouseId as Id<"warehouses"> : undefined,
      };
      if (product) {
        await updateProduct({ productId: product._id, ...data });
        toast.success("Updated successfully");
      } else {
        await createProduct({ ...data, type });
        toast.success("Created successfully");
      }
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{product ? "Edit" : "Add"} {type === "product" ? "Product" : "Service"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="basic" className="text-xs cursor-pointer">Details</TabsTrigger>
            {type === "product" && (
              <TabsTrigger value="inventory" className="text-xs cursor-pointer">Inventory</TabsTrigger>
            )}
            <TabsTrigger value="accounts" className="text-xs cursor-pointer">Accounts</TabsTrigger>
            {type === "product" && (
              <TabsTrigger value="opening" className="text-xs cursor-pointer">Opening Stock</TabsTrigger>
            )}
            {type === "product" && product && (
              <TabsTrigger value="availability" className="text-xs cursor-pointer">Availability</TabsTrigger>
            )}
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-1">
            {/* Basic Details */}
            <TabsContent value="basic" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
                </div>
                {type === "product" && (
                  <>
                    <div className="space-y-2">
                      <Label>SKU</Label>
                      <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" />
                    </div>
                    <div className="space-y-2">
                      <Label>Barcode</Label>
                      <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode / UPC" />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>Selling Price *</Label>
                  <Input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>Cost Price</Label>
                  <Input type="number" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={type === "product" ? "kg, box, pc" : "hr, session"} />
                </div>
              </div>

              {/* Unit of Measure Group */}
              {type === "product" && (
                <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                  <p className="text-sm font-medium">Units of Measure</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Unit Group</Label>
                      <Select value={unitGroupId} onValueChange={(v) => {
                        setUnitGroupId(v);
                        if (v !== "none") {
                          const grp = unitGroups?.find((g) => g._id === v);
                          if (grp) {
                            if (!sellingUnit) setSellingUnit(grp.baseUnit);
                            if (!purchaseUnit) setPurchaseUnit(grp.baseUnit);
                          }
                        }
                      }}>
                        <SelectTrigger className="cursor-pointer text-xs"><SelectValue placeholder="Select group" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {(unitGroups ?? []).filter((g) => g.isActive).map((g) => (
                            <SelectItem key={g._id} value={g._id}>{g.name} ({g.baseUnit})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Selling Unit</Label>
                      {unitGroupId !== "none" ? (
                        <Select value={sellingUnit} onValueChange={setSellingUnit}>
                          <SelectTrigger className="cursor-pointer text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {(unitGroups?.find((g) => g._id === unitGroupId)?.units ?? []).map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={sellingUnit} onChange={(e) => setSellingUnit(e.target.value)} placeholder="pc" className="text-xs" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Purchase Unit</Label>
                      {unitGroupId !== "none" ? (
                        <Select value={purchaseUnit} onValueChange={setPurchaseUnit}>
                          <SelectTrigger className="cursor-pointer text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {(unitGroups?.find((g) => g._id === unitGroupId)?.units ?? []).map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} placeholder="box" className="text-xs" />
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Set different units for selling (invoices) vs purchasing (POs). Conversions are auto-calculated from the unit group.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Category</Label>
                  <button className="text-xs text-primary underline cursor-pointer" onClick={() => setShowNewCat((v) => !v)}>
                    {showNewCat ? "Cancel" : "+ New Category"}
                  </button>
                </div>
                {showNewCat ? (
                  <div className="flex gap-2">
                    <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" />
                    <Button size="sm" onClick={handleAddCategory} className="cursor-pointer">Add</Button>
                  </div>
                ) : (
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {filteredCats.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
            </TabsContent>

            {/* Inventory Settings */}
            {type === "product" && (
              <TabsContent value="inventory" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Low Stock Alert</Label>
                    <Input type="number" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} placeholder="e.g. 10" />
                    <p className="text-xs text-muted-foreground">Alert when stock falls below this level</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Reorder Point</Label>
                    <Input type="number" min="0" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} placeholder="e.g. 20" />
                    <p className="text-xs text-muted-foreground">Quantity at which to reorder</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Preferred Vendor</Label>
                  <Select value={preferredVendorId} onValueChange={setPreferredVendorId}>
                    <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {vendors?.filter((v) => v.isActive).map((v) => (
                        <SelectItem key={v._id} value={v._id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Default vendor for purchase orders</p>
                </div>
              </TabsContent>
            )}

            {/* Linked Accounts */}
            <TabsContent value="accounts" className="mt-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                Link this item to specific chart of accounts for accurate financial reporting.
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Income Account</Label>
                  <Select value={incomeAccountId} onValueChange={setIncomeAccountId}>
                    <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select income account" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      {incomeAccounts.map((a) => (
                        <SelectItem key={a._id} value={a._id}>{a.code} - {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Account to credit when this item is sold</p>
                </div>
                <div className="space-y-2">
                  <Label>Expense / COGS Account</Label>
                  <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                    <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select expense account" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      {expenseAccounts.map((a) => (
                        <SelectItem key={a._id} value={a._id}>{a.code} - {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Cost of Goods Sold account</p>
                </div>
                {type === "product" && (
                  <div className="space-y-2">
                    <Label>Inventory Asset Account</Label>
                    <Select value={assetAccountId} onValueChange={setAssetAccountId}>
                      <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select asset account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Default</SelectItem>
                        {assetAccounts.map((a) => (
                          <SelectItem key={a._id} value={a._id}>{a.code} - {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Asset account tracking inventory value</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Opening Stock */}
            {type === "product" && (
              <TabsContent value="opening" className="mt-0 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Set opening stock quantity and value if migrating from another system.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Opening Quantity</Label>
                    <Input type="number" min="0" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Value</Label>
                    <Input type="number" min="0" step="0.01" value={openingStockValue} onChange={(e) => setOpeningStockValue(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>As of Date</Label>
                    <Input type="date" value={openingStockDate} onChange={(e) => setOpeningStockDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Warehouse</Label>
                    <Select value={openingStockWarehouseId} onValueChange={setOpeningStockWarehouseId}>
                      <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Default warehouse</SelectItem>
                        {warehouses?.filter((w: { isActive: boolean; _id: string; name: string }) => w.isActive).map((w: { _id: string; name: string }) => (
                          <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            )}

            {/* Stock Availability per Warehouse */}
            {type === "product" && product && (
              <TabsContent value="availability" className="mt-0 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Current stock levels across all warehouses / stores.
                </p>
                {!inventoryData && <p className="text-sm text-muted-foreground">Loading...</p>}
                {inventoryData && inventoryData.length === 0 && (
                  <p className="text-sm text-muted-foreground">No stock recorded in any warehouse.</p>
                )}
                {inventoryData && inventoryData.length > 0 && (
                  <div className="space-y-2">
                    {inventoryData.map((inv) => (
                      <div key={inv._id} className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-2">
                          <Warehouse className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{inv.warehouseName}</span>
                        </div>
                        <Badge variant={inv.quantity > 0 ? "default" : "secondary"} className="text-sm">
                          {inv.quantity} {unit || "units"}
                        </Badge>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-3 border-t-2 font-semibold">
                      <span className="text-sm">Total Available</span>
                      <span className="text-sm">
                        {inventoryData.reduce((sum, inv) => sum + inv.quantity, 0)} {unit || "units"}
                      </span>
                    </div>
                  </div>
                )}
              </TabsContent>
            )}
          </div>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
