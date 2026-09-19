import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { FileText, Plus, Trash2, CheckCircle2, Clock } from "lucide-react";
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
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { cn } from "@/lib/utils.ts";

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  filed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  amended: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function TaxDeclarationTab() {
  const declarations = useQuery(api.payrollEnhancements.listTaxDeclarations, {});
  const fileDeclaration = useMutation(api.payrollEnhancements.fileTaxDeclaration);
  const deleteDeclaration = useMutation(api.payrollEnhancements.deleteTaxDeclaration);
  const [showCreate, setShowCreate] = useState(false);

  if (!declarations) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Total Declarations</p>
            <p className="text-2xl font-bold">{declarations.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Filed</p>
            <p className="text-2xl font-bold text-green-600">{declarations.filter((d) => d.status === "filed").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Pending (Draft)</p>
            <p className="text-2xl font-bold text-yellow-600">{declarations.filter((d) => d.status === "draft").length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" /> New Declaration
        </Button>
      </div>

      {/* List */}
      {declarations.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No tax declarations</EmptyTitle>
            <EmptyDescription>Create payroll tax declarations for filing with authorities</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">Create Declaration</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {declarations.map((dec) => (
            <Card key={dec._id}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {dec.status === "filed" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-yellow-600" />}
                      <p className="font-medium truncate">{dec.title}</p>
                      <Badge className={cn("text-xs capitalize", statusColors[dec.status])}>{dec.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>Period: {dec.periodStart} → {dec.periodEnd}</span>
                      <span>{dec.employeeCount} employees</span>
                      {dec.filedDate && <span>Filed: {dec.filedDate}</span>}
                      {dec.reference && <span>Ref: {dec.reference}</span>}
                    </div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold">Gross: {dec.totalGrossPay.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      Tax: {dec.totalTaxWithheld.toLocaleString()} | SS: {dec.totalSocialSecurity.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {dec.status === "draft" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={async () => {
                          try {
                            await fileDeclaration({ id: dec._id, filedDate: new Date().toISOString().split("T")[0] });
                            toast.success("Declaration filed");
                          } catch { toast.error("Failed to file"); }
                        }}
                      >
                        File
                      </Button>
                    )}
                    {dec.status === "draft" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer text-destructive"
                        onClick={async () => {
                          try {
                            await deleteDeclaration({ id: dec._id });
                            toast.success("Deleted");
                          } catch { toast.error("Failed to delete"); }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreateDeclarationDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ─── Create Dialog ───────────────────────────────────────────────

function CreateDeclarationDialog({ onClose }: { onClose: () => void }) {
  const createDeclaration = useMutation(api.payrollEnhancements.createTaxDeclaration);
  const [title, setTitle] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [totalGrossPay, setTotalGrossPay] = useState("");
  const [totalTaxable, setTotalTaxable] = useState("");
  const [totalTaxWithheld, setTotalTaxWithheld] = useState("");
  const [totalSocialSecurity, setTotalSocialSecurity] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !periodStart || !periodEnd) {
      toast.error("Title and period dates are required");
      return;
    }
    setSaving(true);
    try {
      await createDeclaration({
        title: title.trim(),
        periodStart,
        periodEnd,
        totalGrossPay: Number(totalGrossPay) || 0,
        totalTaxable: Number(totalTaxable) || 0,
        totalTaxWithheld: Number(totalTaxWithheld) || 0,
        totalSocialSecurity: Number(totalSocialSecurity) || 0,
        employeeCount: Number(employeeCount) || 0,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        status: "draft",
      });
      toast.success("Tax declaration created");
      onClose();
    } catch { toast.error("Failed to create declaration"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Tax Declaration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q3 2026 Payroll Tax Filing" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Period Start *</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period End *</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Total Gross Pay</Label>
              <Input type="number" value={totalGrossPay} onChange={(e) => setTotalGrossPay(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Total Taxable</Label>
              <Input type="number" value={totalTaxable} onChange={(e) => setTotalTaxable(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tax Withheld</Label>
              <Input type="number" value={totalTaxWithheld} onChange={(e) => setTotalTaxWithheld(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Social Security</Label>
              <Input type="number" value={totalSocialSecurity} onChange={(e) => setTotalSocialSecurity(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Employee Count</Label>
              <Input type="number" value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Reference #</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TAX-2026-Q3" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleCreate} disabled={saving} className="cursor-pointer">
            {saving ? "Creating..." : "Create Declaration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
