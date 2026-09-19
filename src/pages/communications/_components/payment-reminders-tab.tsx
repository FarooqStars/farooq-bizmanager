import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Mail, MessageCircle, AlertTriangle, CheckCircle } from "lucide-react";
import ShareDocumentDialog from "@/components/share-document-dialog.tsx";

export default function PaymentRemindersTab() {
  const overdueInvoices = useQuery(api.communications.getOverdueInvoices);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [shareTarget, setShareTarget] = useState<{
    id: string; number: string; customer: string; email: string; phone: string; amount: number; dueDate: string;
  } | null>(null);

  if (!overdueInvoices) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const toggleSelect = (id: string) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedInvoices.size === overdueInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(overdueInvoices.map((i) => i._id)));
    }
  };

  const handleBulkReminder = () => {
    if (selectedInvoices.size === 0) {
      toast.error("Select at least one invoice");
      return;
    }
    // Open first selected for share (sequential bulk messaging)
    const first = overdueInvoices.find((i) => selectedInvoices.has(i._id));
    if (first) {
      setShareTarget({
        id: first._id,
        number: first.invoiceNumber,
        customer: first.customerName,
        email: first.customerEmail,
        phone: first.customerPhone,
        amount: first.balance,
        dueDate: first.dueDate,
      });
    }
  };

  const totalOverdue = overdueInvoices.reduce((s, i) => s + i.balance, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Overdue Invoices</p>
            <p className="text-xl font-bold text-red-600 break-words leading-tight">{overdueInvoices.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Total Outstanding</p>
            <p className="text-xl font-bold text-amber-600 break-words leading-tight">${totalOverdue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Selected</p>
            <p className="text-xl font-bold break-words leading-tight">{selectedInvoices.size}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-2">
            <Button size="sm" className="cursor-pointer" onClick={handleBulkReminder} disabled={selectedInvoices.size === 0}>
              <Mail className="w-3 h-3 mr-1" /> Send Reminders
            </Button>
          </CardContent>
        </Card>
      </div>

      {overdueInvoices.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CheckCircle /></EmptyMedia>
            <EmptyTitle>No overdue invoices</EmptyTitle>
            <EmptyDescription>All payments are up to date</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Overdue Invoices</CardTitle>
            <Button size="sm" variant="secondary" className="cursor-pointer" onClick={selectAll}>
              {selectedInvoices.size === overdueInvoices.length ? "Deselect All" : "Select All"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 w-8"></th>
                    <th className="text-left p-2 font-medium">Invoice</th>
                    <th className="text-left p-2 font-medium">Customer</th>
                    <th className="text-left p-2 font-medium">Contact</th>
                    <th className="text-right p-2 font-medium">Balance</th>
                    <th className="text-right p-2 font-medium">Days Past</th>
                    <th className="text-right p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {overdueInvoices.map((inv) => (
                    <tr key={inv._id} className="hover:bg-muted/30">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          className="cursor-pointer"
                          checked={selectedInvoices.has(inv._id)}
                          onChange={() => toggleSelect(inv._id)}
                        />
                      </td>
                      <td className="p-2 font-medium">{inv.invoiceNumber}</td>
                      <td className="p-2">{inv.customerName}</td>
                      <td className="p-2">
                        <div className="text-xs">
                          {inv.customerEmail && <span className="block">{inv.customerEmail}</span>}
                          {inv.customerPhone && <span className="block text-muted-foreground">{inv.customerPhone}</span>}
                        </div>
                      </td>
                      <td className="p-2 text-right font-bold text-red-600">${inv.balance.toFixed(2)}</td>
                      <td className="p-2 text-right">
                        <Badge className={inv.daysPastDue > 60 ? "bg-red-100 text-red-700" : inv.daysPastDue > 30 ? "bg-amber-100 text-amber-700" : "bg-yellow-100 text-yellow-700"}>
                          {inv.daysPastDue}d
                        </Badge>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="cursor-pointer h-7 px-2" title="Send Reminder via Email" onClick={() => setShareTarget({
                            id: inv._id,
                            number: inv.invoiceNumber,
                            customer: inv.customerName,
                            email: inv.customerEmail,
                            phone: inv.customerPhone,
                            amount: inv.balance,
                            dueDate: inv.dueDate,
                          })}>
                            <Mail className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="cursor-pointer h-7 px-2" title="Send via WhatsApp" onClick={() => {
                            const cleanPhone = (inv.customerPhone || "").replace(/[^0-9+]/g, "");
                            if (!cleanPhone) { toast.error("No phone number for this customer"); return; }
                            const msg = `Dear ${inv.customerName},\n\nThis is a reminder that Invoice ${inv.invoiceNumber} for $${inv.balance.toFixed(2)} is ${inv.daysPastDue} days past due.\n\nPlease arrange payment at your earliest convenience.\n\nBest regards`;
                            window.open(`https://wa.me/${cleanPhone.startsWith("+") ? cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
                          }}>
                            <MessageCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Share Dialog */}
      {shareTarget && (
        <ShareDocumentDialog
          open={!!shareTarget}
          onOpenChange={(open) => { if (!open) setShareTarget(null); }}
          documentType="payment_reminder"
          documentId={shareTarget.id}
          documentNumber={shareTarget.number}
          recipientName={shareTarget.customer}
          recipientEmail={shareTarget.email}
          recipientPhone={shareTarget.phone}
          amount={shareTarget.amount}
          dueDate={shareTarget.dueDate}
        />
      )}
    </div>
  );
}
