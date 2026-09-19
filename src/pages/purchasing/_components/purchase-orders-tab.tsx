import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, FileText, Send, Check, Package, X, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { PrintPurchaseOrderButton } from "@/components/print-document-buttons.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useCurrency } from "@/hooks/use-currency.ts";

type StatusFilter = "all" | "draft" | "sent" | "partially_received" | "received" | "cancelled";
type LineItem = { description: string; quantity: number; unitPrice: number; productId?: string };

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Partial", value: "partially_received" },
  { label: "Received", value: "received" },
  { label: "Cancelled", value: "cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  partially_received: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  received: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const PAYMENT_TERMS = [
  { label: "Due on Receipt", value: "due_on_receipt" },
  { label: "Net 15", value: "net_15" },
  { label: "Net 30", value: "net_30" },
  { label: "Net 60", value: "net_60" },
  { label: "Net 90", value: "net_90" },
  { label: "Prepaid", value: "prepaid" },
];

export default function PurchaseOrdersTab() {
  const orders = useQuery(api.purchasing.listPurchaseOrders, {});
  const vendors = useQuery(api.vendors.listVendors, {});
  const createPO = useMutation(api.purchasing.createPurchaseOrder);
  const updateStatus = useMutation(api.purchasing.updatePurchaseOrderStatus);
  const approvePO = useMutation(api.purchasing.approvePurchaseOrder);
  const convertToBill = useMutation(api.purchasing.convertToBill);

  const { fmt } = useCurrency();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [vendorId, setVendorId] = useState("");
  const [poDate, setPoDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("net_30");
  const [notes, setNotes] = useState("");

  if (!orders || !vendors) return <Skeleton className="h-60 w-full" />;

  const filtered = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  const resetForm = () => {
    setVendorId("");
    setPoDate(format(new Date(), "yyyy-MM-dd"));
    setExpectedDelivery("");
    setLineItems([{ description: "", quantity: 1, unitPrice: 0 }]);
    setTaxRate("");
    setDiscount("");
    setShippingCost("");
    setPaymentTerms("net_30");
    setNotes("");
  };

  const handleCreate = async () => {
    if (!vendorId) { toast.error("Select a vendor"); return; }
    const validItems = lineItems.filter((i) => i.description.trim() && i.quantity > 0 && i.unitPrice > 0);
    if (validItems.length === 0) { toast.error("Add at least one item"); return; }

    try {
      await createPO({
        vendorId: vendorId as Id<"vendors">,
        date: poDate,
        expectedDelivery: expectedDelivery || undefined,
        items: validItems.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          productId: i.productId ? i.productId as Id<"products"> : undefined,
        })),
        taxRate: taxRate ? parseFloat(taxRate) : undefined,
        discount: discount ? parseFloat(discount) : undefined,
        shippingCost: shippingCost ? parseFloat(shippingCost) : undefined,
        paymentTerms: paymentTerms as "net_15" | "net_30" | "net_60" | "net_90" | "due_on_receipt" | "prepaid",
        notes: notes || undefined,
      });
      toast.success("Purchase order created");
      setShowCreate(false);
      resetForm();
    } catch {
      toast.error("Failed to create purchase order");
    }
  };

  const subtotal = lineItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  return (
    <div className="space-y-4 mt-4">
      {/* Filters and actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? "default" : "secondary"}
              className="cursor-pointer text-xs h-7"
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button className="cursor-pointer" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Create PO
        </Button>
      </div>

      {/* PO List */}
      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No purchase orders</EmptyTitle>
            <EmptyDescription>Create a purchase order to start procurement</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Create PO</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {filtered.map((po) => (
            <Card key={po._id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">{po.poNumber}</span>
                      <Badge className={STATUS_COLORS[po.status]}>{po.status.replace("_", " ")}</Badge>
                      {po.paymentTerms && (
                        <Badge variant="secondary" className="text-xs">{po.paymentTerms.replace("_", " ")}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {po.vendorName} | {format(new Date(po.date), "MMM d, yyyy")}
                      {po.expectedDelivery && ` | Delivery: ${format(new Date(po.expectedDelivery), "MMM d, yyyy")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{fmt(po.totalAmount)}</span>
                    {/* Actions */}
                    {po.status === "draft" && (
                      <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0" title="Approve & Send"
                        onClick={async () => { await approvePO({ id: po._id }); toast.success("PO approved and sent"); }}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {(po.status === "sent" || po.status === "partially_received") && (
                      <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0" title="Mark Received"
                        onClick={async () => { await updateStatus({ id: po._id, status: "received" }); toast.success("Marked as received"); }}>
                        <Package className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {(po.status === "received" || po.status === "partially_received") && !po.linkedBillId && (
                      <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0" title="Convert to Bill"
                        onClick={async () => { await convertToBill({ purchaseOrderId: po._id }); toast.success("Bill created from PO"); }}>
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {po.linkedBillId && (
                      <Badge variant="secondary" className="text-xs">Bill linked</Badge>
                    )}
                    {po.status === "draft" && (
                      <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0 text-destructive" title="Cancel"
                        onClick={async () => { await updateStatus({ id: po._id, status: "cancelled" }); toast.success("Cancelled"); }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <PrintPurchaseOrderButton purchaseOrderId={po._id} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create PO Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Vendor and dates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Vendor *</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendors.filter((v) => v.isActive).map((v) => (
                      <SelectItem key={v._id} value={v._id} className="cursor-pointer">{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>PO Date</Label>
                <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Expected Delivery</Label>
                <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
              </div>
            </div>

            {/* Payment Terms */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="cursor-pointer">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tax Rate (%)</Label>
                <Input type="number" min={0} step={0.01} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Shipping Cost</Label>
                <Input type="number" min={0} step={0.01} value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <Label>Items</Label>
              {lineItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={item.description}
                    onChange={(e) => setLineItems((items) => items.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))}
                    placeholder="Description"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity || ""}
                    onChange={(e) => setLineItems((items) => items.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 0 } : it))}
                    placeholder="Qty"
                    className="w-20"
                  />
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unitPrice || ""}
                    onChange={(e) => setLineItems((items) => items.map((it, i) => i === idx ? { ...it, unitPrice: parseFloat(e.target.value) || 0 } : it))}
                    placeholder="Price"
                    className="w-24"
                  />
                  <span className="text-sm font-medium w-20 text-right">{fmt(item.quantity * item.unitPrice)}</span>
                  {lineItems.length > 1 && (
                    <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-destructive"
                      onClick={() => setLineItems((items) => items.filter((_, i) => i !== idx))}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="secondary" className="cursor-pointer"
                onClick={() => setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0 }])}>
                <Plus className="w-3 h-3 mr-1" /> Add Item
              </Button>
            </div>

            {/* Discount and Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Discount Amount</Label>
                <Input type="number" min={0} step={0.01} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
              </div>
            </div>

            {/* Totals */}
            <div className="bg-muted p-3 rounded-lg text-right space-y-1">
              <p className="text-sm">Subtotal: <span className="font-medium">{fmt(subtotal)}</span></p>
              {discount && <p className="text-sm text-destructive">Discount: -{fmt(parseFloat(discount || "0"))}</p>}
              {taxRate && <p className="text-sm">Tax ({taxRate}%): +{fmt((subtotal - parseFloat(discount || "0")) * parseFloat(taxRate || "0") / 100)}</p>}
              {shippingCost && <p className="text-sm">Shipping: +{fmt(parseFloat(shippingCost || "0"))}</p>}
              <p className="text-base font-bold border-t pt-1 mt-1">
                Total: {fmt(
                  subtotal
                  - parseFloat(discount || "0")
                  + (subtotal - parseFloat(discount || "0")) * parseFloat(taxRate || "0") / 100
                  + parseFloat(shippingCost || "0")
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="cursor-pointer" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button className="cursor-pointer" onClick={handleCreate}>
              <Check className="w-4 h-4 mr-1" /> Create Purchase Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
