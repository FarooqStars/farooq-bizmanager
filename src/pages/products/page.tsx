import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import ProductDialogEnhanced from "./_components/product-dialog-enhanced.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  Package, Wrench, Plus, Pencil, Trash2, AlertTriangle, Boxes, QrCode, Printer, ImageIcon, ScanLine
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { useCurrency } from "@/hooks/use-currency.ts";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { BarcodeModal, BatchBarcodeModal, ScannerModal } from "./_components/barcode-modal.tsx";
import { ProductDetailDialog } from "./_components/product-images.tsx";
import { useFocusItem, focusElementId, FOCUS_RING_CLASS } from "@/hooks/use-focus-item.ts";

type ProductWithCategory = Doc<"products"> & { category: Doc<"categories"> | null };

// ── Inventory modal ──────────────────────────────────────────────────────────

function InventoryModal({
  product,
  onClose,
}: {
  product: Doc<"products">;
  onClose: () => void;
}) {
  const inventory = useQuery(api.products.getInventoryForProduct, { productId: product._id });
  const warehouses = useQuery(api.products.listWarehouses);
  const setInventory = useMutation(api.products.setInventoryLevel);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const getQty = (wId: string) => {
    if (quantities[wId] !== undefined) return quantities[wId];
    const row = inventory?.find((r) => r.warehouseId === wId);
    return row ? String(row.quantity) : "0";
  };

  const handleSave = async (warehouseId: Id<"warehouses">) => {
    const qty = parseFloat(getQty(warehouseId));
    if (isNaN(qty) || qty < 0) { toast.error("Enter a valid quantity"); return; }
    setSaving(warehouseId);
    try {
      await setInventory({ productId: product._id, warehouseId, quantity: qty });
      toast.success("Stock updated");
    } catch {
      toast.error("Failed to update stock");
    } finally {
      setSaving(null);
    }
  };

  const activeWarehouses = warehouses?.filter((w) => w.isActive) ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Boxes className="w-4 h-4" />Stock Levels — {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {inventory === undefined || warehouses === undefined ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : activeWarehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No warehouses found. Add a warehouse first.</p>
          ) : (
            activeWarehouses.map((w) => (
              <div key={w._id} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{w.name}</p>
                  {w.address && <p className="text-xs text-muted-foreground">{w.address}</p>}
                </div>
                <Input
                  type="number"
                  min="0"
                  className="w-24 text-center"
                  value={getQty(w._id)}
                  onChange={(e) => setQuantities((prev) => ({ ...prev, [w._id]: e.target.value }))}
                />
                <span className="text-xs text-muted-foreground w-8">{product.unit ?? "units"}</span>
                <Button size="sm" onClick={() => handleSave(w._id)} disabled={saving === w._id}>
                  {saving === w._id ? "..." : "Set"}
                </Button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  canManage,
  onEdit,
  onStock,
  onDelete,
  onBarcode,
  onImages,
  focused,
}: {
  product: ProductWithCategory;
  canManage: boolean;
  onEdit: () => void;
  onStock: () => void;
  onDelete: () => void;
  onBarcode: () => void;
  onImages: () => void;
  focused: boolean;
}) {
  const { fmt } = useCurrency();
  const inventory = useQuery(api.products.getInventoryForProduct, { productId: product._id });
  const images = useQuery(api.products.getProductImages, { productId: product._id });
  const totalStock = product.type === "product"
    ? (inventory?.reduce((sum, r) => sum + r.quantity, 0) ?? 0)
    : null;
  const isLow = totalStock !== null && product.lowStockThreshold !== undefined && totalStock <= product.lowStockThreshold;
  const firstImage = images?.find((img) => img.url !== null);

  return (
    <Card
      id={focusElementId(product._id)}
      className={cn("relative", !product.isActive && "opacity-60", focused && FOCUS_RING_CLASS)}
    >
      {/* Image thumbnail */}
      {firstImage?.url && (
        <div
          className="w-full h-32 overflow-hidden rounded-t-xl bg-muted cursor-pointer"
          onClick={onImages}
        >
          <img
            src={firstImage.url}
            alt={product.name}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
          />
        </div>
      )}
      <CardContent className={cn("pt-5 space-y-3", firstImage?.url && "pt-3")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold truncate">{product.name}</p>
              {isLow && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
            </div>
            {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
            {product.category && (
              <Badge variant="secondary" className="text-xs mt-1">{product.category.name}</Badge>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-primary">{fmt(product.unitPrice)}</p>
            {product.unit && <p className="text-xs text-muted-foreground">per {product.unit}</p>}
          </div>
        </div>

        {product.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
        )}

        {product.type === "product" && (
          <div className="flex items-center justify-between text-sm pt-1">
            <span className="text-muted-foreground">Total stock:</span>
            <span className={cn("font-semibold", isLow ? "text-amber-500" : "text-foreground")}>
              {inventory === undefined ? "..." : totalStock} {product.unit ?? "units"}
            </span>
          </div>
        )}

        {canManage && (
          <div className="flex gap-1 pt-1 border-t flex-wrap">
            <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
            {product.type === "product" && (
              <Button size="sm" variant="ghost" onClick={onStock}><Boxes className="w-3 h-3 mr-1" />Stock</Button>
            )}
            <Button size="sm" variant="ghost" onClick={onImages}><ImageIcon className="w-3 h-3 mr-1" />Photos</Button>
            <Button size="sm" variant="ghost" onClick={onBarcode}><QrCode className="w-3 h-3 mr-1" />Barcode</Button>
            <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const products = useQuery(api.products.listProducts, {});
  const lowStockAlerts = useQuery(api.products.getLowStockAlerts);
  const deleteProduct = useMutation(api.products.deleteProduct);
  const currentUser = useQuery(api.users.getCurrentUser);
  const { focusId, isFocused } = useFocusItem();

  const [tab, setTab] = useState<"product" | "service">("product");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ProductWithCategory | null>(null);
  const [stockFor, setStockFor] = useState<Doc<"products"> | null>(null);
  const [barcodeFor, setBarcodeFor] = useState<Doc<"products"> | null>(null);
  const [showBatchBarcode, setShowBatchBarcode] = useState(false);
  const [imagesFor, setImagesFor] = useState<ProductWithCategory | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";

  // When arriving via global search, switch to the tab that holds the item.
  useEffect(() => {
    if (!focusId || !products) return;
    const target = products.find((p) => p._id === focusId);
    if (target) setTab(target.type);
  }, [focusId, products]);

  const filtered = products?.filter((p) => p.type === tab) ?? [];

  const handleDelete = async (id: Id<"products">) => {
    try {
      await deleteProduct({ productId: id });
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6" />Products & Services</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your catalog and inventory</p>
        </div>
        {canManage && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => setShowScanner(true)} className="cursor-pointer">
              <ScanLine className="w-4 h-4 mr-2" />Scan
            </Button>
            {tab === "product" && filtered.length > 0 && (
              <Button variant="secondary" onClick={() => setShowBatchBarcode(true)}>
                <Printer className="w-4 h-4 mr-2" />Batch Labels
              </Button>
            )}
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" />Add {tab === "product" ? "Product" : "Service"}
            </Button>
          </div>
        )}
      </div>

      {/* Low stock alerts */}
      {lowStockAlerts && lowStockAlerts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Low Stock Alerts ({lowStockAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockAlerts.map((a, i) => (
                <Badge key={i} variant="secondary" className="text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30">
                  {a.productName} @ {a.warehouseName}: {a.quantity} left (min {a.threshold})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "product" | "service")}>
        <TabsList>
          <TabsTrigger value="product" className="flex items-center gap-2">
            <Package className="w-4 h-4" />Products
          </TabsTrigger>
          <TabsTrigger value="service" className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />Services
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {products === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{tab === "product" ? <Package /> : <Wrench />}</EmptyMedia>
                <EmptyTitle>No {tab === "product" ? "products" : "services"} yet</EmptyTitle>
                <EmptyDescription>
                  Add your first {tab === "product" ? "product" : "service"} to start tracking
                </EmptyDescription>
              </EmptyHeader>
              {canManage && (
                <EmptyContent>
                  <Button size="sm" onClick={() => setShowAdd(true)}>
                    <Plus className="w-4 h-4 mr-2" />Add {tab === "product" ? "Product" : "Service"}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <ProductCard
                  key={p._id}
                  product={p}
                  canManage={canManage}
                  onEdit={() => setEditing(p)}
                  onStock={() => setStockFor(p)}
                  onDelete={() => handleDelete(p._id)}
                  onBarcode={() => setBarcodeFor(p)}
                  onImages={() => setImagesFor(p)}
                  focused={isFocused(p._id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showAdd && <ProductDialogEnhanced defaultType={tab} onClose={() => setShowAdd(false)} />}
      {editing && <ProductDialogEnhanced product={editing} defaultType={editing.type} onClose={() => setEditing(null)} />}
      {stockFor && <InventoryModal product={stockFor} onClose={() => setStockFor(null)} />}
      {barcodeFor && <BarcodeModal product={barcodeFor} onClose={() => setBarcodeFor(null)} />}
      {showBatchBarcode && (
        <BatchBarcodeModal
          products={filtered.filter((p) => p.type === "product")}
          onClose={() => setShowBatchBarcode(false)}
        />
      )}
      {imagesFor && (
        <ProductDetailDialog
          productId={imagesFor._id}
          productName={imagesFor.name}
          canManage={canManage}
          onClose={() => setImagesFor(null)}
        />
      )}
      {showScanner && (
        <ScannerModal
          onResult={(value) => {
            setShowScanner(false);
            // Check if it's a product URL
            const urlMatch = value.match(/\/shop\/product\/([a-z0-9]+)/i);
            if (urlMatch) {
              const productId = urlMatch[1];
              const found = products?.find((p) => p._id.includes(productId));
              if (found) {
                setBarcodeFor(found);
                toast.success(`Found: ${found.name}`);
              } else {
                toast.error("Product not found in your catalog");
              }
              return;
            }
            // Search by SKU or generated code
            const found = products?.find(
              (p) => p.sku === value || `PRD-${p._id.slice(-8).toUpperCase()}` === value
            );
            if (found) {
              setBarcodeFor(found);
              toast.success(`Found: ${found.name}`);
            } else {
              toast.error(`No product matches "${value}"`);
            }
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
