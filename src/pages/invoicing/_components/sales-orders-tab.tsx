import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ClipboardList, Plus, FileText, Truck, Trash2, CheckCircle2,
  XCircle, ArrowRight, Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type StatusFilter = "all" | "draft" | "confirmed" | "partially_fulfilled" | "fulfilled" | "invoiced" | "cancelled";

export default function SalesOrdersTab() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [viewOrderId, setViewOrderId] = useState<Id<"salesOrders"> | null>(null);

  const filterArgs = statusFilter === "all" ? {} : { status: statusFilter };
  const orders = useQuery(api.salesOrders.list, filterArgs);

  if (!orders) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 flex-wrap">
          {(["all", "draft", "confirmed", "partially_fulfilled", "fulfilled", "invoiced", "cancelled"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "ghost"}
              onClick={() => setStatusFilter(s)}
              className="cursor-pointer text-xs capitalize"
            >
              {s === "partially_fulfilled" ? "Partial" : s}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" />New Sales Order
        </Button>
      </div>

      {/* Order list */}
      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
                <EmptyTitle>No sales orders</EmptyTitle>
                <EmptyDescription>Create your first sales order or convert a quotation</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
                  <Plus className="w-4 h-4 mr-1" />Create Sales Order
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <Card
              key={order._id}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setViewOrderId(order._id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{order.orderNumber}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span>{order.customerName}</span>
                      <span>{format(new Date(order.date), "MMM d, yyyy")}</span>
                      {order.fulfilledPercentage > 0 && (
                        <span className="text-blue-600">Fulfilled: {order.fulfilledPercentage}%</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold">{order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    {order.invoicedAmount > 0 && (
                      <p className="text-xs text-green-600">Invoiced: {order.invoicedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreateSalesOrderDialog onClose={() => setShowCreate(false)} />}
      {viewOrderId && <OrderDetailDialog orderId={viewOrderId} onClose={() => setViewOrderId(null)} />}
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    partially_fulfilled: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    fulfilled: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    invoiced: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize", styles[status] ?? "bg-muted")}>
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Create Sales Order Dialog ──────────────────────────────

function CreateSalesOrderDialog({ onClose }: { onClose: () => void }) {
  const customers = useQuery(api.invoicing.listCustomersForSelect);
  const products = useQuery(api.invoicing.listProductsForSelect);
  const createOrder = useMutation(api.salesOrders.create);

  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Array<{ productId?: string; description: string; quantity: number; unitPrice: number }>>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const addItem = () => setItems([...items, { description: "", quantity: 1, unitPrice: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: string, value: string | number) => {
    const updated = [...items];
    if (field === "productId") {
      const product = products?.find((p) => p._id === value);
      if (product) {
        updated[idx] = { ...updated[idx], productId: value as string, description: product.name, unitPrice: product.unitPrice };
      }
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setItems(updated);
  };

  const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
  const tax = taxRate ? subtotal * parseFloat(taxRate) / 100 : 0;
  const total = subtotal + tax - (parseFloat(discount) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast.error("Select a customer"); return; }
    if (items.length === 0 || !items[0].description) { toast.error("Add at least one item"); return; }

    setSaving(true);
    try {
      await createOrder({
        customerId: customerId as Id<"customers">,
        date,
        expectedDelivery: expectedDelivery || undefined,
        taxRate: taxRate ? parseFloat(taxRate) : undefined,
        discount: discount ? parseFloat(discount) : undefined,
        notes: notes || undefined,
        items: items.filter((i) => i.description).map((i) => ({
          productId: i.productId as Id<"products"> | undefined,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      });
      toast.success("Sales order created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Sales Order</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Expected Delivery</Label>
              <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
            </div>
            <div>
              <Label>Tax Rate (%)</Label>
              <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Discount</Label>
              <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold">Line Items</Label>
              <Button type="button" size="sm" variant="secondary" onClick={addItem} className="cursor-pointer">
                <Plus className="w-3.5 h-3.5 mr-1" />Add Item
              </Button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg">
                <div className="flex-1">
                  <Select value={item.productId || "custom"} onValueChange={(v) => v !== "custom" && updateItem(idx, "productId", v)}>
                    <SelectTrigger className="cursor-pointer text-xs h-8">
                      <SelectValue placeholder="Product (or custom)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom item</SelectItem>
                      {products?.map((p) => (
                        <SelectItem key={p._id} value={p._id}>{p.name} — {p.unitPrice}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  className="w-40 h-8 text-xs"
                  value={item.description}
                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                  placeholder="Description"
                />
                <Input
                  className="w-16 h-8 text-xs"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                  placeholder="Qty"
                />
                <Input
                  className="w-24 h-8 text-xs"
                  type="number"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                  placeholder="Price"
                />
                <span className="text-xs font-mono w-20 text-right">{(item.quantity * item.unitPrice).toFixed(2)}</span>
                {items.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeItem(idx)} className="cursor-pointer h-8 w-8 p-0">
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal:</span><span className="font-mono">{subtotal.toFixed(2)}</span></div>
            {tax > 0 && <div className="flex justify-between"><span>Tax:</span><span className="font-mono">{tax.toFixed(2)}</span></div>}
            {parseFloat(discount) > 0 && <div className="flex justify-between"><span>Discount:</span><span className="font-mono text-red-600">-{parseFloat(discount).toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold border-t pt-1"><span>Total:</span><span className="font-mono">{total.toFixed(2)}</span></div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal notes" />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Order"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Order Detail Dialog ────────────────────────────────────

function OrderDetailDialog({ orderId, onClose }: { orderId: Id<"salesOrders">; onClose: () => void }) {
  const order = useQuery(api.salesOrders.get, { id: orderId });
  const updateStatus = useMutation(api.salesOrders.updateStatus);
  const fulfillItems = useMutation(api.salesOrders.fulfillItems);
  const convertToInvoice = useMutation(api.salesOrders.convertToInvoice);
  const deleteOrder = useMutation(api.salesOrders.remove);

  const [showInvoice, setShowInvoice] = useState(false);
  const [showFulfill, setShowFulfill] = useState(false);

  if (!order) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent><Skeleton className="h-40 w-full" /></DialogContent>
      </Dialog>
    );
  }

  const handleConfirm = async () => {
    try {
      await updateStatus({ id: orderId, status: "confirmed" });
      toast.success("Order confirmed");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  const handleCancel = async () => {
    try {
      await updateStatus({ id: orderId, status: "cancelled" });
      toast.success("Order cancelled");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  const handleDelete = async () => {
    try {
      await deleteOrder({ id: orderId });
      toast.success("Order deleted");
      onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  const remaining = order.totalAmount - order.invoicedAmount;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            {order.orderNumber}
            <StatusBadge status={order.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{order.customerName}</span></div>
            <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{format(new Date(order.date), "MMM d, yyyy")}</span></div>
            {order.expectedDelivery && (
              <div><span className="text-muted-foreground">Delivery:</span> <span className="font-medium">{format(new Date(order.expectedDelivery), "MMM d, yyyy")}</span></div>
            )}
            <div><span className="text-muted-foreground">Fulfilled:</span> <span className="font-medium">{order.fulfilledPercentage}%</span></div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Fulfillment Progress</span>
              <span>{order.fulfilledPercentage}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${order.fulfilledPercentage}%` }}
              />
            </div>
          </div>

          {/* Items table */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Item</th>
                  <th className="text-center p-2 font-medium">Qty</th>
                  <th className="text-center p-2 font-medium">Fulfilled</th>
                  <th className="text-right p-2 font-medium">Price</th>
                  <th className="text-right p-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.items.map((item) => (
                  <tr key={item._id}>
                    <td className="p-2">{item.description}</td>
                    <td className="p-2 text-center">{item.quantity}</td>
                    <td className="p-2 text-center">
                      <span className={item.fulfilledQty >= item.quantity ? "text-green-600" : "text-amber-600"}>
                        {item.fulfilledQty}/{item.quantity}
                      </span>
                    </td>
                    <td className="p-2 text-right font-mono">{item.unitPrice.toFixed(2)}</td>
                    <td className="p-2 text-right font-mono">{item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Total:</span><span className="font-mono font-bold">{order.totalAmount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Invoiced:</span><span className="font-mono text-green-600">{order.invoicedAmount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Remaining:</span><span className="font-mono text-amber-600">{remaining.toFixed(2)}</span></div>
          </div>

          {order.notes && (
            <p className="text-xs text-muted-foreground italic">{order.notes}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap pt-2 border-t">
            {order.status === "draft" && (
              <Button size="sm" onClick={handleConfirm} className="cursor-pointer">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Confirm
              </Button>
            )}
            {["confirmed", "partially_fulfilled", "fulfilled"].includes(order.status) && remaining > 0.01 && (
              <Button size="sm" onClick={() => setShowInvoice(true)} className="cursor-pointer">
                <FileText className="w-3.5 h-3.5 mr-1" />Invoice
              </Button>
            )}
            {["confirmed", "partially_fulfilled"].includes(order.status) && (
              <Button size="sm" variant="secondary" onClick={() => setShowFulfill(true)} className="cursor-pointer">
                <Truck className="w-3.5 h-3.5 mr-1" />Fulfill
              </Button>
            )}
            {order.status !== "cancelled" && order.status !== "invoiced" && (
              <Button size="sm" variant="secondary" onClick={handleCancel} className="cursor-pointer">
                <XCircle className="w-3.5 h-3.5 mr-1" />Cancel
              </Button>
            )}
            {order.status === "draft" && order.invoicedAmount === 0 && (
              <Button size="sm" variant="ghost" onClick={handleDelete} className="cursor-pointer text-red-600">
                <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
              </Button>
            )}
          </div>
        </div>

        {showInvoice && (
          <InvoiceFromOrderDialog
            orderId={orderId}
            remainingAmount={remaining}
            onClose={() => setShowInvoice(false)}
          />
        )}
        {showFulfill && (
          <FulfillDialog
            orderId={orderId}
            items={order.items}
            onClose={() => setShowFulfill(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice From Order Dialog ──────────────────────────────

function InvoiceFromOrderDialog({
  orderId,
  remainingAmount,
  onClose,
}: {
  orderId: Id<"salesOrders">;
  remainingAmount: number;
  onClose: () => void;
}) {
  const convertToInvoice = useMutation(api.salesOrders.convertToInvoice);
  const [dueDate, setDueDate] = useState("");
  const [saleType, setSaleType] = useState<"cash" | "credit">("credit");
  const [percentage, setPercentage] = useState("100");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueDate) { toast.error("Due date is required"); return; }
    setSaving(true);
    try {
      await convertToInvoice({
        id: orderId,
        dueDate,
        saleType,
        percentage: parseFloat(percentage) || 100,
      });
      toast.success("Invoice created from sales order");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            Create Invoice from Order
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <span className="text-muted-foreground">Remaining to invoice:</span>
            <span className="font-mono font-bold ml-2">{remainingAmount.toFixed(2)}</span>
          </div>

          <div>
            <Label>Invoice Percentage *</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min="1"
                max="100"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
              />
              <Percent className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Invoice amount: ~{(remainingAmount * (parseFloat(percentage) || 100) / 100).toFixed(2)}
            </p>
          </div>

          <div>
            <Label>Due Date *</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div>
            <Label>Sale Type</Label>
            <Select value={saleType} onValueChange={(v) => setSaleType(v as "cash" | "credit")}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="cash">Cash (Paid Immediately)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Invoice"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fulfill Dialog ─────────────────────────────────────────

function FulfillDialog({
  orderId,
  items,
  onClose,
}: {
  orderId: Id<"salesOrders">;
  items: Array<{ _id: Id<"salesOrderItems">; description: string; quantity: number; fulfilledQty: number }>;
  onClose: () => void;
}) {
  const fulfillItems = useMutation(api.salesOrders.fulfillItems);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i._id, Math.max(0, i.quantity - i.fulfilledQty)]))
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fulfillments = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, quantity]) => ({
        itemId: itemId as Id<"salesOrderItems">,
        quantity,
      }));

    if (fulfillments.length === 0) {
      toast.error("Enter quantities to fulfill");
      return;
    }

    setSaving(true);
    try {
      const result = await fulfillItems({ id: orderId, fulfillments });
      toast.success(`Fulfillment updated (${result.fulfilledPercentage}% complete)`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-4 h-4" />
            Fulfill Items
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            {items.map((item) => {
              const remaining = item.quantity - item.fulfilledQty;
              if (remaining <= 0) return null;
              return (
                <div key={item._id} className="flex items-center gap-3 p-2 border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.fulfilledQty}/{item.quantity} fulfilled (remaining: {remaining})
                    </p>
                  </div>
                  <Input
                    className="w-20 h-8 text-xs"
                    type="number"
                    min="0"
                    max={remaining}
                    value={quantities[item._id] ?? 0}
                    onChange={(e) => setQuantities({ ...quantities, [item._id]: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Update Fulfillment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
