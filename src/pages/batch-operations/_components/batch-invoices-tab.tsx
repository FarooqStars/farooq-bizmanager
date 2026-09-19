import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import { Plus, Trash2, FileText, Send } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type InvoiceItem = {
  productId?: Id<"products">;
  description: string;
  quantity: number;
  unitPrice: number;
};

type BatchInvoiceEntry = {
  id: string;
  customerId: string;
  date: string;
  dueDate: string;
  saleType: "cash" | "credit";
  creditTerms?: "net_15" | "net_30" | "net_60" | "net_90";
  items: InvoiceItem[];
  taxRate: number;
  discount: number;
  notes: string;
};

function createBlankEntry(): BatchInvoiceEntry {
  const today = new Date().toISOString().split("T")[0];
  const due = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  return {
    id: crypto.randomUUID(),
    customerId: "",
    date: today,
    dueDate: due,
    saleType: "credit",
    creditTerms: "net_30",
    items: [{ description: "", quantity: 1, unitPrice: 0 }],
    taxRate: 0,
    discount: 0,
    notes: "",
  };
}

export default function BatchInvoicesTab() {
  const customers = useQuery(api.invoicing.listCustomersForSelect);
  const products = useQuery(api.invoicing.listProductsForSelect);
  const batchCreate = useMutation(api.batch.batchCreateInvoices);

  const [entries, setEntries] = useState<BatchInvoiceEntry[]>([createBlankEntry()]);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!customers || !products) return <Skeleton className="h-60 w-full" />;

  const addEntry = () => setEntries([...entries, createBlankEntry()]);

  const removeEntry = (id: string) => {
    if (entries.length <= 1) return;
    setEntries(entries.filter((e) => e.id !== id));
  };

  const updateEntry = (id: string, updates: Partial<BatchInvoiceEntry>) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  const addItem = (entryId: string) => {
    setEntries(entries.map((e) =>
      e.id === entryId ? { ...e, items: [...e.items, { description: "", quantity: 1, unitPrice: 0 }] } : e
    ));
  };

  const removeItem = (entryId: string, itemIdx: number) => {
    setEntries(entries.map((e) =>
      e.id === entryId ? { ...e, items: e.items.filter((_, i) => i !== itemIdx) } : e
    ));
  };

  const updateItem = (entryId: string, itemIdx: number, updates: Partial<InvoiceItem>) => {
    setEntries(entries.map((e) =>
      e.id === entryId
        ? { ...e, items: e.items.map((item, i) => (i === itemIdx ? { ...item, ...updates } : item)) }
        : e
    ));
  };

  const selectProduct = (entryId: string, itemIdx: number, productId: string) => {
    const product = products.find((p) => p._id === productId);
    if (product) {
      updateItem(entryId, itemIdx, {
        productId: product._id as Id<"products">,
        description: product.name,
        unitPrice: product.unitPrice,
      });
    }
  };

  const getEntryTotal = (entry: BatchInvoiceEntry) => {
    const subtotal = entry.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const afterDiscount = subtotal - entry.discount;
    const tax = afterDiscount * (entry.taxRate / 100);
    return Math.round((afterDiscount + tax) * 100) / 100;
  };

  const handleSubmit = async () => {
    // Validate
    const valid = entries.every((e) => e.customerId && e.items.length > 0 && e.items.every((i) => i.description && i.unitPrice > 0));
    if (!valid) {
      toast.error("Please fill in all required fields for each invoice");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await batchCreate({
        invoices: entries.map((e) => ({
          customerId: e.customerId as Id<"customers">,
          date: e.date,
          dueDate: e.dueDate,
          saleType: e.saleType,
          creditTerms: e.saleType === "credit" ? e.creditTerms : undefined,
          items: e.items.map((item) => ({
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          taxRate: e.taxRate || undefined,
          discount: e.discount || undefined,
          notes: e.notes || undefined,
        })),
      });

      if (result.errors.length > 0) {
        toast.warning(`Created ${result.created} invoices with ${result.errors.length} errors`, {
          description: result.errors.join("; "),
        });
      } else {
        toast.success(`Successfully created ${result.created} invoices`);
      }

      // Reset form
      setEntries([createBlankEntry()]);
    } catch (error) {
      toast.error("Failed to create batch invoices");
    } finally {
      setIsProcessing(false);
    }
  };

  const grandTotal = entries.reduce((sum, e) => sum + getEntryTotal(e), 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="text-base px-3 py-1">
                {entries.length} invoice{entries.length !== 1 ? "s" : ""}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Grand Total: <span className="font-bold text-foreground">${grandTotal.toFixed(2)}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={addEntry} className="cursor-pointer">
                <Plus className="w-4 h-4 mr-1" /> Add Invoice
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isProcessing || entries.length === 0}
                className="cursor-pointer"
              >
                <Send className="w-4 h-4 mr-1" />
                {isProcessing ? "Processing..." : `Create ${entries.length} Invoice${entries.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice entries */}
      {entries.map((entry, entryIdx) => (
        <Card key={entry.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Invoice #{entryIdx + 1}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge>{entry.saleType === "cash" ? "Cash" : "Credit"}</Badge>
                <span className="font-semibold">${getEntryTotal(entry).toFixed(2)}</span>
                {entries.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEntry(entry.id)}
                    className="cursor-pointer text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Header fields */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Customer *</Label>
                <Select value={entry.customerId} onValueChange={(v) => updateEntry(entry.id, { customerId: v })}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c._id} value={c._id} className="cursor-pointer">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={entry.date} onChange={(e) => updateEntry(entry.id, { date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={entry.dueDate} onChange={(e) => updateEntry(entry.id, { dueDate: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Sale Type</Label>
                <Select value={entry.saleType} onValueChange={(v) => updateEntry(entry.id, { saleType: v as "cash" | "credit" })}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash" className="cursor-pointer">Cash</SelectItem>
                    <SelectItem value="credit" className="cursor-pointer">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Line Items</Label>
              {entry.items.map((item, itemIdx) => (
                <div key={itemIdx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Select
                      value={item.productId ?? "custom"}
                      onValueChange={(v) => {
                        if (v === "custom") {
                          updateItem(entry.id, itemIdx, { productId: undefined, description: "", unitPrice: 0 });
                        } else {
                          selectProduct(entry.id, itemIdx, v);
                        }
                      }}
                    >
                      <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Product / Custom" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom" className="cursor-pointer">Custom Item</SelectItem>
                        {products.map((p) => (
                          <SelectItem key={p._id} value={p._id} className="cursor-pointer">
                            {p.name} - ${p.unitPrice.toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(entry.id, itemIdx, { description: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Qty"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(entry.id, itemIdx, { quantity: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Price"
                      min={0}
                      step={0.01}
                      value={item.unitPrice}
                      onChange={(e) => updateItem(entry.id, itemIdx, { unitPrice: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {entry.items.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeItem(entry.id, itemIdx)} className="cursor-pointer text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => addItem(entry.id)} className="cursor-pointer">
                <Plus className="w-3 h-3 mr-1" /> Add Item
              </Button>
            </div>

            {/* Footer fields */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Tax Rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={entry.taxRate}
                  onChange={(e) => updateEntry(entry.id, { taxRate: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-xs">Discount ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={entry.discount}
                  onChange={(e) => updateEntry(entry.id, { discount: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Notes</Label>
                <Input
                  placeholder="Optional notes..."
                  value={entry.notes}
                  onChange={(e) => updateEntry(entry.id, { notes: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
