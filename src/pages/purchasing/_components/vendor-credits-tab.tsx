import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, TicketMinus, Ban } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useCurrency } from "@/hooks/use-currency.ts";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  applied: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  void: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function VendorCreditsTab() {
  const credits = useQuery(api.purchasing.listVendorCredits, {});
  const vendors = useQuery(api.vendors.listVendors, {});
  const createCredit = useMutation(api.purchasing.createVendorCredit);
  const voidCredit = useMutation(api.purchasing.voidVendorCredit);

  const { fmt } = useCurrency();
  const [showCreate, setShowCreate] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [creditDate, setCreditDate] = useState(format(new Date(), "yyyy-MM-dd"));

  if (!credits || !vendors) return <Skeleton className="h-40 w-full" />;

  const handleCreate = async () => {
    if (!vendorId) { toast.error("Select a vendor"); return; }
    if (!amount || parseFloat(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    if (!reason.trim()) { toast.error("Enter a reason"); return; }

    try {
      await createCredit({
        vendorId: vendorId as Id<"vendors">,
        date: creditDate,
        amount: parseFloat(amount),
        reason: reason.trim(),
      });
      toast.success("Vendor credit created");
      setShowCreate(false);
      setVendorId("");
      setAmount("");
      setReason("");
    } catch {
      toast.error("Failed to create vendor credit");
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage credits from vendors for returns or overcharges</p>
        <Button className="cursor-pointer" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> New Credit
        </Button>
      </div>

      {credits.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><TicketMinus /></EmptyMedia>
            <EmptyTitle>No vendor credits</EmptyTitle>
            <EmptyDescription>Create vendor credits for returns or billing adjustments</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>New Credit</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {credits.map((credit) => (
            <Card key={credit._id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{credit.creditNumber}</span>
                      <Badge className={STATUS_COLORS[credit.status]}>{credit.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {credit.vendorName} | {format(new Date(credit.date), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{credit.reason}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-green-600">{fmt(credit.amount)}</span>
                    {credit.status === "active" && (
                      <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0 text-destructive" title="Void"
                        onClick={async () => { await voidCredit({ id: credit._id }); toast.success("Credit voided"); }}>
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Vendor Credit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Vendor *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.filter((v) => v.isActive).map((v) => (
                    <SelectItem key={v._id} value={v._id} className="cursor-pointer">{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for credit (e.g. returned goods, overcharge)" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="cursor-pointer" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="cursor-pointer" onClick={handleCreate}>Create Credit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
