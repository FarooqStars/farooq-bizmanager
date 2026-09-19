import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Link2, Unlink, ArrowRight, Building, TrendingUp, TrendingDown, Equal } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

// ─── Relationship Badge ─────────────────────────────────────

export function LinkedEntityBadge({
  type,
  linkedName,
  onViewLink,
}: {
  type: "customer" | "vendor";
  linkedName: string;
  onViewLink: () => void;
}) {
  return (
    <Badge
      variant="secondary"
      className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 cursor-pointer gap-1"
      onClick={onViewLink}
    >
      <Link2 className="w-3 h-3" />
      Also {type === "customer" ? "Vendor" : "Customer"}: {linkedName}
    </Badge>
  );
}

// ─── Relationship Summary Card ──────────────────────────────

export function RelationshipSummaryCard({
  customerId,
  vendorId,
  onUnlink,
}: {
  customerId?: Id<"customers">;
  vendorId?: Id<"vendors">;
  onUnlink?: () => void;
}) {
  const summary = useQuery(
    api.entityLinks.getRelationshipSummary,
    customerId ? { customerId } : vendorId ? { vendorId } : "skip"
  );

  const { fmt } = useCurrency();

  if (!summary) return null;

  return (
    <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-900 dark:text-purple-300">Linked Entity Relationship</span>
          </div>
          {onUnlink && (
            <Button variant="ghost" size="sm" onClick={onUnlink} className="cursor-pointer text-xs text-muted-foreground hover:text-destructive">
              <Unlink className="w-3 h-3 mr-1" /> Unlink
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 text-sm">
          {/* Customer side */}
          <div className="text-center flex-1">
            <p className="text-muted-foreground text-xs mb-1">Customer (AR)</p>
            <p className="font-mono font-bold text-green-600">{fmt(summary.arBalance)}</p>
            <p className="text-xs text-muted-foreground">They owe you</p>
          </div>

          {/* Net indicator */}
          <div className="flex flex-col items-center gap-1">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-1">
              {summary.netFavor === "ours" && <TrendingUp className="w-3 h-3 text-green-600" />}
              {summary.netFavor === "theirs" && <TrendingDown className="w-3 h-3 text-red-600" />}
              {summary.netFavor === "even" && <Equal className="w-3 h-3 text-muted-foreground" />}
              <span className={`text-xs font-medium ${
                summary.netFavor === "ours" ? "text-green-600" :
                summary.netFavor === "theirs" ? "text-red-600" : "text-muted-foreground"
              }`}>
                Net: {fmt(Math.abs(summary.netBalance))}
                {summary.netFavor === "ours" ? " (your favor)" : summary.netFavor === "theirs" ? " (their favor)" : " (even)"}
              </span>
            </div>
          </div>

          {/* Vendor side */}
          <div className="text-center flex-1">
            <p className="text-muted-foreground text-xs mb-1">Vendor (AP)</p>
            <p className="font-mono font-bold text-red-600">{fmt(summary.apBalance)}</p>
            <p className="text-xs text-muted-foreground">You owe them</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Link Dialog (from Customer) ────────────────────────────

export function LinkCustomerToVendorDialog({
  customerId,
  customerName,
  onClose,
}: {
  customerId: Id<"customers">;
  customerName: string;
  onClose: () => void;
}) {
  const vendors = useQuery(api.vendors.listVendors);
  const linkMutation = useMutation(api.entityLinks.linkCustomerVendor);
  const createAsVendor = useMutation(api.entityLinks.createCustomerAsVendor);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"link" | "create">("link");

  const availableVendors = vendors?.filter((v) => !v.linkedCustomerId) ?? [];

  const handleLink = async () => {
    if (!selectedVendorId) {
      toast.error("Please select a vendor");
      return;
    }
    setSaving(true);
    try {
      await linkMutation({ customerId, vendorId: selectedVendorId as Id<"vendors"> });
      toast.success("Customer linked to vendor");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to link";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAsVendor = async () => {
    setSaving(true);
    try {
      await createAsVendor({ customerId });
      toast.success(`${customerName} also added as a vendor`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create vendor";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-purple-600" /> Link as Vendor
          </DialogTitle>
          <DialogDescription>
            Link <strong>{customerName}</strong> to an existing vendor or create them as a new vendor. Finances stay separate (AR vs AP).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button
              variant={mode === "link" ? "default" : "secondary"}
              size="sm"
              onClick={() => setMode("link")}
              className="cursor-pointer flex-1"
            >
              Link to Existing
            </Button>
            <Button
              variant={mode === "create" ? "default" : "secondary"}
              size="sm"
              onClick={() => setMode("create")}
              className="cursor-pointer flex-1"
            >
              Create as New Vendor
            </Button>
          </div>

          {mode === "link" ? (
            <div className="space-y-2">
              <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select an existing vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {availableVendors.map((v) => (
                    <SelectItem key={v._id} value={v._id} className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Building className="w-3 h-3" />
                        {v.name}{v.companyName ? ` (${v.companyName})` : ""}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableVendors.length === 0 && (
                <p className="text-xs text-muted-foreground">No unlinked vendors available. Use "Create as New Vendor" instead.</p>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
              <p>This will create a new vendor record with the same contact info as <strong>{customerName}</strong>.</p>
              <p className="text-muted-foreground text-xs">You can update the vendor details separately afterwards.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button
            onClick={mode === "link" ? handleLink : handleCreateAsVendor}
            disabled={saving || (mode === "link" && !selectedVendorId)}
            className="cursor-pointer"
          >
            {saving ? "Saving..." : mode === "link" ? "Link Vendor" : "Create & Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link Dialog (from Vendor) ──────────────────────────────

export function LinkVendorToCustomerDialog({
  vendorId,
  vendorName,
  onClose,
}: {
  vendorId: Id<"vendors">;
  vendorName: string;
  onClose: () => void;
}) {
  const customers = useQuery(api.sales.listCustomers);
  const linkMutation = useMutation(api.entityLinks.linkCustomerVendor);
  const createAsCustomer = useMutation(api.entityLinks.createVendorAsCustomer);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"link" | "create">("link");

  const availableCustomers = customers?.filter((c) => !c.linkedVendorId) ?? [];

  const handleLink = async () => {
    if (!selectedCustomerId) {
      toast.error("Please select a customer");
      return;
    }
    setSaving(true);
    try {
      await linkMutation({ customerId: selectedCustomerId as Id<"customers">, vendorId });
      toast.success("Vendor linked to customer");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to link";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAsCustomer = async () => {
    setSaving(true);
    try {
      await createAsCustomer({ vendorId });
      toast.success(`${vendorName} also added as a customer`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create customer";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-purple-600" /> Link as Customer
          </DialogTitle>
          <DialogDescription>
            Link <strong>{vendorName}</strong> to an existing customer or create them as a new customer. Finances stay separate (AR vs AP).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button
              variant={mode === "link" ? "default" : "secondary"}
              size="sm"
              onClick={() => setMode("link")}
              className="cursor-pointer flex-1"
            >
              Link to Existing
            </Button>
            <Button
              variant={mode === "create" ? "default" : "secondary"}
              size="sm"
              onClick={() => setMode("create")}
              className="cursor-pointer flex-1"
            >
              Create as New Customer
            </Button>
          </div>

          {mode === "link" ? (
            <div className="space-y-2">
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select an existing customer..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCustomers.map((c) => (
                    <SelectItem key={c._id} value={c._id} className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Building className="w-3 h-3" />
                        {c.name}{c.companyName ? ` (${c.companyName})` : ""}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableCustomers.length === 0 && (
                <p className="text-xs text-muted-foreground">No unlinked customers available. Use "Create as New Customer" instead.</p>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
              <p>This will create a new customer record with the same contact info as <strong>{vendorName}</strong>.</p>
              <p className="text-muted-foreground text-xs">You can update the customer details separately afterwards.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button
            onClick={mode === "link" ? handleLink : handleCreateAsCustomer}
            disabled={saving || (mode === "link" && !selectedCustomerId)}
            className="cursor-pointer"
          >
            {saving ? "Saving..." : mode === "link" ? "Link Customer" : "Create & Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
