import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { Plus, Trash2, PackageCheck, RotateCcw, Warehouse, CreditCard, Banknote } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  received: "default",
  restocked: "default",
  refunded: "default",
  rejected: "destructive",
};

type ReturnItem = {
  productId?: Id<"products">;
  description: string;
  quantity: number;
  unitPrice: number;
  condition: "new" | "like_new" | "damaged" | "defective";
};

export default function ReturnsTab() {
  const { fmt } = useCurrency();
  const returns = useQuery(api.returns.listReturns, {});
  const customers = useQuery(api.invoicing.listCustomersForSelect);
  const products = useQuery(api.invoicing.listProductsForSelect);
  const updateStatus = useMutation(api.returns.updateReturnStatus);
  const createReturn = useMutation(api.returns.createReturn);
  const restockItems = useMutation(api.returns.restockReturnItems);

  const [showCreate, setShowCreate] = useState(false);
  const [showRestock, setShowRestock] = useState<string | null>(null);
  const [showRefund, setShowRefund] = useState<string | null>(null);

  if (!returns || !customers || !products) return <Skeleton className="h-60 w-full" />;

  if (returns.length === 0 && !showCreate) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-1" /> New Return
          </Button>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><RotateCcw /></EmptyMedia>
            <EmptyTitle>No returns yet</EmptyTitle>
            <EmptyDescription>Create a return/RMA when a customer wants to return items</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">Create Return</Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> New Return
        </Button>
      </div>

      {/* Return list */}
      <div className="space-y-2">
        {returns.map((ret) => (
          <Card key={ret._id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium">{ret.returnNumber}</p>
                    <p className="text-sm text-muted-foreground">{ret.customerName}</p>
                  </div>
                  {ret.invoiceNumber && (
                    <Badge variant="secondary" className="text-xs">Inv: {ret.invoiceNumber}</Badge>
                  )}
                  <Badge variant={STATUS_COLORS[ret.status]}>{ret.status}</Badge>
                  <span className="text-sm text-muted-foreground">{ret.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{fmt(ret.totalAmount)}</span>
                  {ret.restockingFee > 0 && (
                    <span className="text-xs text-muted-foreground">
                      (Fee: {fmt(ret.restockingFee)})
                    </span>
                  )}

                  {/* Status actions */}
                  {ret.status === "pending" && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => updateStatus({ id: ret._id as Id<"returns">, status: "approved" })} className="cursor-pointer">
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => updateStatus({ id: ret._id as Id<"returns">, status: "rejected" })} className="cursor-pointer text-destructive">
                        Reject
                      </Button>
                    </>
                  )}
                  {ret.status === "approved" && (
                    <Button size="sm" variant="secondary" onClick={() => updateStatus({ id: ret._id as Id<"returns">, status: "received" })} className="cursor-pointer">
                      Mark Received
                    </Button>
                  )}
                  {(ret.status === "received" || ret.status === "approved") && (
                    <Button size="sm" variant="secondary" onClick={() => setShowRestock(ret._id)} className="cursor-pointer">
                      <Warehouse className="w-3 h-3 mr-1" /> Restock
                    </Button>
                  )}
                  {(ret.status === "received" || ret.status === "restocked") && (
                    <Button
                      size="sm"
                      onClick={() => setShowRefund(ret._id)}
                      className="cursor-pointer"
                    >
                      <Banknote className="w-3 h-3 mr-1" /> Process Refund
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{ret.reason}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Return Dialog */}
      {showCreate && (
        <CreateReturnDialog
          customers={customers}
          products={products}
          onCreate={createReturn}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Restock Dialog */}
      {showRestock && (
        <RestockDialog
          returnId={showRestock as Id<"returns">}
          onRestock={restockItems}
          onClose={() => setShowRestock(null)}
        />
      )}

      {/* Process Refund Dialog */}
      {showRefund && (
        <ProcessRefundDialog
          returnId={showRefund as Id<"returns">}
          onClose={() => setShowRefund(null)}
        />
      )}
    </div>
  );
}

// ─── Create Return Dialog ────────────────────────────────────

function CreateReturnDialog({
  customers,
  products,
  onCreate,
  onClose,
}: {
  customers: Array<{ _id: string; name: string }>;
  products: Array<{ _id: string; name: string; unitPrice: number }>;
  onCreate: (args: {
    customerId: Id<"customers">;
    date: string;
    reason: string;
    notes?: string;
    restockingFeePercent?: number;
    items: Array<{
      productId?: Id<"products">;
      description: string;
      quantity: number;
      unitPrice: number;
      condition: "new" | "like_new" | "damaged" | "defective";
    }>;
  }) => Promise<Id<"returns">>;
  onClose: () => void;
}) {
  const { fmt } = useCurrency();
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [feePercent, setFeePercent] = useState(0);
  const [items, setItems] = useState<ReturnItem[]>([
    { description: "", quantity: 1, unitPrice: 0, condition: "new" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addItem = () => setItems([...items, { description: "", quantity: 1, unitPrice: 0, condition: "new" }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, updates: Partial<ReturnItem>) => {
    setItems(items.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  };

  const selectProduct = (idx: number, productId: string) => {
    const product = products.find((p) => p._id === productId);
    if (product) {
      updateItem(idx, {
        productId: product._id as Id<"products">,
        description: product.name,
        unitPrice: product.unitPrice,
      });
    }
  };

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const fee = total * (feePercent / 100);
  const refund = total - fee;

  const handleSubmit = async () => {
    if (!customerId || !reason || items.length === 0) {
      toast.error("Please fill customer, reason, and at least one item");
      return;
    }
    if (items.some((i) => !i.description || i.unitPrice <= 0)) {
      toast.error("All items must have a description and price");
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate({
        customerId: customerId as Id<"customers">,
        date,
        reason,
        notes: notes || undefined,
        restockingFeePercent: feePercent || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          condition: i.condition,
        })),
      });
      toast.success("Return created successfully");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create return");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Return / RMA</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c._id} value={c._id} className="cursor-pointer">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Restocking Fee %</Label>
              <Input type="number" min={0} max={100} value={feePercent} onChange={(e) => setFeePercent(Number(e.target.value) || 0)} />
            </div>
          </div>

          <div>
            <Label>Reason *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective product, wrong item shipped..." />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>

          {/* Items */}
          <div className="space-y-2">
            <Label className="font-semibold">Return Items</Label>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <Select
                    value={item.productId ?? "custom"}
                    onValueChange={(v) => {
                      if (v === "custom") updateItem(idx, { productId: undefined, description: "", unitPrice: 0 });
                      else selectProduct(idx, v);
                    }}
                  >
                    <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Product" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom" className="cursor-pointer">Custom</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p._id} value={p._id} className="cursor-pointer">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Input placeholder="Description" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                </div>
                <div className="col-span-1">
                  <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 1 })} />
                </div>
                <div className="col-span-2">
                  <Input type="number" min={0} step={0.01} value={item.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) || 0 })} />
                </div>
                <div className="col-span-3">
                  <Select value={item.condition} onValueChange={(v) => updateItem(idx, { condition: v as ReturnItem["condition"] })}>
                    <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new" className="cursor-pointer">New / Unopened</SelectItem>
                      <SelectItem value="like_new" className="cursor-pointer">Like New</SelectItem>
                      <SelectItem value="damaged" className="cursor-pointer">Damaged</SelectItem>
                      <SelectItem value="defective" className="cursor-pointer">Defective</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="cursor-pointer text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addItem} className="cursor-pointer">
              <Plus className="w-3 h-3 mr-1" /> Add Item
            </Button>
          </div>

          {/* Summary */}
          <Card>
            <CardContent className="py-3">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span><span>{fmt(total)}</span>
              </div>
              {feePercent > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Restocking Fee ({feePercent}%):</span><span>-{fmt(fee)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold mt-1">
                <span>Refund Amount:</span><span className="text-primary">{fmt(refund)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="cursor-pointer">
            {isSubmitting ? "Creating..." : "Create Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Restock Dialog ──────────────────────────────────────────

function RestockDialog({
  returnId,
  onRestock,
  onClose,
}: {
  returnId: Id<"returns">;
  onRestock: (args: { returnId: Id<"returns">; warehouseId: Id<"warehouses">; itemIds: Id<"returnItems">[] }) => Promise<unknown>;
  onClose: () => void;
}) {
  const returnData = useQuery(api.returns.getReturn, { id: returnId });
  const warehouses = useQuery(api.products.listWarehouses);
  const [warehouseId, setWarehouseId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!returnData || !warehouses) return null;

  const restockableItems = returnData.items.filter(
    (item) => !item.restocked && item.condition !== "damaged" && item.condition !== "defective"
  );

  const handleRestock = async () => {
    if (!warehouseId) {
      toast.error("Please select a warehouse");
      return;
    }

    setIsSubmitting(true);
    try {
      await onRestock({
        returnId,
        warehouseId: warehouseId as Id<"warehouses">,
        itemIds: restockableItems.map((i) => i._id as Id<"returnItems">),
      });
      toast.success("Items restocked successfully");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to restock");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restock Items — {returnData.returnNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w._id} value={w._id} className="cursor-pointer">{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Items to Restock ({restockableItems.length})</Label>
            {restockableItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items eligible for restocking (damaged/defective items excluded)</p>
            ) : (
              restockableItems.map((item) => (
                <div key={item._id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                  <span>{item.productName}</span>
                  <span className="text-muted-foreground">Qty: {item.quantity}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleRestock} disabled={isSubmitting || restockableItems.length === 0} className="cursor-pointer">
            {isSubmitting ? "Restocking..." : "Restock Items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Process Refund Dialog ──────────────────────────────────

function ProcessRefundDialog({
  returnId,
  onClose,
}: {
  returnId: Id<"returns">;
  onClose: () => void;
}) {
  const { fmt } = useCurrency();
  const returnData = useQuery(api.returns.getReturn, { id: returnId });
  const accounts = useQuery(api.accounting.listAccounts, { activeOnly: true });
  const warehouses = useQuery(api.products.listWarehouses);
  const processRefund = useMutation(api.returns.processReturnRefund);

  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "check" | "credit_to_account">("cash");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [autoRestock, setAutoRestock] = useState(true);
  const [warehouseId, setWarehouseId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!returnData || !accounts || !warehouses) return null;

  // Filter accounts based on payment method
  const getFilteredAccounts = () => {
    if (!accounts) return [];
    if (paymentMethod === "cash") {
      // Cash Drawer accounts
      return accounts.filter(a =>
        a.name.toLowerCase().includes("cash") ||
        a.subType?.toLowerCase().includes("cash")
      );
    }
    if (paymentMethod === "check" || paymentMethod === "bank_transfer") {
      // Bank/Checking accounts
      return accounts.filter(a =>
        a.type === "bank" &&
        !a.name.toLowerCase().includes("petty") &&
        !a.name.toLowerCase().includes("undeposited")
      );
    }
    // credit_to_account - show AR account
    return accounts.filter(a => a.type === "accounts_receivable");
  };

  const filteredAccounts = getFilteredAccounts();

  // Check if items have products for restocking
  const hasProductItems = returnData.items.some(
    item => item.productId && !item.restocked && item.condition !== "damaged" && item.condition !== "defective"
  );

  const handleSubmit = async () => {
    if (!accountId) {
      toast.error("Please select a payment account");
      return;
    }
    if (autoRestock && hasProductItems && !warehouseId) {
      toast.error("Please select a warehouse for restocking");
      return;
    }

    setIsSubmitting(true);
    try {
      await processRefund({
        returnId,
        paymentMethod,
        accountId: accountId as Id<"accounts">,
        date,
        reference: reference || undefined,
        notes: notes || undefined,
        autoRestock,
        warehouseId: warehouseId ? warehouseId as Id<"warehouses"> : undefined,
      });
      toast.success(`Refund of ${fmt(returnData.refundAmount)} processed successfully`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to process refund");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5" /> Process Refund — {returnData.returnNumber}
          </DialogTitle>
          <DialogDescription>
            Issue refund of {fmt(returnData.refundAmount)} to {returnData.customerName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Return Summary */}
          <Card>
            <CardContent className="py-3">
              <div className="flex justify-between text-sm">
                <span>Return Total:</span><span>{fmt(returnData.totalAmount)}</span>
              </div>
              {returnData.restockingFee > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Restocking Fee:</span><span>-{fmt(returnData.restockingFee)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold mt-1 border-t pt-1">
                <span>Refund Amount:</span><span className="text-primary">{fmt(returnData.refundAmount)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label className="font-semibold">Payment Method *</Label>
            <Select value={paymentMethod} onValueChange={(v) => {
              setPaymentMethod(v as typeof paymentMethod);
              setAccountId("");
            }}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash" className="cursor-pointer">Cash (from Cash Drawer)</SelectItem>
                <SelectItem value="bank_transfer" className="cursor-pointer">Bank Transfer</SelectItem>
                <SelectItem value="check" className="cursor-pointer">Check (from Bank Account)</SelectItem>
                <SelectItem value="credit_to_account" className="cursor-pointer">Credit to Customer Account</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Payment Account */}
          <div className="space-y-2">
            <Label>
              {paymentMethod === "cash" ? "Cash Account *" :
                paymentMethod === "credit_to_account" ? "AR Account *" :
                  "Bank Account *"}
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select account..." /></SelectTrigger>
              <SelectContent>
                {filteredAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.code} — {acc.name} · Balance: {fmt(acc.balance)}
                  </SelectItem>
                ))}
                {filteredAccounts.length === 0 && (
                  <SelectItem value="no_account" disabled className="text-muted-foreground">
                    No matching accounts found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Date & Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{paymentMethod === "check" ? "Check #" : "Reference"}</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={paymentMethod === "check" ? "Check number..." : "Reference..."}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>

          {/* Auto Restock */}
          {hasProductItems && (
            <Card>
              <CardContent className="py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-Restock Inventory</p>
                    <p className="text-xs text-muted-foreground">Automatically return items to inventory (non-damaged only)</p>
                  </div>
                  <Switch checked={autoRestock} onCheckedChange={setAutoRestock} className="cursor-pointer" />
                </div>

                {autoRestock && (
                  <div className="space-y-2">
                    <Label>Restock to Warehouse *</Label>
                    <Select value={warehouseId} onValueChange={setWarehouseId}>
                      <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select warehouse..." /></SelectTrigger>
                      <SelectContent>
                        {warehouses.map((w) => (
                          <SelectItem key={w._id} value={w._id} className="cursor-pointer">{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground space-y-1 mt-2">
                      <p className="font-medium">Items to restock:</p>
                      {returnData.items
                        .filter(i => !i.restocked && i.condition !== "damaged" && i.condition !== "defective")
                        .map((item) => (
                          <div key={item._id} className="flex justify-between px-2 py-1 bg-muted/50 rounded">
                            <span>{item.productName}</span>
                            <span>Qty: {item.quantity}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="cursor-pointer">
            {isSubmitting ? "Processing..." : `Process Refund (${fmt(returnData.refundAmount)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
