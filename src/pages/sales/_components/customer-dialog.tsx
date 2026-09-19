import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import CountryPicker from "@/components/country-picker.tsx";
import { toast } from "sonner";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { PencilIcon } from "lucide-react";

type PaymentTerms = "net_15" | "net_30" | "net_60" | "net_90" | "due_on_receipt" | "prepaid";
type Tier = "retail" | "wholesale" | "vip" | "distributor";

// ─── Change Credit Limit sub-dialog ──────────────────────────────────────────
// This is the ONLY place credit limits are changed. It calls updateCustomerCreditLimit
// which writes a creditLimitHistory row and an audit entry.

function ChangeCreditLimitDialog({
  customer,
  onClose,
}: {
  customer: Doc<"customers">;
  onClose: () => void;
}) {
  const updateLimit = useMutation(api.sales.updateCustomerCreditLimit);
  const [newLimit, setNewLimit] = useState(
    customer.creditLimit !== undefined ? String(customer.creditLimit) : "",
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!reason.trim()) {
      toast.error("A reason is required to change the credit limit");
      return;
    }
    setSaving(true);
    try {
      await updateLimit({
        customerId: customer._id,
        newLimit: newLimit.trim() !== "" ? Number(newLimit) : undefined,
        reason: reason.trim(),
      });
      toast.success("Credit limit updated");
      onClose();
    } catch {
      toast.error("Failed to update credit limit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Credit Limit — {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Current limit</Label>
            <p className="text-sm text-muted-foreground">
              {customer.creditLimit !== undefined
                ? customer.creditLimit.toLocaleString()
                : "No limit set"}
            </p>
          </div>
          <div className="space-y-2">
            <Label>New limit</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder="Leave blank to remove limit"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to remove the limit entirely (no restriction).
            </p>
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is the limit being changed?"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !reason.trim()} className="cursor-pointer">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Change Credit Status sub-dialog ─────────────────────────────────────────
// Owner-only. Calls updateCustomerCreditStatus which is the ONE path to write
// customers.creditStatus (via setCustomerCreditStatusInternal helper).

type CreditStatus = "active" | "watch" | "hold" | "blacklisted";

const CREDIT_STATUS_LABELS: Record<CreditStatus, string> = {
  active: "Active",
  watch: "Watch",
  hold: "Credit Hold",
  blacklisted: "Blacklisted",
};

export function CreditStatusBadge({ status }: { status?: string }) {
  const s = (status ?? "active") as CreditStatus;
  const colors: Record<CreditStatus, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    watch: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    hold: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    blacklisted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[s]}`}>
      {CREDIT_STATUS_LABELS[s]}
    </span>
  );
}

function ChangeCreditStatusDialog({
  customer,
  onClose,
}: {
  customer: Doc<"customers">;
  onClose: () => void;
}) {
  const [newStatus, setNewStatus] = useState<CreditStatus>(
    (customer.creditStatus as CreditStatus | undefined) ?? "active",
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const updateStatus = useMutation(api.sales.updateCustomerCreditStatus);

  const handleSave = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await updateStatus({
        customerId: customer._id,
        newStatus,
        reason: reason.trim(),
      });
      toast.success("Credit status updated");
      onClose();
    } catch {
      toast.error("Failed to update credit status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Credit Status — {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>New Status</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as CreditStatus)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="watch">Watch (informational, does not block sales)</SelectItem>
                <SelectItem value="hold">Credit Hold (blocks credit sales)</SelectItem>
                <SelectItem value="blacklisted">Blacklisted (blocks credit sales)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is the status being changed?"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !reason.trim()} className="cursor-pointer">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main customer dialog ─────────────────────────────────────────────────────

export default function CustomerDialog({
  customer,
  onClose,
}: {
  customer?: Doc<"customers">;
  onClose: () => void;
}) {
  const createCustomer = useMutation(api.sales.createCustomer);
  const updateCustomer = useMutation(api.sales.updateCustomer);
  const accounts = useQuery(api.accounting.listAccounts, {});

  // Contact tab
  const [name, setName] = useState(customer?.name ?? "");
  const [companyName, setCompanyName] = useState(customer?.companyName ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [mobile, setMobile] = useState(customer?.mobile ?? "");
  const [fax, setFax] = useState(customer?.fax ?? "");
  const [website, setWebsite] = useState(customer?.website ?? "");

  // Address tab
  const [address, setAddress] = useState(customer?.address ?? "");
  const [city, setCity] = useState(customer?.city ?? "");
  const [state, setState] = useState(customer?.state ?? "");
  const [zipCode, setZipCode] = useState(customer?.zipCode ?? "");
  const [country, setCountry] = useState(customer?.country ?? "");

  // Payment tab
  const [tier, setTier] = useState<string>(customer?.tier ?? "none");
  const [paymentTerms, setPaymentTerms] = useState<string>(customer?.paymentTerms ?? "none");
  const [taxId, setTaxId] = useState(customer?.taxId ?? "");

  // Opening Balance tab
  const [accountId, setAccountId] = useState<string>(customer?.accountId ?? "none");
  const [openingBalance, setOpeningBalance] = useState(
    customer?.openingBalance !== undefined ? String(customer.openingBalance) : "",
  );
  const [openingBalanceDate, setOpeningBalanceDate] = useState(
    customer?.openingBalanceDate ?? "",
  );

  // Notes tab
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  const currentUser = useQuery(api.users.getCurrentUser);
  const isOwner = currentUser?.role === "owner";

  const receivableAccounts =
    accounts?.filter((a) => a.type === "asset" || a.type === "revenue") ?? [];

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        companyName: companyName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        mobile: mobile.trim() || undefined,
        fax: fax.trim() || undefined,
        website: website.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
        country: country.trim() || undefined,
        taxId: taxId.trim() || undefined,
        paymentTerms: paymentTerms !== "none" ? (paymentTerms as PaymentTerms) : undefined,
        // creditLimit is NOT included here. Use the "Change Credit Limit" button
        // which routes through updateCustomerCreditLimit (owner-only, audited).
        tier: tier !== "none" ? (tier as Tier) : undefined,
        accountId: accountId !== "none" ? (accountId as Id<"accounts">) : undefined,
        openingBalance: openingBalance ? Number(openingBalance) : undefined,
        openingBalanceDate: openingBalanceDate || undefined,
        notes: notes.trim() || undefined,
      };

      if (customer) {
        await updateCustomer({ customerId: customer._id, ...data });
        toast.success("Customer updated");
      } else {
        await createCustomer(data);
        toast.success("Customer added");
      }
      onClose();
    } catch {
      toast.error("Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{customer ? "Edit" : "Add"} Customer</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="contact" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="contact" className="text-xs cursor-pointer">
                Contact
              </TabsTrigger>
              <TabsTrigger value="address" className="text-xs cursor-pointer">
                Address
              </TabsTrigger>
              <TabsTrigger value="payment" className="text-xs cursor-pointer">
                Payment & Terms
              </TabsTrigger>
              <TabsTrigger value="opening" className="text-xs cursor-pointer">
                Opening Balance
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-xs cursor-pointer">
                Notes
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4 pr-1">
              <TabsContent value="contact" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Company name"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+974 1234 5678"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Mobile</Label>
                    <Input
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="+974 5555 5555"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fax</Label>
                    <Input
                      value={fax}
                      onChange={(e) => setFax(e.target.value)}
                      placeholder="Fax number"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
              </TabsContent>

              <TabsContent value="address" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <Label>Street Address</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main Street"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Doha"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State / Province</Label>
                    <Input
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Zip / Postal Code</Label>
                    <Input
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="12345"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <CountryPicker
                      value={country}
                      onChange={setCountry}
                      placeholder="Select country"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="payment" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer Tier</Label>
                    <Select value={tier} onValueChange={setTier}>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="wholesale">Wholesale</SelectItem>
                        <SelectItem value="vip">VIP</SelectItem>
                        <SelectItem value="distributor">Distributor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Terms</Label>
                    <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                      <SelectTrigger className="cursor-pointer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                        <SelectItem value="net_15">Net 15</SelectItem>
                        <SelectItem value="net_30">Net 30</SelectItem>
                        <SelectItem value="net_60">Net 60</SelectItem>
                        <SelectItem value="net_90">Net 90</SelectItem>
                        <SelectItem value="prepaid">Prepaid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {/* Credit limit is read-only here. Changes go through the
                      audited updateCustomerCreditLimit mutation (owner-only). */}
                  <div className="space-y-2">
                    <Label>Credit Limit</Label>
                    {customer ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {customer.creditLimit !== undefined
                            ? customer.creditLimit.toLocaleString()
                            : "No limit"}
                        </span>
                        {isOwner && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 cursor-pointer"
                            onClick={() => setShowLimitDialog(true)}
                          >
                            <PencilIcon className="h-3 w-3 mr-1" />
                            Change
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Save the customer first, then set a credit limit from the edit dialog.
                      </p>
                    )}
                  </div>
                  {/* Credit status is read-only here. Changes go through
                      updateCustomerCreditStatus (owner-only, audited). */}
                  <div className="space-y-2">
                    <Label>Credit Status</Label>
                    {customer ? (
                      <div className="flex items-center gap-2">
                        <CreditStatusBadge status={customer.creditStatus} />
                        {isOwner && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 cursor-pointer"
                            onClick={() => setShowStatusDialog(true)}
                          >
                            <PencilIcon className="h-3 w-3 mr-1" />
                            Change
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Save the customer first, then set credit status from the edit dialog.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tax ID / VAT Number</Label>
                    <Input
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      placeholder="Tax ID"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="opening" className="mt-0 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Set an opening balance for this customer if they have an outstanding balance
                  from a previous system.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Opening Balance</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>As of Date</Label>
                    <Input
                      type="date"
                      value={openingBalanceDate}
                      onChange={(e) => setOpeningBalanceDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Link to Account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No account linked</SelectItem>
                      {receivableAccounts.map((a) => (
                        <SelectItem key={a._id} value={a._id}>
                          {a.code} - {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Typically "Accounts Receivable" for customers
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <Label>Internal Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    placeholder="Internal notes about this customer..."
                  />
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="secondary" onClick={onClose} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showLimitDialog && customer && (
        <ChangeCreditLimitDialog
          customer={customer}
          onClose={() => setShowLimitDialog(false)}
        />
      )}
      {showStatusDialog && customer && (
        <ChangeCreditStatusDialog
          customer={customer}
          onClose={() => setShowStatusDialog(false)}
        />
      )}
    </>
  );
}
