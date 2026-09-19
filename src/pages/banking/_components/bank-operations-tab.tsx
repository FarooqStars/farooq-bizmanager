import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import {
  FileCheck, CreditCard, Receipt, Wallet, Banknote,
  Plus, RefreshCw, ArrowDownLeft, Calendar, DollarSign, ArrowUpRight,
  Split, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const EXPENSE_CATEGORIES = [
  "Office Supplies", "Utilities", "Travel", "Meals & Entertainment",
  "Transportation", "Repairs & Maintenance", "Professional Services",
  "Insurance", "Rent", "Phone & Internet", "Postage & Shipping",
  "Equipment", "Marketing", "Miscellaneous",
];

// ─── Write Check Dialog ──────────────────────────────────────────────────────

function WriteCheckDialog({ onClose }: { onClose: () => void }) {
  const { fmt } = useCurrency();
  const accounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const allAccounts = useQuery(api.accounting.listAccounts, { activeOnly: true });
  const vendors = useQuery(api.vendors.listVendors, {});
  const writeCheck = useMutation(api.bankingOperations.writeCheck);

  // Filter accounts for Checking subType
  const checkingAccounts = accounts?.filter((a) => a.subType?.toLowerCase() === "checking") ?? [];
  // Expense/COGS/asset accounts for the expense account selector
  const expenseAccounts = (allAccounts ?? []).filter((a) =>
    a.type === "expense" || a.type === "cost_of_goods_sold" || a.type === "other_expense" || a.type === "asset"
  );

  const [selectedAccount, setSelectedAccount] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [checkNumber, setCheckNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [vendorId, setVendorId] = useState("none");
  const [expenseAccountId, setExpenseAccountId] = useState("none");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedAccount || !payee || !amount || !date || !checkNumber) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await writeCheck({
        accountId: selectedAccount as Id<"accounts">,
        payee,
        amount: parseFloat(amount),
        date,
        checkNumber,
        memo: memo || undefined,
        vendorId: vendorId !== "none" ? vendorId as Id<"vendors"> : undefined,
        expenseCategory: expenseAccountId !== "none" ? expenseAccountId : undefined,
      });
      toast.success(`Check #${checkNumber} written for ${fmt(parseFloat(amount))}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to write check");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileCheck className="w-5 h-5" /> Write Check</DialogTitle>
          <DialogDescription>Issue a check from your checking account</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
          <div className="space-y-2">
            <Label>Bank Account (Checking) *</Label>
            <Select value={selectedAccount} onValueChange={(v) => {
              setSelectedAccount(v);
              setCheckNumber("");
            }}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select checking account..." /></SelectTrigger>
              <SelectContent>
                {checkingAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.name} ({acc.subType ?? acc.type}) · Balance: {fmt(acc.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {checkingAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground">No checking accounts available. Create one in Chart of Accounts.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Check Number *</Label>
              <Input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="0001" />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pay to the Order of *</Label>
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Payee name" />
          </div>

          <div className="space-y-2">
            <Label>Amount *</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="space-y-2">
            <Label>Memo</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional memo..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Vendor (Optional)</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {vendors?.map((vendor) => (
                    <SelectItem key={vendor._id} value={vendor._id} className="cursor-pointer">{vendor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expense Account (Optional)</Label>
              <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select account..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {expenseAccounts.map((a) => (
                    <SelectItem key={a._id} value={a._id} className="cursor-pointer">
                      {a.code ? `${a.code} — ` : ""}{a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {expenseAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">No expense accounts found.</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Writing..." : "Write Check"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Expense Dialog ───────────────────────────────────────────────────

function RecordExpenseDialog({ onClose }: { onClose: () => void }) {
  const { fmt } = useCurrency();
  const accounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const vendors = useQuery(api.vendors.listVendors, {});
  const recordBankExpense = useMutation(api.bankingOperations.recordBankExpense);

  const activeAccounts = accounts ?? [];

  const [selectedAccount, setSelectedAccount] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [vendorId, setVendorId] = useState("none");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedAccount || !payee || !amount || !date || !category) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await recordBankExpense({
        accountId: selectedAccount as Id<"accounts">,
        payee,
        amount: parseFloat(amount),
        date,
        expenseCategory: category,
        reference: reference || undefined,
        notes: notes || undefined,
        vendorId: vendorId !== "none" ? vendorId as Id<"vendors"> : undefined,
      });
      toast.success(`Expense of ${fmt(parseFloat(amount))} recorded`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="w-5 h-5" /> Record Expense</DialogTitle>
          <DialogDescription>Record an expense paid from a bank account</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
          <div className="space-y-2">
            <Label>Pay From Account *</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select account..." /></SelectTrigger>
              <SelectContent>
                {activeAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.name} ({acc.subType ?? acc.type}) · Balance: {fmt(acc.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Payee *</Label>
              <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Who was paid" />
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Expense Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="cursor-pointer">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vendor (Optional)</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {vendors?.map((v) => (
                  <SelectItem key={v._id} value={v._id} className="cursor-pointer">{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reference Number</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional..." />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Recording..." : "Record Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Petty Cash Expense Dialog ───────────────────────────────────────────────

function PettyCashExpenseDialog({ onClose }: { onClose: () => void }) {
  const { fmt } = useCurrency();
  const recordPettyCash = useMutation(api.bankingOperations.recordPettyCashExpense);

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!amount || !date || !description || !category) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await recordPettyCash({
        amount: parseFloat(amount),
        date,
        description,
        expenseCategory: category,
        paidTo: paidTo || undefined,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      toast.success(`Petty cash expense of ${fmt(parseFloat(amount))} recorded`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record petty cash expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5" /> Petty Cash Expense</DialogTitle>
          <DialogDescription>Record a small expense from petty cash fund</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this expense for?" />
          </div>

          <div className="space-y-2">
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select category..." /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="cursor-pointer">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Paid To</Label>
            <Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Optional recipient" />
          </div>

          <div className="space-y-2">
            <Label>Receipt/Reference #</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional..." />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Recording..." : "Record Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Make Payment Dialog ─────────────────────────────────────────────────────

function MakePaymentDialog({ onClose }: { onClose: () => void }) {
  const { fmt } = useCurrency();
  const accounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const vendors = useQuery(api.vendors.listVendors, {});
  const makeBankPayment = useMutation(api.bankingOperations.makeBankPayment);

  const activeAccounts = accounts ?? [];

  const [selectedAccount, setSelectedAccount] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<"check" | "wire" | "ach" | "eft" | "online">("wire");
  const [reference, setReference] = useState("");
  const [vendorId, setVendorId] = useState("none");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedAccount || !payee || !amount || !date) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await makeBankPayment({
        accountId: selectedAccount as Id<"accounts">,
        payee,
        amount: parseFloat(amount),
        date,
        paymentMethod,
        reference: reference || undefined,
        vendorId: vendorId !== "none" ? vendorId as Id<"vendors"> : undefined,
        notes: notes || undefined,
      });
      toast.success(`Payment of ${fmt(parseFloat(amount))} sent to ${payee}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to make payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> Make Payment</DialogTitle>
          <DialogDescription>Send a payment from your bank account</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
          <div className="space-y-2">
            <Label>Pay From Account *</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select account..." /></SelectTrigger>
              <SelectContent>
                {activeAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.name} ({acc.subType ?? acc.type}) · Balance: {fmt(acc.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Pay To *</Label>
              <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Recipient name" />
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wire" className="cursor-pointer">Wire Transfer</SelectItem>
                  <SelectItem value="ach" className="cursor-pointer">ACH</SelectItem>
                  <SelectItem value="eft" className="cursor-pointer">EFT</SelectItem>
                  <SelectItem value="check" className="cursor-pointer">Check</SelectItem>
                  <SelectItem value="online" className="cursor-pointer">Online Banking</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vendor (Optional)</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {vendors?.map((v) => (
                  <SelectItem key={v._id} value={v._id} className="cursor-pointer">{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reference Number</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional..." />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Sending..." : "Make Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Replenish Petty Cash Dialog ────────────────────────────────────────────

function ReplenishPettyCashDialog({ onClose }: { onClose: () => void }) {
  const { fmt } = useCurrency();
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const replenish = useMutation(api.bankingOperations.replenishPettyCash);

  const [selectedAccount, setSelectedAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedAccount || !amount) {
      toast.error("Please select a source account and enter amount");
      return;
    }
    setSaving(true);
    try {
      await replenish({
        fromAccountId: selectedAccount as Id<"accounts">,
        amount: parseFloat(amount),
        date,
        reference: reference || undefined,
      });
      toast.success(`Petty cash replenished with ${fmt(parseFloat(amount))}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to replenish");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RefreshCw className="w-5 h-5" /> Replenish Petty Cash</DialogTitle>
          <DialogDescription>Transfer funds from bank to petty cash</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Transfer From *</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select source account..." /></SelectTrigger>
              <SelectContent>
                {ledgerAccounts?.filter((a) => a.subType !== "Petty Cash").map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.code} — {acc.name} ({acc.subType ?? acc.type}) · Balance: {fmt(acc.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Transferring..." : "Replenish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Deposit to Bank Dialog ─────────────────────────────────────────────────

function DepositToBankDialog({ onClose }: { onClose: () => void }) {
  const { fmt } = useCurrency();
  const accounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const deposit = useMutation(api.bankingOperations.depositToBank);

  // Source: Cash/non-bank accounts (Cash Drawer, Petty Cash, Undeposited Funds)
  const cashAccounts = accounts?.filter((a) =>
    a.subType?.toLowerCase().includes("cash") ||
    a.name.toLowerCase().includes("cash") ||
    a.name.toLowerCase().includes("undeposited")
  ) ?? [];

  // Destination: Bank accounts (not cash)
  const bankAccounts = accounts?.filter((a) =>
    !a.subType?.toLowerCase().includes("cash") &&
    !a.name.toLowerCase().includes("cash") &&
    !a.name.toLowerCase().includes("petty") &&
    !a.name.toLowerCase().includes("undeposited")
  ) ?? [];

  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedSource = accounts?.find(a => a._id === fromAccountId);

  const handleSave = async () => {
    if (!fromAccountId || !toAccountId || !amount) {
      toast.error("Please select source, destination, and enter amount");
      return;
    }
    const amountNum = parseFloat(amount);
    if (amountNum <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    setSaving(true);
    try {
      await deposit({
        fromAccountId: fromAccountId as Id<"accounts">,
        toAccountId: toAccountId as Id<"accounts">,
        amount: amountNum,
        date,
        reference: reference || undefined,
        memo: memo || undefined,
      });
      toast.success(`Deposited ${fmt(amountNum)} to bank account`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deposit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowUpRight className="w-5 h-5" /> Deposit to Bank</DialogTitle>
          <DialogDescription>Transfer funds from cash drawer or till to a bank account</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Deposit From (Source) *</Label>
            <Select value={fromAccountId} onValueChange={setFromAccountId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select source..." /></SelectTrigger>
              <SelectContent>
                {cashAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.code} — {acc.name} · Balance: {fmt(acc.balance)}
                  </SelectItem>
                ))}
                {/* Also allow any bank account as source for flexibility */}
                {bankAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.code} — {acc.name} · Balance: {fmt(acc.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSource && (
              <p className="text-xs text-muted-foreground">Available balance: {fmt(selectedSource.balance)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Deposit To (Bank Account) *</Label>
            <Select value={toAccountId} onValueChange={setToAccountId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select bank account..." /></SelectTrigger>
              <SelectContent>
                {accounts?.filter(a => a._id !== fromAccountId).map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.code} — {acc.name} ({acc.subType ?? acc.type}) · Balance: {fmt(acc.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Reference / Slip #</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Deposit slip number..." />
            </div>
            <div className="space-y-2">
              <Label>Memo</Label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional note..." />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Depositing..." : "Make Deposit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Split Payment / Split Check Dialog ──────────────────────────────────────

type SplitLine = { accountId: string; amount: string; description: string };

function SplitPaymentDialog({ onClose }: { onClose: () => void }) {
  const { fmt } = useCurrency();
  const bankAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const allAccounts = useQuery(api.accounting.listAccounts, { activeOnly: true });
  const vendors = useQuery(api.vendors.listVendors, {});
  const writeSplitPayment = useMutation(api.bankingOperations.writeSplitPayment);
  const writeSplitCheck = useMutation(api.bankingOperations.writeSplitCheck);

  // Expense-like accounts are the valid debit targets for a split.
  const expenseAccounts = (allAccounts ?? []).filter((a) =>
    a.type === "expense" || a.type === "cost_of_goods_sold" || a.type === "other_expense"
  );

  const [selectedAccount, setSelectedAccount] = useState("");
  const [payee, setPayee] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [vendorId, setVendorId] = useState("none");
  const [lines, setLines] = useState<SplitLine[]>([
    { accountId: "", amount: "", description: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const total = lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

  const addLine = () => setLines([...lines, { accountId: "", amount: "", description: "" }]);
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: keyof SplitLine, value: string) =>
    setLines(lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));

  const buildSplits = () => {
    const splits = lines
      .filter((l) => l.accountId && (parseFloat(l.amount) || 0) > 0)
      .map((l) => ({
        accountId: l.accountId as Id<"accounts">,
        amount: parseFloat(l.amount),
        description: l.description || undefined,
      }));
    return splits;
  };

  const validate = (splits: ReturnType<typeof buildSplits>): boolean => {
    if (!selectedAccount) { toast.error("Select a bank account"); return false; }
    if (!payee) { toast.error("Enter a payee"); return false; }
    if (!date) { toast.error("Select a date"); return false; }
    if (splits.length === 0) { toast.error("Add at least one split line with an account and amount"); return false; }
    return true;
  };

  const handleRecordPayment = async () => {
    const splits = buildSplits();
    if (!validate(splits)) return;
    setSaving(true);
    try {
      await writeSplitPayment({
        accountId: selectedAccount as Id<"accounts">,
        payee,
        date,
        reference: reference || undefined,
        memo: memo || undefined,
        vendorId: vendorId !== "none" ? vendorId as Id<"vendors"> : undefined,
        splits,
      });
      toast.success(`Split payment of ${fmt(total)} recorded`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record split payment");
    } finally {
      setSaving(false);
    }
  };

  const handleWriteCheck = async () => {
    const splits = buildSplits();
    if (!validate(splits)) return;
    if (!checkNumber) { toast.error("Enter a check number to write a split check"); return; }
    setSaving(true);
    try {
      await writeSplitCheck({
        accountId: selectedAccount as Id<"accounts">,
        payee,
        checkNumber,
        date,
        memo: memo || undefined,
        vendorId: vendorId !== "none" ? vendorId as Id<"vendors"> : undefined,
        splits,
      });
      toast.success(`Split check #${checkNumber} for ${fmt(total)} written`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to write split check");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Split className="w-5 h-5" /> Split Payment</DialogTitle>
          <DialogDescription>Split one bank payment or check across multiple expense accounts</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Bank Account *</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select account..." /></SelectTrigger>
                <SelectContent>
                  {(bankAccounts ?? []).map((acc) => (
                    <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                      {acc.name} ({acc.subType ?? acc.type}) · {fmt(acc.balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payee *</Label>
              <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Who is being paid" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Check Number</Label>
              <Input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="Required for split check" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional..." />
            </div>
            <div className="space-y-2">
              <Label>Vendor (Optional)</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {vendors?.map((vendor) => (
                    <SelectItem key={vendor._id} value={vendor._id} className="cursor-pointer">{vendor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Memo</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional memo..." />
          </div>

          {/* Split Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Split Lines *</Label>
              <Button type="button" size="sm" variant="secondary" onClick={addLine} className="cursor-pointer">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
              </Button>
            </div>
            {expenseAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground">No expense accounts found. Create some in Chart of Accounts.</p>
            )}
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 rounded border">
                  <div className="flex-1 space-y-2">
                    <Select value={line.accountId} onValueChange={(v) => updateLine(idx, "accountId", v)}>
                      <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Expense account..." /></SelectTrigger>
                      <SelectContent>
                        {expenseAccounts.map((acc) => (
                          <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                            {acc.code} — {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                      placeholder="Description (optional)"
                    />
                  </div>
                  <div className="w-28 space-y-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={line.amount}
                      onChange={(e) => updateLine(idx, "amount", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    className="cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="p-3 rounded bg-primary/10 flex justify-between items-center">
            <span className="font-medium">Total</span>
            <span className="text-lg font-bold">{fmt(total)}</span>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button variant="secondary" onClick={handleWriteCheck} disabled={saving} className="cursor-pointer">
            <FileCheck className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Write Split Check"}
          </Button>
          <Button onClick={handleRecordPayment} disabled={saving} className="cursor-pointer">
            <Split className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Record Split Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Operations Tab ────────────────────────────────────────────────────

export default function BankOperationsTab() {
  const { fmt } = useCurrency();
  const operations = useQuery(api.bankingOperations.listBankOperations, {});
  const pettyCashBalance = useQuery(api.bankingOperations.getPettyCashBalance, {});

  const [showWriteCheck, setShowWriteCheck] = useState(false);
  const [showRecordExpense, setShowRecordExpense] = useState(false);
  const [showPettyCash, setShowPettyCash] = useState(false);
  const [showMakePayment, setShowMakePayment] = useState(false);
  const [showReplenish, setShowReplenish] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showSplitPayment, setShowSplitPayment] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const filteredOps = operations?.filter((op) => {
    if (filterType === "all") return true;
    if (filterType === "check") return op.description.startsWith("Check #");
    if (filterType === "expense") return op.description.startsWith("Expense:");
    if (filterType === "payment") return op.description.startsWith("Payment to");
    if (filterType === "petty_cash") return op.description.startsWith("Petty Cash:");
    return true;
  }) ?? [];

  return (
    <div className="space-y-5">
      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <Button onClick={() => setShowWriteCheck(true)} className="cursor-pointer h-auto py-4 flex-col gap-2">
          <FileCheck className="w-5 h-5" />
          <span className="text-xs">Write Check</span>
        </Button>
        <Button onClick={() => setShowRecordExpense(true)} variant="secondary" className="cursor-pointer h-auto py-4 flex-col gap-2">
          <Receipt className="w-5 h-5" />
          <span className="text-xs">Record Expense</span>
        </Button>
        <Button onClick={() => setShowMakePayment(true)} variant="secondary" className="cursor-pointer h-auto py-4 flex-col gap-2">
          <CreditCard className="w-5 h-5" />
          <span className="text-xs">Make Payment</span>
        </Button>
        <Button onClick={() => setShowDeposit(true)} variant="secondary" className="cursor-pointer h-auto py-4 flex-col gap-2">
          <ArrowUpRight className="w-5 h-5" />
          <span className="text-xs">Deposit to Bank</span>
        </Button>
        <Button onClick={() => setShowPettyCash(true)} variant="secondary" className="cursor-pointer h-auto py-4 flex-col gap-2">
          <Wallet className="w-5 h-5" />
          <span className="text-xs">Petty Cash Expense</span>
        </Button>
        <Button onClick={() => setShowReplenish(true)} variant="secondary" className="cursor-pointer h-auto py-4 flex-col gap-2">
          <RefreshCw className="w-5 h-5" />
          <span className="text-xs">Replenish Petty Cash</span>
        </Button>
        <Button onClick={() => setShowSplitPayment(true)} variant="secondary" className="cursor-pointer h-auto py-4 flex-col gap-2">
          <Split className="w-5 h-5" />
          <span className="text-xs">Split Payment</span>
        </Button>
      </div>

      {/* Petty Cash Balance Card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Petty Cash Fund Balance</p>
              <p className="text-2xl font-bold">{fmt(pettyCashBalance ?? 0)}</p>
            </div>
            <Wallet className="w-8 h-8 text-primary" />
          </div>
        </CardContent>
      </Card>

      {/* Recent Operations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Recent Banking Operations</h3>
          <Tabs value={filterType} onValueChange={setFilterType}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="cursor-pointer text-xs h-6">All</TabsTrigger>
              <TabsTrigger value="check" className="cursor-pointer text-xs h-6">Checks</TabsTrigger>
              <TabsTrigger value="expense" className="cursor-pointer text-xs h-6">Expenses</TabsTrigger>
              <TabsTrigger value="payment" className="cursor-pointer text-xs h-6">Payments</TabsTrigger>
              <TabsTrigger value="petty_cash" className="cursor-pointer text-xs h-6">Petty Cash</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {operations === undefined ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filteredOps.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Banknote /></EmptyMedia>
              <EmptyTitle>No operations yet</EmptyTitle>
              <EmptyDescription>Use the buttons above to write checks, record expenses, or make payments</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="border rounded-lg divide-y">
            {filteredOps.map((op) => {
              const isCheck = op.description.startsWith("Check #");
              const isExpense = op.description.startsWith("Expense:");
              const isPettyCash = op.description.startsWith("Petty Cash:");
              const isPayment = op.description.startsWith("Payment to");

              const icon = isCheck ? FileCheck : isExpense ? Receipt : isPettyCash ? Wallet : isPayment ? CreditCard : ArrowDownLeft;
              const badgeLabel = isCheck ? "Check" : isExpense ? "Expense" : isPettyCash ? "Petty Cash" : isPayment ? "Payment" : "Debit";
              const badgeColor = isCheck ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" :
                isExpense ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" :
                isPettyCash ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" :
                "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

              const Icon = icon;

              return (
                <div key={op._id} className="flex items-center gap-3 p-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{op.description}</p>
                      <Badge className={`text-[10px] ${badgeColor}`}>{badgeLabel}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {op.date}</span>
                      {op.reference && <span>Ref: {op.reference}</span>}
                      {op.category && <span>{op.category}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-red-600">-{fmt(op.amount)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showWriteCheck && <WriteCheckDialog onClose={() => setShowWriteCheck(false)} />}
      {showRecordExpense && <RecordExpenseDialog onClose={() => setShowRecordExpense(false)} />}
      {showPettyCash && <PettyCashExpenseDialog onClose={() => setShowPettyCash(false)} />}
      {showMakePayment && <MakePaymentDialog onClose={() => setShowMakePayment(false)} />}
      {showReplenish && <ReplenishPettyCashDialog onClose={() => setShowReplenish(false)} />}
      {showDeposit && <DepositToBankDialog onClose={() => setShowDeposit(false)} />}
      {showSplitPayment && <SplitPaymentDialog onClose={() => setShowSplitPayment(false)} />}
    </div>
  );
}
