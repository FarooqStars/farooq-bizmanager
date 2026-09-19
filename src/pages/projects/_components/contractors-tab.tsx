import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { HardHat, Plus, DollarSign, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useCurrency } from "@/hooks/use-currency.ts";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  terminated: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function ContractorsTab() {
  const projects = useQuery(api.projects.listProjects, {});
  const vendors = useQuery(api.vendors.listVendors);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | "">("");
  const [showAdd, setShowAdd] = useState(false);

  const contractors = useQuery(
    api.jobCosting.listContractors,
    selectedProjectId ? { projectId: selectedProjectId as Id<"projects"> } : "skip"
  );

  if (!projects || !vendors) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v as Id<"projects">)}>
            <SelectTrigger className="w-64 cursor-pointer">
              <SelectValue placeholder="Select a job/project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p._id} value={p._id}>{p.name} ({p.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedProjectId && (
          <Button className="cursor-pointer" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Contractor
          </Button>
        )}
      </div>

      {!selectedProjectId ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><HardHat /></EmptyMedia>
            <EmptyTitle>Select a Job</EmptyTitle>
            <EmptyDescription>Choose a job/project above to manage its contractors</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : contractors === undefined ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : contractors.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><HardHat /></EmptyMedia>
            <EmptyTitle>No contractors assigned</EmptyTitle>
            <EmptyDescription>Add sub-contractors or vendors working on this job</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowAdd(true)}>Add Contractor</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {contractors.map((c) => (
            <ContractorCard key={c._id} contractor={c} />
          ))}
        </div>
      )}

      {showAdd && selectedProjectId && (
        <AddContractorDialog
          projectId={selectedProjectId as Id<"projects">}
          vendors={vendors}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function ContractorCard({ contractor }: { contractor: { _id: Id<"jobContractors">; vendorName: string; role: string; contractAmount: number; amountPaid: number; status: string; startDate: string; endDate?: string; notes?: string } }) {
  const updateContractor = useMutation(api.jobCosting.updateContractor);
  const deleteContractor = useMutation(api.jobCosting.deleteContractor);
  const { fmt } = useCurrency();
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");

  const remaining = contractor.contractAmount - contractor.amountPaid;
  const paidPercent = contractor.contractAmount > 0 ? (contractor.amountPaid / contractor.contractAmount) * 100 : 0;

  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (amount > remaining) { toast.error(`Cannot exceed remaining balance of ${remaining.toLocaleString()}`); return; }
    try {
      await updateContractor({
        contractorId: contractor._id,
        amountPaid: contractor.amountPaid + amount,
      });
      toast.success("Payment recorded");
      setShowPayment(false);
      setPaymentAmount("");
    } catch {
      toast.error("Failed to record payment");
    }
  };

  const handleStatusChange = async (status: string) => {
    try {
      await updateContractor({
        contractorId: contractor._id,
        status: status as "active" | "completed" | "terminated",
      });
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove this contractor?")) return;
    try {
      await deleteContractor({ contractorId: contractor._id });
      toast.success("Contractor removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <HardHat className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold">{contractor.vendorName}</span>
              <Badge className={STATUS_COLORS[contractor.status]}>{contractor.status}</Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Role: {contractor.role}</span>
              <span>Start: {contractor.startDate}</span>
              {contractor.endDate && <span>End: {contractor.endDate}</span>}
            </div>
            {contractor.notes && <p className="text-xs text-muted-foreground">{contractor.notes}</p>}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Contract</div>
              <div className="font-medium flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                {contractor.contractAmount.toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Paid</div>
              <div className="font-medium">{fmt(contractor.amountPaid)}</div>
            </div>
            <div className="w-20">
              <div className="text-xs text-muted-foreground text-right mb-1">{paidPercent.toFixed(0)}%</div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${paidPercent >= 100 ? "bg-green-500" : "bg-primary"}`}
                  style={{ width: `${Math.min(paidPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t">
          <Button size="sm" variant="secondary" className="cursor-pointer" onClick={() => setShowPayment(true)}>
            <DollarSign className="w-3 h-3 mr-1" />Record Payment
          </Button>
          <Select value={contractor.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-32 h-8 cursor-pointer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="cursor-pointer text-destructive ml-auto" onClick={handleDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        {showPayment && (
          <div className="flex items-center gap-2 mt-3 p-3 bg-muted/50 rounded-md">
            <Input
              type="number"
              placeholder={`Max: ${remaining.toLocaleString()}`}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-40"
            />
            <Button size="sm" className="cursor-pointer" onClick={handlePayment}>Apply</Button>
            <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setShowPayment(false)}>Cancel</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddContractorDialog({
  projectId,
  vendors,
  onClose,
}: {
  projectId: Id<"projects">;
  vendors: Array<{ _id: Id<"vendors">; name: string }>;
  onClose: () => void;
}) {
  const addContractor = useMutation(api.jobCosting.addContractor);
  const [vendorId, setVendorId] = useState("");
  const [role, setRole] = useState("");
  const [contractAmount, setContractAmount] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!vendorId) { toast.error("Select a vendor/contractor"); return; }
    if (!role.trim()) { toast.error("Role is required"); return; }
    if (!contractAmount || parseFloat(contractAmount) <= 0) { toast.error("Enter contract amount"); return; }

    setSaving(true);
    try {
      await addContractor({
        projectId,
        vendorId: vendorId as Id<"vendors">,
        role,
        contractAmount: parseFloat(contractAmount),
        startDate,
        endDate: endDate || undefined,
        notes: notes || undefined,
      });
      toast.success("Contractor added");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Contractor to Job</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Vendor/Contractor *</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v._id} value={v._id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role/Service *</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Electrical work, Plumbing, Design..." />
          </div>
          <div className="space-y-2">
            <Label>Contract Amount *</Label>
            <Input type="number" value={contractAmount} onChange={(e) => setContractAmount(e.target.value)} placeholder="10000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Contract terms, scope..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Adding..." : "Add Contractor"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
