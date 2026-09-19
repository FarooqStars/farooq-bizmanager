import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useCurrency } from "@/hooks/use-currency.ts";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { CheckSquare, Check, X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function TimesheetApprovalTab() {
  const { fmt } = useCurrency();
  const entries = useQuery(api.projects.listTimeEntries, { status: "submitted" });
  const approveEntries = useMutation(api.projects.approveTimeEntries);
  const [selected, setSelected] = useState<Set<Id<"timeEntries">>>(new Set());

  if (!entries) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  const toggleSelect = (id: Id<"timeEntries">) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e._id)));
    }
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    if (selected.size === 0) {
      toast.error("Select entries first");
      return;
    }
    try {
      await approveEntries({ entryIds: Array.from(selected), action });
      toast.success(`${selected.size} entries ${action === "approve" ? "approved" : "rejected"}`);
      setSelected(new Set());
    } catch {
      toast.error("Failed to update entries");
    }
  };

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const totalCost = entries.reduce((s, e) => s + e.totalCost, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <div className="text-2xl font-bold">{entries.length}</div>
            <div className="text-xs text-muted-foreground">Pending Approval</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}h</div>
            <div className="text-xs text-muted-foreground">Total Hours</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <div className="text-2xl font-bold">{fmt(totalCost)}</div>
            <div className="text-xs text-muted-foreground">Total Cost</div>
          </CardContent>
        </Card>
      </div>

      {entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CheckSquare /></EmptyMedia>
            <EmptyTitle>No timesheets pending</EmptyTitle>
            <EmptyDescription>All submitted time entries have been reviewed</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Bulk Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selected.size === entries.length}
                onCheckedChange={selectAll}
                className="cursor-pointer"
              />
              <span className="text-sm text-muted-foreground">
                {selected.size > 0 ? `${selected.size} selected` : "Select all"}
              </span>
            </div>
            {selected.size > 0 && (
              <div className="flex gap-2">
                <Button size="sm" className="cursor-pointer" onClick={() => handleBulkAction("approve")}>
                  <Check className="w-4 h-4 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="destructive" className="cursor-pointer" onClick={() => handleBulkAction("reject")}>
                  <X className="w-4 h-4 mr-1" /> Reject
                </Button>
              </div>
            )}
          </div>

          {/* Entries */}
          <div className="space-y-2">
            {entries.map((e) => (
              <Card key={e._id} className={selected.has(e._id) ? "ring-2 ring-primary" : ""}>
                <CardContent className="py-3 flex items-center gap-3">
                  <Checkbox
                    checked={selected.has(e._id)}
                    onCheckedChange={() => toggleSelect(e._id)}
                    className="cursor-pointer"
                  />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{e.employeeName}</span>
                      <Badge variant="secondary">{e.projectName}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.date} &middot; {e.startTime}{e.endTime ? ` - ${e.endTime}` : ""}
                      {e.description && ` &middot; ${e.description}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{e.hours.toFixed(1)}h</div>
                    <div className="text-xs text-muted-foreground">{fmt(e.totalCost)}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="cursor-pointer text-green-600 hover:text-green-700"
                      onClick={async () => {
                        await approveEntries({ entryIds: [e._id], action: "approve" });
                        toast.success("Approved");
                      }}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="cursor-pointer text-red-600 hover:text-red-700"
                      onClick={async () => {
                        await approveEntries({ entryIds: [e._id], action: "reject" });
                        toast.success("Rejected");
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
