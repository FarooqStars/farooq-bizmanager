import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";

// Full account types matching QuickBooks Enterprise
const ACCOUNT_TYPES = [
  // Assets
  { value: "bank", label: "Bank", category: "Assets" },
  { value: "accounts_receivable", label: "Accounts Receivable", category: "Assets" },
  { value: "other_current_asset", label: "Other Current Asset", category: "Assets" },
  { value: "fixed_asset", label: "Fixed Asset", category: "Assets" },
  { value: "other_asset", label: "Other Asset", category: "Assets" },
  // Liabilities
  { value: "accounts_payable", label: "Accounts Payable", category: "Liabilities" },
  { value: "credit_card", label: "Credit Card", category: "Liabilities" },
  { value: "other_current_liability", label: "Other Current Liability", category: "Liabilities" },
  { value: "long_term_liability", label: "Long Term Liability", category: "Liabilities" },
  { value: "loan", label: "Loan", category: "Liabilities" },
  // Equity
  { value: "equity", label: "Equity", category: "Equity" },
  // Income
  { value: "income", label: "Income", category: "Income" },
  { value: "other_income", label: "Other Income", category: "Income" },
  // Cost of Goods Sold
  { value: "cost_of_goods_sold", label: "Cost of Goods Sold", category: "Cost of Goods Sold" },
  // Expense
  { value: "expense", label: "Expense", category: "Expense" },
  { value: "other_expense", label: "Other Expense", category: "Expense" },
] as const;

type AccountTypeValue = typeof ACCOUNT_TYPES[number]["value"];

// Sub-types for each account type
const SUB_TYPES: Record<string, string[]> = {
  bank: ["Checking", "Savings", "Cash", "Money Market", "Petty Cash"],
  accounts_receivable: ["Trade Receivables", "Employee Advances", "Other Receivables"],
  other_current_asset: ["Inventory", "Prepaid", "Short-term Investments", "Security Deposits", "Other"],
  fixed_asset: ["Property & Equipment", "Furniture", "Vehicles", "Land", "Buildings", "Leasehold Improvements", "Depreciation"],
  other_asset: ["Intangible Assets", "Goodwill", "Long-term Investments", "Other"],
  accounts_payable: ["Trade Payables", "Other Payables"],
  credit_card: ["Credit Card", "Corporate Card"],
  other_current_liability: ["Accruals", "Payroll", "Taxes", "Customer Deposits", "Deferred Revenue", "Other"],
  long_term_liability: ["Notes Payable", "Bonds Payable", "Deferred Tax", "Other"],
  loan: ["Short-term", "Long-term", "Mortgage", "Line of Credit", "Vehicle Loan", "Equipment Loan"],
  equity: ["Equity", "Retained Earnings", "Drawings", "Opening Balance Equity", "Shareholder Capital"],
  income: ["Sales", "Services", "Discounts", "Returns & Allowances", "Shipping Income"],
  other_income: ["Interest", "Dividends", "Gain on Sale", "Rental Income", "Miscellaneous"],
  cost_of_goods_sold: ["Materials", "Purchases", "Direct Labor", "Shipping", "Subcontractors", "Freight"],
  expense: ["Payroll", "Occupancy", "Utilities", "Office", "Depreciation", "Insurance", "Marketing", "Vehicle", "Bank Fees", "Professional Fees", "Travel", "Meals", "Repairs", "Telephone", "Internet"],
  other_expense: ["Interest", "Penalties", "Losses", "Amortization", "Miscellaneous"],
};

const accountSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Account type is required"),
  subType: z.string().optional(),
  parentId: z.string().optional(),
  description: z.string().optional(),
  openingBalance: z.number().optional(),
});

type AccountFormData = z.infer<typeof accountSchema>;

type Props = {
  account?: Doc<"accounts"> | null;
  defaultParentId?: string;
  defaultType?: string;
  onClose: () => void;
};

export default function AccountFormDialog({ account, defaultParentId, defaultType, onClose }: Props) {
  const { fmt } = useCurrency();
  const createAccount = useMutation(api.accounting.createAccount);
  const updateAccount = useMutation(api.accounting.updateAccount);
  const accounts = useQuery(api.accounting.listAccounts, {});
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      code: account?.code ?? "",
      name: account?.name ?? "",
      type: account?.type ?? defaultType ?? "bank",
      subType: account?.subType ?? "",
      parentId: account?.parentId ?? defaultParentId ?? "",
      description: account?.description ?? "",
      openingBalance: account?.balance ?? 0,
    },
  });

  const currentType = watch("type");

  // Group account types by category for the dropdown
  const categories = [...new Set(ACCOUNT_TYPES.map((t) => t.category))];

  const onSubmit = async (data: AccountFormData) => {
    setSaving(true);
    try {
      if (account) {
        await updateAccount({
          id: account._id,
          name: data.name,
          type: data.type as AccountTypeValue,
          subType: data.subType || undefined,
          parentId: (data.parentId || undefined) as Id<"accounts"> | undefined,
          description: data.description || undefined,
        });
        toast.success("Account updated");
      } else {
        await createAccount({
          code: data.code,
          name: data.name,
          type: data.type as AccountTypeValue,
          subType: data.subType || undefined,
          parentId: (data.parentId || undefined) as Id<"accounts"> | undefined,
          description: data.description || undefined,
          openingBalance: data.openingBalance || undefined,
        });
        toast.success("Account created");
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? "Edit Account" : "New Account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Account Code *</Label>
              <Input {...register("code")} placeholder="1000" disabled={!!account} />
              {errors.code && <p className="text-xs text-destructive mt-1">{errors.code.message}</p>}
            </div>
            <div>
              <Label>Account Type *</Label>
              <Select value={watch("type")} onValueChange={(v) => { setValue("type", v); setValue("subType", ""); }}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {categories.map((cat) => (
                    <div key={cat}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {cat}
                      </div>
                      {ACCOUNT_TYPES.filter((t) => t.category === cat).map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                      <Separator className="my-1" />
                    </div>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-xs text-destructive mt-1">{errors.type.message}</p>}
            </div>
          </div>

          <div>
            <Label>Account Name *</Label>
            <Input {...register("name")} placeholder="Cash in Bank" />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <Label>Detail Type</Label>
            <Select value={watch("subType") ?? ""} onValueChange={(v) => setValue("subType", v)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Select detail type" />
              </SelectTrigger>
              <SelectContent>
                {(SUB_TYPES[currentType] ?? []).map((st) => (
                  <SelectItem key={st} value={st}>{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Categorize this account further</p>
          </div>

          <div>
            <Label>Parent Account (optional)</Label>
            <Select value={watch("parentId") ?? ""} onValueChange={(v) => setValue("parentId", v === "none" ? "" : v)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="No parent (top-level)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No parent (top-level)</SelectItem>
                {accounts?.filter((a) => a._id !== account?._id).map((a) => (
                  <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Move this account under another account as a sub-account</p>
          </div>

          {!account && (
            <div>
              <Label>Opening Balance</Label>
              <Input type="number" step="0.01" {...register("openingBalance", { valueAsNumber: true })} placeholder="0.00" />
            </div>
          )}

          <div>
            <Label>Description</Label>
            <Textarea {...register("description")} placeholder="Optional description..." rows={2} />
          </div>

          {accounts && accounts.length > 0 && (
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <p>{accounts.length} accounts in system</p>
              <p className="mt-1">
                Suggested next code: {
                  (() => {
                    const sameType = accounts.filter((a) => a.type === currentType);
                    if (sameType.length === 0) return "—";
                    const maxCode = Math.max(...sameType.map((a) => parseInt(a.code) || 0));
                    return maxCode + 10;
                  })()
                }
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
            <Button type="submit" disabled={saving} className="cursor-pointer">
              {saving ? "Saving..." : account ? "Update" : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
