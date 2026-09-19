import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import VendorDialog from "./_components/vendor-dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  Building, Plus, Pencil, Trash2, Receipt, DollarSign,
  AlertCircle, CheckCircle2, Clock, Phone, Mail, MapPin, User, TrendingDown, Link2, CreditCard, PackageCheck, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { LinkedEntityBadge, LinkVendorToCustomerDialog, RelationshipSummaryCard } from "@/components/entity-link.tsx";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import PayBillsTab, { PayBillDialog } from "./_components/pay-bills-tab.tsx";
import ReceiveItemsTab from "./_components/receive-items-tab.tsx";
import AdvancePaymentsTab from "@/components/advance-payments-tab.tsx";
import { useSearchParams } from "react-router-dom";
import { useFocusItem, focusElementId, FOCUS_RING_CLASS } from "@/hooks/use-focus-item.ts";
import AdminVoidDialog from "@/components/admin-void-dialog.tsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; icon: typeof Clock; class: string }> = {
  unpaid: { label: "Unpaid", icon: Clock, class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  paid: { label: "Paid", icon: CheckCircle2, class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  overdue: { label: "Overdue", icon: AlertCircle, class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  partially_paid: { label: "Partial", icon: Clock, class: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
};


// ── Vendor Dialog ──────────────────────────────────────────────────────────────

// ── Bill Dialog ────────────────────────────────────────────────────────────────

function BillDialog({ bill, vendorId, onClose }: { bill?: Doc<"bills">; vendorId?: Id<"vendors">; onClose: () => void }) {
  const vendors = useQuery(api.vendors.listVendors);
  const createBill = useMutation(api.vendors.createBill);
  const updateBill = useMutation(api.vendors.updateBill);
  const [selVendorId, setSelVendorId] = useState<string>(vendorId ?? bill?.vendorId ?? "none");
  const [title, setTitle] = useState(bill?.title ?? "");
  const [amount, setAmount] = useState(bill?.amount !== undefined ? String(bill.amount) : "");
  const [billDate, setBillDate] = useState(bill?.billDate ?? bill?.dueDate ?? new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? "");
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (selVendorId === "none") { toast.error("Select a vendor"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!billDate) { toast.error("Bill date is required"); return; }
    if (!dueDate) { toast.error("Due date is required"); return; }
    if (dueDate < billDate) { toast.error("The due date cannot be before the bill date"); return; }
    setSaving(true);
    try {
      const data = { vendorId: selVendorId as Id<"vendors">, title: title.trim(), amount: amt, billDate, dueDate, notes: notes.trim() || undefined };
      if (bill) { await updateBill({ billId: bill._id, ...data }); toast.success("Bill updated"); }
      else { await createBill(data); toast.success("Bill created"); }
      onClose();
    } catch (err) {
      const msg = (err as { data?: { message?: string } })?.data?.message;
      toast.error(msg ?? "Failed to save bill");
    }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{bill ? "Edit" : "Add"} Bill</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Vendor *</Label>
            <Select value={selVendorId} onValueChange={setSelVendorId}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select vendor...</SelectItem>
                {vendors?.filter((v) => v.isActive).map((v) => <SelectItem key={v._id} value={v._id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Invoice #001" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Amount *</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>Bill Date *</Label><Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Due Date *</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Expense Dialog ─────────────────────────────────────────────────────────────

function ExpenseDialog({ onClose }: { onClose: () => void }) {
  const vendors = useQuery(api.vendors.listVendors);
  const categories = useQuery(api.vendors.listExpenseCategoriesWithAccounts);
  const createExpense = useMutation(api.vendors.createExpense);
  const createCategory = useMutation(api.vendors.createExpenseCategory);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [vendorId, setVendorId] = useState("none");
  const [categoryId, setCategoryId] = useState("none");
  const [notes, setNotes] = useState("");
  const [newCat, setNewCat] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [postToLedger, setPostToLedger] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCategory = categories?.find((c) => c._id === categoryId);
  const categoryHasAccount = !!selectedCategory?.account;

  const handleAddCat = async () => {
    if (!newCat.trim()) return;
    try { await createCategory({ name: newCat.trim() }); setNewCat(""); setShowNewCat(false); toast.success("Category added"); }
    catch { toast.error("Failed to add category"); }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!date) { toast.error("Date is required"); return; }
    if (postToLedger && !categoryHasAccount) {
      toast.error("The selected category has no account mapped. Map an account in the Expense Categories section before posting to ledger.");
      return;
    }
    setSaving(true);
    try {
      await createExpense({
        title: title.trim(),
        amount: amt,
        date,
        vendorId: vendorId !== "none" ? vendorId as Id<"vendors"> : undefined,
        categoryId: categoryId !== "none" ? categoryId as Id<"expenseCategories"> : undefined,
        notes: notes.trim() || undefined,
        postToLedger: postToLedger || undefined,
      });
      toast.success(postToLedger ? "Expense logged and posted to ledger" : "Expense logged");
      onClose();
    } catch { toast.error("Failed to log expense"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log Expense</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2"><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Office supplies" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Amount *</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>Date *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Category</Label>
              <button className="text-xs text-primary underline cursor-pointer" onClick={() => setShowNewCat((v) => !v)}>{showNewCat ? "Cancel" : "+ New"}</button>
            </div>
            {showNewCat ? (
              <div className="flex gap-2"><Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category name" /><Button size="sm" onClick={handleAddCat}>Add</Button></div>
            ) : (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}{!c.account ? " ⚠" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedCategory && !categoryHasAccount && (
              <p className="text-xs text-amber-600 dark:text-amber-400">This category has no account mapped — it cannot be posted to the ledger.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Vendor (optional)</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {vendors?.filter((v) => v.isActive).map((v) => <SelectItem key={v._id} value={v._id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="post-to-ledger"
              checked={postToLedger}
              onChange={(e) => setPostToLedger(e.target.checked)}
              className="cursor-pointer"
              disabled={!!selectedCategory && !categoryHasAccount}
            />
            <Label htmlFor="post-to-ledger" className="cursor-pointer font-normal text-sm">
              Post to ledger {categoryHasAccount ? `(Dr ${selectedCategory?.account?.name})` : "(requires category with account)"}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Log Expense"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bills Tab ──────────────────────────────────────────────────────────────────

function BillsTab() {
  const { fmt } = useCurrency();
  const bills = useQuery(api.vendors.listBills, {});
  const updateBill = useMutation(api.vendors.updateBill);
  const deleteBill = useMutation(api.vendors.deleteBill);
  const adminVoidBill = useMutation(api.vendors.adminVoidPostedBill);
  const currentUser = useQuery(api.users.getCurrentUser);
  const { isFocused } = useFocusItem();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Doc<"bills"> | null>(null);
  const [adminVoidBillId, setAdminVoidBillId] = useState<string | null>(null);
  const [payingBill, setPayingBill] = useState<(Doc<"bills"> & { vendor: Doc<"vendors"> | null }) | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const canManage = currentUser?.role !== "staff";
  const isOwner = currentUser?.role === "owner";

  const markOverdue = async (bill: Doc<"bills">) => {
    try {
      await updateBill({ billId: bill._id, status: "overdue" });
      toast.success("Marked as overdue");
    } catch { toast.error("Failed to update"); }
  };

  const handleDelete = async (id: Id<"bills">) => {
    try { await deleteBill({ billId: id }); toast.success("Bill deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  type BillWithVendor = Doc<"bills"> & { vendor: Doc<"vendors"> | null };
  const filtered: BillWithVendor[] = (bills ?? []).filter((b) => filterStatus === "all" || b.status === filterStatus) as BillWithVendor[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {["all", "unpaid", "overdue", "partially_paid", "paid"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn("px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors",
                filterStatus === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              )}>{s === "partially_paid" ? "Partial" : s}</button>
          ))}
        </div>
        {canManage && <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Bill</Button>}
      </div>

      {bills === undefined ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
            <EmptyTitle>No bills {filterStatus !== "all" ? `with status "${filterStatus}"` : "yet"}</EmptyTitle>
            <EmptyDescription>Track what you owe to vendors</EmptyDescription>
          </EmptyHeader>
          {canManage && filterStatus === "all" && <EmptyContent><Button size="sm" onClick={() => setShowAdd(true)}>Add Bill</Button></EmptyContent>}
        </Empty>
      ) : (
        <div className="space-y-3">
          {filtered.map((bill) => {
            const cfg = statusConfig[bill.status];
            const Icon = cfg.icon;
            return (
              <Card key={bill._id} id={focusElementId(bill._id)} className={cn(isFocused(bill._id) && FOCUS_RING_CLASS)}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{bill.title}</p>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1", cfg.class)}>
                          <Icon className="w-3 h-3" />{cfg.label}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {bill.vendor?.name ?? "Unknown vendor"} · Due {new Date(bill.dueDate).toLocaleDateString()}
                        {bill.paidAt && ` · Paid ${new Date(bill.paidAt).toLocaleDateString()}`}
                      </p>
                      {bill.notes && <p className="text-xs text-muted-foreground mt-1">{bill.notes}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-lg">{fmt(bill.amount)}</p>
                      {canManage && (
                        <div className="flex gap-1 mt-1 justify-end">
                          {bill.status !== "paid" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => setPayingBill(bill)}>Pay Bill</Button>
                          )}
                          {bill.status === "unpaid" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => markOverdue(bill)}>Overdue</Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(bill)}><Pencil className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => handleDelete(bill._id)}><Trash2 className="w-3 h-3" /></Button>
                          {isOwner && bill.status !== "void" && (
                            <Button size="sm" variant="ghost" className="h-7 text-orange-600 cursor-pointer" title="Admin Void (Owner)" onClick={() => setAdminVoidBillId(bill._id)}>
                              <ShieldAlert className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showAdd && <BillDialog onClose={() => setShowAdd(false)} />}
      {editing && <BillDialog bill={editing} onClose={() => setEditing(null)} />}
      {adminVoidBillId && (
        <AdminVoidDialog
          isOpen
          onClose={() => setAdminVoidBillId(null)}
          title="Admin Void Bill"
          description="This will reverse all related ledger entries and mark the bill as void."
          confirmLabel="Void Bill"
          onConfirm={async (reason) => {
            await adminVoidBill({ billId: adminVoidBillId as Id<"bills">, reason });
            toast.success("Bill admin voided. Ledger entries reversed.");
            setAdminVoidBillId(null);
          }}
        />
      )}
      {payingBill && (
        <PayBillDialog
          bill={{
            _id: payingBill._id,
            title: payingBill.title,
            vendorId: payingBill.vendorId,
            vendorName: payingBill.vendor?.name ?? "Unknown vendor",
            amount: payingBill.amount,
            balance: payingBill.amount - (payingBill.amountPaid ?? 0),
            dueDate: payingBill.dueDate,
          }}
          onClose={() => setPayingBill(null)}
        />
      )}
    </div>
  );
}

// ── Expenses Tab ───────────────────────────────────────────────────────────────

function ExpensesTab() {
  const { fmt } = useCurrency();
  const expenses = useQuery(api.vendors.listExpenses, {});
  const categories = useQuery(api.vendors.listExpenseCategoriesWithAccounts);
  const deleteExpense = useMutation(api.vendors.deleteExpense);
  const updateCategory = useMutation(api.vendors.updateExpenseCategory);
  const currentUser = useQuery(api.users.getCurrentUser);
  const accounts = useQuery(api.accounting.listAccounts, { activeOnly: true });
  const { isFocused } = useFocusItem();
  const [showAdd, setShowAdd] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ _id: Id<"expenseCategories">; name: string; accountId?: Id<"accounts"> } | null>(null);
  const [catAccountId, setCatAccountId] = useState("none");

  const canManage = currentUser?.role !== "staff";
  const unmappedCount = (categories ?? []).filter((c) => !c.account).length;

  const expenseAccounts = (accounts ?? []).filter((a) => a.type === "expense" || a.type === "cost_of_goods_sold");

  const handleDelete = async (id: Id<"expenses">) => {
    try { await deleteExpense({ expenseId: id }); toast.success("Expense deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  const openEditCategory = (cat: { _id: Id<"expenseCategories">; name: string; accountId?: Id<"accounts"> }) => {
    setEditingCategory(cat);
    setCatAccountId(cat.accountId ?? "none");
  };

  const handleSaveCategory = async () => {
    if (!editingCategory) return;
    try {
      await updateCategory({
        categoryId: editingCategory._id,
        accountId: catAccountId !== "none" ? catAccountId as Id<"accounts"> : undefined,
      });
      toast.success("Category updated");
      setEditingCategory(null);
    } catch { toast.error("Failed to update category"); }
  };

  return (
    <div className="space-y-4">
      {/* Unmapped categories banner */}
      {unmappedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{unmappedCount} expense {unmappedCount === 1 ? "category has" : "categories have"} no account mapped — expenses in those categories cannot be posted to the ledger.</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Log Expense</Button>
      </div>

      {expenses === undefined ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : expenses.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingDown /></EmptyMedia>
            <EmptyTitle>No expenses yet</EmptyTitle>
            <EmptyDescription>Log business expenses to track spending</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" onClick={() => setShowAdd(true)}>Log Expense</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {expenses.map((exp) => (
            <div key={exp._id} id={focusElementId(exp._id)} className={cn("flex items-center gap-4 p-3 rounded-lg border bg-card", isFocused(exp._id) && FOCUS_RING_CLASS)}>
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingDown className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{exp.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(exp.date).toLocaleDateString()}
                  {exp.vendor && ` · ${exp.vendor.name}`}
                  {exp.category && ` · ${exp.category.name}`}
                  {exp.recordedByUser && ` · by ${exp.recordedByUser.name ?? "Unknown"}`}
                </p>
                {exp.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{exp.notes}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold">{fmt(exp.amount)}</p>
                {canManage && (
                  <Button size="sm" variant="ghost" className="h-6 text-destructive mt-0.5" onClick={() => handleDelete(exp._id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expense Categories account mapping */}
      {canManage && categories && categories.length > 0 && (
        <div className="border rounded-lg overflow-hidden mt-4">
          <div className="px-4 py-2.5 bg-muted/50 border-b">
            <p className="text-sm font-semibold">Expense Categories</p>
            <p className="text-xs text-muted-foreground">Map each category to a ledger account so expenses can be posted.</p>
          </div>
          <div className="divide-y">
            {categories.map((cat) => (
              <div key={cat._id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  {cat.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />}
                  <span className="text-sm font-medium">{cat.name}</span>
                  {!cat.account && (
                    <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 px-1.5 py-0.5 rounded font-medium">No account</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {cat.account && <span className="text-xs text-muted-foreground font-mono">{cat.account.name}</span>}
                  <Button size="sm" variant="ghost" className="h-7 cursor-pointer" onClick={() => openEditCategory(cat)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && <ExpenseDialog onClose={() => setShowAdd(false)} />}

      {/* Category account mapping dialog */}
      {editingCategory && (
        <Dialog open onOpenChange={() => setEditingCategory(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Map Account — {editingCategory.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Select the expense or cost-of-goods-sold account this category should post to.</p>
              <Select value={catAccountId} onValueChange={setCatAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No account (unposted)</SelectItem>
                  {expenseAccounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      <span className="font-mono text-xs mr-2">{a.code}</span>{a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditingCategory(null)}>Cancel</Button>
              <Button onClick={handleSaveCategory} className="cursor-pointer">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Vendors Tab ────────────────────────────────────────────────────────────────

function VendorsTab() {
  const vendors = useQuery(api.vendors.listVendors);
  const customers = useQuery(api.sales.listCustomers);
  const currentUser = useQuery(api.users.getCurrentUser);
  const { isFocused } = useFocusItem();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Doc<"vendors"> | null>(null);
  const [linkingVendor, setLinkingVendor] = useState<Doc<"vendors"> | null>(null);
  const [showRelationship, setShowRelationship] = useState<Id<"vendors"> | null>(null);

  const canManage = currentUser?.role !== "staff";

  // Build lookup of customer names for linked vendors
  const customerNameMap = new Map<string, string>();
  customers?.forEach((c) => {
    customerNameMap.set(c._id, c.name);
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage && <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Vendor</Button>}
      </div>

      {vendors === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : vendors.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Building /></EmptyMedia>
            <EmptyTitle>No vendors yet</EmptyTitle>
            <EmptyDescription>Add your suppliers, contractors, and service providers</EmptyDescription>
          </EmptyHeader>
          {canManage && <EmptyContent><Button size="sm" onClick={() => setShowAdd(true)}>Add Vendor</Button></EmptyContent>}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {vendors.map((v) => (
            <Card key={v._id} id={focusElementId(v._id)} className={cn(!v.isActive && "opacity-60", isFocused(v._id) && FOCUS_RING_CLASS)}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{v.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant={v.isActive ? "default" : "secondary"} className="text-xs">{v.isActive ? "Active" : "Inactive"}</Badge>
                      {v.linkedCustomerId && customerNameMap.get(v.linkedCustomerId) && (
                        <LinkedEntityBadge
                          type="vendor"
                          linkedName={customerNameMap.get(v.linkedCustomerId) ?? ""}
                          onViewLink={() => setShowRelationship(v._id)}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {canManage && !v.linkedCustomerId && (
                      <Button size="sm" variant="ghost" onClick={() => setLinkingVendor(v)} title="Link as Customer" className="cursor-pointer">
                        <Link2 className="w-3 h-3" />
                      </Button>
                    )}
                    {canManage && <Button size="sm" variant="ghost" onClick={() => setEditing(v)} className="cursor-pointer"><Pencil className="w-3 h-3" /></Button>}
                  </div>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {v.contactName && <p className="flex items-center gap-1.5"><User className="w-3 h-3" />{v.contactName}</p>}
                  {v.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{v.phone}</p>}
                  {v.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{v.email}</p>}
                  {v.address && <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3" />{v.address}</p>}
                </div>
                {v.notes && <p className="text-xs text-muted-foreground border-t pt-2">{v.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAdd && <VendorDialog onClose={() => setShowAdd(false)} />}
      {editing && <VendorDialog vendor={editing} onClose={() => setEditing(null)} />}
      {linkingVendor && (
        <LinkVendorToCustomerDialog
          vendorId={linkingVendor._id}
          vendorName={linkingVendor.name}
          onClose={() => setLinkingVendor(null)}
        />
      )}
      {showRelationship && (
        <Dialog open onOpenChange={() => setShowRelationship(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Entity Relationship</DialogTitle></DialogHeader>
            <RelationshipSummaryCard vendorId={showRelationship} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function VendorsPage() {
  const { fmt } = useCurrency();
  const summary = useQuery(api.vendors.getBillsAndExpenseSummary);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "bills";
  const setTab = (t: string) => setSearchParams({ tab: t });

  const statCards = [
    { label: "Unpaid Bills", value: summary ? fmt(summary.unpaidTotal) : "...", icon: Clock, color: "text-yellow-600" },
    { label: "Overdue Bills", value: summary ? String(summary.overdueCount) : "...", icon: AlertCircle, color: "text-red-500" },
    { label: "Bills Paid", value: summary ? fmt(summary.paidTotal) : "...", icon: CheckCircle2, color: "text-green-600" },
    { label: "Total Expenses", value: summary ? fmt(summary.totalExpenses) : "...", icon: TrendingDown, color: "text-primary" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6" />Vendors & Bills</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage suppliers, bills, and expenses</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                  <p className="text-xl font-bold mt-0.5 break-words leading-tight">{summary === undefined ? <Skeleton className="h-6 w-16 mt-1" /> : value}</p>
                </div>
                <div className={cn("p-2 rounded-lg bg-muted flex-shrink-0", color)}><Icon className="w-4 h-4" /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="bills" className="flex items-center gap-2"><Receipt className="w-4 h-4" />Bills</TabsTrigger>
          <TabsTrigger value="receive" className="flex items-center gap-2"><PackageCheck className="w-4 h-4" />Receive Items</TabsTrigger>
          <TabsTrigger value="advances" className="flex items-center gap-2"><DollarSign className="w-4 h-4" />Advances</TabsTrigger>
          <TabsTrigger value="pay-bills" className="flex items-center gap-2"><CreditCard className="w-4 h-4" />Pay Bills</TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-2"><TrendingDown className="w-4 h-4" />Expenses</TabsTrigger>
          <TabsTrigger value="vendors" className="flex items-center gap-2"><Building className="w-4 h-4" />Vendors</TabsTrigger>
        </TabsList>
        <TabsContent value="bills" className="mt-4"><BillsTab /></TabsContent>
        <TabsContent value="receive" className="mt-4"><ReceiveItemsTab /></TabsContent>
        <TabsContent value="advances" className="mt-4"><AdvancePaymentsTab direction="vendor" /></TabsContent>
        <TabsContent value="pay-bills" className="mt-4"><PayBillsTab /></TabsContent>
        <TabsContent value="expenses" className="mt-4"><ExpensesTab /></TabsContent>
        <TabsContent value="vendors" className="mt-4"><VendorsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
