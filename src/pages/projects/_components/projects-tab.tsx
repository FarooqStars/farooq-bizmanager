import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Plus, Briefcase, DollarSign, Users, FileText } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "@/hooks/use-currency.ts";

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  on_hold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function ProjectsTab() {
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const projects = useQuery(api.projects.listProjects, { status: filter === "all" ? undefined : filter });
  const customers = useQuery(api.sales.listCustomers);
  const employees = useQuery(api.payroll.listEmployees, {});
  const createProject = useMutation(api.projects.createProject);
  const updateProject = useMutation(api.projects.updateProject);
  const navigate = useNavigate();
  const { fmt } = useCurrency();

  const [form, setForm] = useState({
    name: "", code: "", description: "", startDate: "",
    endDate: "", estimatedBudget: "", customerId: "", managerId: "",
  });

  if (!projects) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  const handleCreate = async () => {
    if (!form.name || !form.code || !form.startDate || !form.estimatedBudget) {
      toast.error("Name, code, start date, and budget are required");
      return;
    }
    try {
      await createProject({
        name: form.name,
        code: form.code,
        description: form.description || undefined,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        estimatedBudget: parseFloat(form.estimatedBudget),
        customerId: form.customerId ? form.customerId as Id<"customers"> : undefined,
        managerId: form.managerId ? form.managerId as Id<"employees"> : undefined,
      });
      toast.success("Project created");
      setShowCreate(false);
      setForm({ name: "", code: "", description: "", startDate: "", endDate: "", estimatedBudget: "", customerId: "", managerId: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    }
  };

  const handleStatusChange = async (projectId: Id<"projects">, status: string) => {
    try {
      await updateProject({
        projectId,
        status: status as "planning" | "active" | "on_hold" | "completed" | "cancelled",
      });
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {["all", "planning", "active", "on_hold", "completed"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "default" : "secondary"}
              className="cursor-pointer capitalize"
              onClick={() => setFilter(s)}
            >
              {s.replace("_", " ")}
            </Button>
          ))}
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Briefcase /></EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>Create your first project to start tracking time and costs</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Create Project</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => {
            const percentUsed = p.estimatedBudget > 0 ? (p.actualCost / p.estimatedBudget) * 100 : 0;
            return (
              <Card key={p._id}>
                <CardContent className="py-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{p.name}</span>
                        <Badge variant="secondary" className="font-mono text-xs">{p.code}</Badge>
                        <Badge className={STATUS_COLORS[p.status]}>{p.status.replace("_", " ")}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {p.customerName && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{p.customerName}</span>}
                        {p.managerName && <span>Manager: {p.managerName}</span>}
                        <span>Start: {p.startDate}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Budget</div>
                        <div className="font-medium flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {fmt(p.estimatedBudget)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Actual</div>
                        <div className={`font-medium ${percentUsed > 100 ? "text-red-600" : ""}`}>
                          {fmt(p.actualCost)}
                        </div>
                      </div>
                      <div className="w-20">
                        <div className="text-xs text-muted-foreground text-right mb-1">{percentUsed.toFixed(0)}%</div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${percentUsed > 100 ? "bg-red-500" : percentUsed > 80 ? "bg-yellow-500" : "bg-green-500"}`}
                            style={{ width: `${Math.min(percentUsed, 100)}%` }}
                          />
                        </div>
                      </div>
                      <Select value={p.status} onValueChange={(v) => handleStatusChange(p._id, v)}>
                        <SelectTrigger className="w-32 cursor-pointer"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planning">Planning</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="cursor-pointer"
                        title="Create Invoice for this Job"
                        onClick={() => navigate(`/sales?tab=jobinvoices&project=${p._id}`)}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" /> Invoice
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Project</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Project Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Website Redesign" />
              </div>
              <div className="space-y-1">
                <Label>Project Code *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PRJ-001" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Project details..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date *</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Estimated Budget *</Label>
              <Input type="number" value={form.estimatedBudget} onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })} placeholder="50000" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Customer</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {customers?.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Project Manager</Label>
                <Select value={form.managerId} onValueChange={(v) => setForm({ ...form, managerId: v })}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select manager" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {employees?.filter((e) => e.isActive).map((e) => <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full cursor-pointer" onClick={handleCreate}>Create Project</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
