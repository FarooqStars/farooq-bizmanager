import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Printer, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { cn } from "@/lib/utils.ts";

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  printed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  cleared: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  void: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function ChequeVoucherTab() {
  const vouchers = useQuery(api.payrollEnhancements.listChequeVouchers, {});
  const updateStatus = useMutation(api.payrollEnhancements.updateChequeVoucherStatus);
  const deleteVoucher = useMutation(api.payrollEnhancements.deleteChequeVoucher);
  const [showCreate, setShowCreate] = useState(false);
  const [printingVoucher, setPrintingVoucher] = useState<NonNullable<typeof vouchers>[number] | null>(null);

  if (!vouchers) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const handlePrint = (voucher: NonNullable<typeof vouchers>[number]) => {
    // Generate cheque print window
    const printWindow = window.open("", "_blank", "width=900,height=500");
    if (!printWindow) {
      toast.error("Please allow popups for cheque printing");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cheque Voucher - ${voucher.voucherNumber}</title>
        <style>
          @page { size: landscape; margin: 10mm; }
          body { font-family: 'Courier New', monospace; padding: 20px; }
          .cheque { border: 2px solid #333; padding: 30px; max-width: 800px; margin: 0 auto; position: relative; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
          .bank-name { font-size: 22px; font-weight: bold; color: #1a365d; }
          .voucher-no { font-size: 12px; color: #666; }
          .date-line { text-align: right; margin-bottom: 15px; font-size: 14px; }
          .pay-to { margin-bottom: 15px; font-size: 14px; }
          .pay-to strong { border-bottom: 1px solid #333; padding-bottom: 2px; min-width: 300px; display: inline-block; }
          .amount-box { border: 2px solid #333; padding: 8px 15px; font-size: 18px; font-weight: bold; display: inline-block; min-width: 150px; text-align: center; }
          .amount-words { border-bottom: 1px solid #333; padding: 5px 0; margin: 15px 0; font-size: 13px; min-height: 20px; }
          .memo { margin-top: 20px; font-size: 12px; color: #555; }
          .signature { margin-top: 40px; display: flex; justify-content: space-between; }
          .sig-line { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 5px; font-size: 11px; }
          .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 60px; color: rgba(0,0,0,0.03); font-weight: bold; pointer-events: none; }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div style="text-align: center; margin-bottom: 20px;" class="no-print">
          <button onclick="window.print()" style="padding: 10px 30px; font-size: 16px; cursor: pointer; background: #2563eb; color: white; border: none; border-radius: 5px;">Print Cheque</button>
        </div>
        <div class="cheque">
          <div class="watermark">CHEQUE</div>
          <div class="header">
            <div>
              <div class="bank-name">${voucher.bankName}</div>
              <div class="voucher-no">Voucher: ${voucher.voucherNumber}</div>
              ${voucher.chequeNumber ? `<div class="voucher-no">Cheque #: ${voucher.chequeNumber}</div>` : ""}
            </div>
            <div class="amount-box">${voucher.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="date-line">Date: <strong>${voucher.date}</strong></div>
          <div class="pay-to">Pay to the order of: <strong>${voucher.payeeName}</strong></div>
          <div class="amount-words"><strong>${voucher.amountInWords}</strong></div>
          ${voucher.memo ? `<div class="memo">Memo: ${voucher.memo}</div>` : ""}
          <div class="signature">
            <div class="sig-line">Authorized Signature</div>
            <div class="sig-line">Company Stamp</div>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();

    // Mark as printed
    if (voucher.status === "draft") {
      updateStatus({ id: voucher._id, status: "printed" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Total Vouchers</p>
            <p className="text-2xl font-bold">{vouchers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Draft</p>
            <p className="text-2xl font-bold text-yellow-600">{vouchers.filter((v) => v.status === "draft").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Printed</p>
            <p className="text-2xl font-bold text-blue-600">{vouchers.filter((v) => v.status === "printed").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Cleared</p>
            <p className="text-2xl font-bold text-green-600">{vouchers.filter((v) => v.status === "cleared").length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" /> Create Cheque Voucher
        </Button>
      </div>

      {/* List */}
      {vouchers.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Printer /></EmptyMedia>
            <EmptyTitle>No cheque vouchers</EmptyTitle>
            <EmptyDescription>Create cheque vouchers for salary payments or other disbursements</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">Create Voucher</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Voucher #</th>
                    <th className="p-3 font-medium">Payee</th>
                    <th className="p-3 font-medium">Bank</th>
                    <th className="p-3 font-medium text-right">Amount</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v._id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{v.voucherNumber}</td>
                      <td className="p-3 font-medium">{v.payeeName}</td>
                      <td className="p-3 text-muted-foreground">{v.bankName}</td>
                      <td className="p-3 text-right font-semibold">{v.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-xs">{v.date}</td>
                      <td className="p-3">
                        <Badge className={cn("text-xs capitalize", statusColors[v.status])}>{v.status}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => handlePrint(v)}>
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          {v.status === "printed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer text-green-600"
                              onClick={async () => {
                                await updateStatus({ id: v._id, status: "cleared" });
                                toast.success("Marked as cleared");
                              }}
                            >
                              Clear
                            </Button>
                          )}
                          {(v.status === "draft" || v.status === "printed") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer text-destructive"
                              onClick={async () => {
                                try {
                                  await deleteVoucher({ id: v._id });
                                  toast.success("Voucher deleted");
                                } catch { toast.error("Cannot delete cleared vouchers"); }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
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

      {showCreate && <CreateChequeDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ─── Create Cheque Dialog ────────────────────────────────────────

function CreateChequeDialog({ onClose }: { onClose: () => void }) {
  const employees = useQuery(api.payroll.listEmployees, {});
  const createVoucher = useMutation(api.payrollEnhancements.createChequeVoucher);
  const amountWords = useQuery(api.payrollEnhancements.getAmountInWords, { amount: 0 });

  const [employeeId, setEmployeeId] = useState<string>("");
  const [payeeName, setPayeeName] = useState("");
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-fill payee name when employee selected
  const handleEmployeeChange = (id: string) => {
    setEmployeeId(id);
    if (id && id !== "none") {
      const emp = employees?.find((e) => e._id === id);
      if (emp) {
        setPayeeName(emp.name);
        if (emp.bankName) setBankName(emp.bankName);
      }
    }
  };

  const handleCreate = async () => {
    if (!payeeName.trim()) { toast.error("Payee name is required"); return; }
    if (!amount || Number(amount) <= 0) { toast.error("Valid amount is required"); return; }
    if (!bankName.trim()) { toast.error("Bank name is required"); return; }

    setSaving(true);
    try {
      await createVoucher({
        employeeId: employeeId && employeeId !== "none" ? employeeId as Id<"employees"> : undefined,
        payeeName: payeeName.trim(),
        amount: Number(amount),
        bankName: bankName.trim(),
        chequeNumber: chequeNumber.trim() || undefined,
        date,
        memo: memo.trim() || undefined,
        status: "draft",
      });
      toast.success("Cheque voucher created");
      onClose();
    } catch { toast.error("Failed to create voucher"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5" /> New Cheque Voucher
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Employee (optional)</Label>
            <Select value={employeeId} onValueChange={handleEmployeeChange}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Link to employee..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (external payee)</SelectItem>
                {(employees ?? []).map((e) => (
                  <SelectItem key={e._id} value={e._id}>{e.name} ({e.employeeId})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Payee Name *</Label>
              <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="John Smith" />
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000.00" min="0" step="0.01" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Bank Name *</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Qatar National Bank" />
            </div>
            <div className="space-y-2">
              <Label>Cheque Number</Label>
              <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="000123" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Memo</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="Salary payment for July 2026..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleCreate} disabled={saving} className="cursor-pointer">
            {saving ? "Creating..." : "Create Voucher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
