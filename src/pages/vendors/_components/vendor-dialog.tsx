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

type PaymentTerms = "net_15" | "net_30" | "net_60" | "net_90" | "due_on_receipt" | "prepaid";

export default function VendorDialog({
  vendor,
  onClose,
}: {
  vendor?: Doc<"vendors">;
  onClose: () => void;
}) {
  const createVendor = useMutation(api.vendors.createVendor);
  const updateVendor = useMutation(api.vendors.updateVendor);
  const accounts = useQuery(api.accounting.listAccounts, {});

  // Contact tab
  const [name, setName] = useState(vendor?.name ?? "");
  const [companyName, setCompanyName] = useState(vendor?.companyName ?? "");
  const [contactName, setContactName] = useState(vendor?.contactName ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [mobile, setMobile] = useState(vendor?.mobile ?? "");
  const [fax, setFax] = useState(vendor?.fax ?? "");
  const [website, setWebsite] = useState(vendor?.website ?? "");

  // Address tab
  const [address, setAddress] = useState(vendor?.address ?? "");
  const [city, setCity] = useState(vendor?.city ?? "");
  const [state, setState] = useState(vendor?.state ?? "");
  const [zipCode, setZipCode] = useState(vendor?.zipCode ?? "");
  const [country, setCountry] = useState(vendor?.country ?? "");

  // Payment tab
  const [paymentTerms, setPaymentTerms] = useState<string>(vendor?.paymentTerms ?? "none");
  const [creditLimit, setCreditLimit] = useState(vendor?.creditLimit !== undefined ? String(vendor.creditLimit) : "");
  const [taxId, setTaxId] = useState(vendor?.taxId ?? "");

  // Opening Balance tab
  const [accountId, setAccountId] = useState<string>(vendor?.accountId ?? "none");
  const [openingBalance, setOpeningBalance] = useState(vendor?.openingBalance !== undefined ? String(vendor.openingBalance) : "");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(vendor?.openingBalanceDate ?? "");

  // Notes tab
  const [notes, setNotes] = useState(vendor?.notes ?? "");

  const [saving, setSaving] = useState(false);

  const payableAccounts = accounts?.filter((a) => a.type === "liability" || a.type === "expense") ?? [];

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Vendor name is required");
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        companyName: companyName.trim() || undefined,
        contactName: contactName.trim() || undefined,
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
        paymentTerms: paymentTerms !== "none" ? paymentTerms as PaymentTerms : undefined,
        creditLimit: creditLimit ? Number(creditLimit) : undefined,
        accountId: accountId !== "none" ? accountId as Id<"accounts"> : undefined,
        openingBalance: openingBalance ? Number(openingBalance) : undefined,
        openingBalanceDate: openingBalanceDate || undefined,
        notes: notes.trim() || undefined,
      };

      if (vendor) {
        await updateVendor({ vendorId: vendor._id, ...data });
        toast.success("Vendor updated");
      } else {
        await createVendor(data);
        toast.success("Vendor added");
      }
      onClose();
    } catch {
      toast.error("Failed to save vendor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit" : "Add"} Vendor</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="contact" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="contact" className="text-xs cursor-pointer">Contact</TabsTrigger>
            <TabsTrigger value="address" className="text-xs cursor-pointer">Address</TabsTrigger>
            <TabsTrigger value="payment" className="text-xs cursor-pointer">Payment & Terms</TabsTrigger>
            <TabsTrigger value="opening" className="text-xs cursor-pointer">Opening Balance</TabsTrigger>
            <TabsTrigger value="notes" className="text-xs cursor-pointer">Notes</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-1">
            <TabsContent value="contact" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vendor Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name" />
                </div>
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Contact Person</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Smith" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendor@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+974 1234 5678" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mobile</Label>
                  <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+974 5555 5555" />
                </div>
                <div className="space-y-2">
                  <Label>Fax</Label>
                  <Input value={fax} onChange={(e) => setFax(e.target.value)} placeholder="Fax number" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
              </div>
            </TabsContent>

            <TabsContent value="address" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>Street Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Vendor St" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Doha" />
                </div>
                <div className="space-y-2">
                  <Label>State / Province</Label>
                  <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Zip / Postal Code</Label>
                  <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="12345" />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <CountryPicker value={country} onChange={setCountry} placeholder="Select country" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="payment" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Terms</Label>
                  <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                    <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
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
                <div className="space-y-2">
                  <Label>Credit Limit</Label>
                  <Input type="number" min="0" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tax ID / VAT Number</Label>
                <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Tax registration number" />
              </div>
            </TabsContent>

            <TabsContent value="opening" className="mt-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                Set an opening balance for this vendor if you owe them money from a previous system.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Opening Balance</Label>
                  <Input type="number" min="0" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>As of Date</Label>
                  <Input type="date" value={openingBalanceDate} onChange={(e) => setOpeningBalanceDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Link to Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No account linked</SelectItem>
                    {payableAccounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.code} - {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Typically "Accounts Payable" for vendors</p>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>Internal Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Internal notes about this vendor..." />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
