import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { TrendingUp, DollarSign, Briefcase, Clock, Package, ArrowUpDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useCurrency } from "@/hooks/use-currency.ts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function ProfitabilityTab() {
  const { fmt, symbol } = useCurrency();
  const data = useQuery(api.projects.projectProfitability);
  const updateRevenue = useMutation(api.projects.updateProjectRevenue);
  const [revenueDialog, setRevenueDialog] = useState<{ id: Id<"projects">; name: string; revenue: string } | null>(null);

  if (!data) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  }

  const { projects, totals } = data;

  if (projects.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
          <EmptyTitle>No profitability data</EmptyTitle>
          <EmptyDescription>Create projects and log time/materials to see profitability analysis</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const handleUpdateRevenue = async () => {
    if (!revenueDialog) return;
    try {
      await updateRevenue({
        projectId: revenueDialog.id,
        revenue: parseFloat(revenueDialog.revenue) || 0,
      });
      toast.success("Revenue updated");
      setRevenueDialog(null);
    } catch {
      toast.error("Failed to update revenue");
    }
  };

  // Chart data
  const profitChart = projects
    .filter((p) => p.status !== "cancelled" && (p.revenue > 0 || p.actualCost > 0))
    .slice(0, 10)
    .map((p) => ({
      name: p.code,
      Revenue: p.revenue,
      Cost: p.actualCost,
      Profit: p.profit,
    }));

  const hoursBreakdown = [
    { name: "Billable", value: totals.totalBillableHours },
    { name: "Non-Billable", value: totals.totalNonBillableHours },
  ].filter((d) => d.value > 0);

  const costBreakdown = [
    { name: "Labor", value: totals.totalLabor },
    { name: "Materials", value: totals.totalMaterial },
  ].filter((d) => d.value > 0);

  const totalProfit = totals.totalRevenue - totals.totalActual;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <Briefcase className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
            <div className="text-2xl font-bold">{totals.totalProjects}</div>
            <div className="text-xs text-muted-foreground">Projects</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <TrendingUp className="w-5 h-5 mx-auto text-green-500 mb-1" />
            <div className="text-2xl font-bold">{totals.activeCount}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <DollarSign className="w-5 h-5 mx-auto text-blue-500 mb-1" />
            <div className="text-lg font-bold">{fmt(totals.totalRevenue)}</div>
            <div className="text-xs text-muted-foreground">Revenue</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <ArrowUpDown className="w-5 h-5 mx-auto text-orange-500 mb-1" />
            <div className="text-lg font-bold">{fmt(totals.totalActual)}</div>
            <div className="text-xs text-muted-foreground">Total Cost</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <DollarSign className={`w-5 h-5 mx-auto mb-1 ${totalProfit >= 0 ? "text-green-500" : "text-red-500"}`} />
            <div className={`text-lg font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              {fmt(Math.abs(totalProfit))}
            </div>
            <div className="text-xs text-muted-foreground">{totalProfit >= 0 ? "Profit" : "Loss"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <Clock className="w-5 h-5 mx-auto text-purple-500 mb-1" />
            <div className="text-lg font-bold">{totals.totalBillableHours.toFixed(0)}h</div>
            <div className="text-xs text-muted-foreground">Billable Hours</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {profitChart.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Revenue vs Cost by Project</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={profitChart}>
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(value) => `${symbol} ${Number(value).toLocaleString()}`} />
                  <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-rows-2 gap-4">
          {hoursBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Hours Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={hoursBreakdown} cx="50%" cy="50%" outerRadius={40} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {hoursBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {costBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={costBreakdown} cx="50%" cy="50%" outerRadius={40} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {costBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i + 2]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Project Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Project Profitability Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Project</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Revenue</th>
                  <th className="text-right px-3 py-2">Cost</th>
                  <th className="text-right px-3 py-2">Profit</th>
                  <th className="text-right px-3 py-2">Margin</th>
                  <th className="text-right px-3 py-2">Hours</th>
                  <th className="text-center px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.code}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="capitalize">{p.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="text-right px-3 py-2 font-medium">{fmt(p.revenue)}</td>
                    <td className="text-right px-3 py-2">{fmt(p.actualCost)}</td>
                    <td className={`text-right px-3 py-2 font-medium ${p.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {p.profit >= 0 ? "+" : ""}{fmt(p.profit)}
                    </td>
                    <td className="text-right px-3 py-2">
                      <span className={p.profitMargin >= 0 ? "text-green-600" : "text-red-600"}>
                        {p.profitMargin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-right px-3 py-2">
                      <div className="text-xs">
                        <span className="text-green-600">{p.billableHours.toFixed(1)}h</span>
                        {p.nonBillableHours > 0 && (
                          <span className="text-orange-600 ml-1">+{p.nonBillableHours.toFixed(1)}h</span>
                        )}
                      </div>
                    </td>
                    <td className="text-center px-3 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer text-xs"
                        onClick={() => setRevenueDialog({ id: p.id, name: p.name, revenue: p.revenue.toString() })}
                      >
                        Set Revenue
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Dialog */}
      <Dialog open={!!revenueDialog} onOpenChange={(open) => !open && setRevenueDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Revenue - {revenueDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the total revenue earned or invoiced for this project
            </p>
            <Input
              type="number"
              placeholder="0.00"
              value={revenueDialog?.revenue ?? ""}
              onChange={(e) => revenueDialog && setRevenueDialog({ ...revenueDialog, revenue: e.target.value })}
            />
            <Button className="w-full cursor-pointer" onClick={handleUpdateRevenue}>Update Revenue</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
