import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { RefreshCw, Send, FileText } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
] as const;

type InvoiceStatus = typeof STATUSES[number]["value"];

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  sent: "default",
  paid: "default",
  partially_paid: "secondary",
  overdue: "destructive",
  void: "destructive",
};

export default function BatchStatusTab() {
  const invoices = useQuery(api.invoicing.listInvoices, {});
  const batchUpdate = useMutation(api.batch.batchUpdateInvoiceStatus);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [newStatus, setNewStatus] = useState<InvoiceStatus>("sent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  if (!invoices) return <Skeleton className="h-60 w-full" />;

  const filteredInvoices = filterStatus === "all"
    ? invoices
    : invoices.filter((inv) => inv.status === filterStatus);

  if (invoices.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><FileText /></EmptyMedia>
          <EmptyTitle>No invoices found</EmptyTitle>
          <EmptyDescription>Create invoices first to batch update their status</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInvoices.map((inv) => inv._id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one invoice");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await batchUpdate({
        invoiceIds: Array.from(selectedIds) as Id<"invoices">[],
        status: newStatus,
      });

      if (result.failed.length > 0) {
        toast.warning(`Updated ${result.updated} invoices with ${result.failed.length} errors`, {
          description: result.failed.map((f) => `${f.id}: ${f.reason}`).join("; "),
        });
      } else {
        toast.success(`Successfully updated ${result.updated} invoices to "${newStatus}"`);
      }

      setSelectedIds(new Set());
    } catch (error) {
      toast.error("Failed to batch update status");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Filter by Status:</Label>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setSelectedIds(new Set()); }}>
                <SelectTrigger className="w-44 cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="cursor-pointer">All Statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="cursor-pointer">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Change to:</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as InvoiceStatus)}>
                <SelectTrigger className="w-44 cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="cursor-pointer">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary + action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={selectAll} className="cursor-pointer">
            {selectedIds.size === filteredInvoices.length ? "Deselect All" : "Select All"}
          </Button>
          <Badge variant="secondary">{selectedIds.size} of {filteredInvoices.length} selected</Badge>
        </div>
        <Button onClick={handleSubmit} disabled={isProcessing || selectedIds.size === 0} className="cursor-pointer">
          <RefreshCw className="w-4 h-4 mr-1" />
          {isProcessing ? "Updating..." : `Update ${selectedIds.size} to "${newStatus}"`}
        </Button>
      </div>

      {/* Invoice list */}
      {filteredInvoices.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No invoices with this status</EmptyTitle>
            <EmptyDescription>Try selecting a different status filter</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {filteredInvoices.map((inv) => (
            <Card
              key={inv._id}
              className={`cursor-pointer transition-colors ${selectedIds.has(inv._id) ? "border-primary bg-primary/5" : ""}`}
              onClick={() => toggleSelect(inv._id)}
            >
              <CardContent className="py-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedIds.has(inv._id)}
                    onCheckedChange={() => toggleSelect(inv._id)}
                    className="cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                    <div>
                      <p className="font-medium text-sm">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{inv.customerName}</p>
                    </div>
                    <div>
                      <Badge
                        variant={STATUS_COLORS[inv.status] === "destructive" ? "destructive" : "secondary"}
                      >
                        {inv.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {inv.date}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Due: {inv.dueDate}
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">${inv.totalAmount.toFixed(2)}</span>
                      {inv.amountPaid > 0 && inv.amountPaid < inv.totalAmount && (
                        <p className="text-xs text-muted-foreground">Paid: ${inv.amountPaid.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
