import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import {
  FileBarChart, DollarSign, TrendingUp, TrendingDown, Clock,
  HardHat, Package, Receipt, FileText,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useCurrency } from "@/hooks/use-currency.ts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  on_hold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function JobCostReportTab() {
  const { fmt, symbol } = useCurrency();
  const projects = useQuery(api.projects.listProjects, {});
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | "all">("all");

  const reportData = useQuery(
    api.jobCosting.jobCostSummary,
    selectedProjectId === "all" ? {} : { projectId: selectedProjectId as Id<"projects"> }
  );

  if (!projects || !reportData) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  const { totals } = reportData;

  // Pie chart data for cost breakdown
  const costBreakdown = [
    { name: "Labor", value: totals.totalLabor },
    { name: "Materials", value: totals.totalMaterials },
    { name: "Expenses", value: totals.totalExpenses },
    { name: "Contractors", value: totals.totalContractors },
    { name: "Bills", value: totals.totalBills },
  ].filter((d) => d.value > 0);

  // Bar chart data for project comparison
  const projectComparisonData = reportData.projects.map((p) => ({
    name: p.projectCode,
    Budget: p.estimatedBudget,
    Actual: p.totalCost,
    Revenue: p.revenue,
  }));

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v as Id<"projects"> | "all")}>
          <SelectTrigger className="w-72 cursor-pointer">
            <SelectValue placeholder="All Jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jobs/Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p._id} value={p._id}>{p.name} ({p.code})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reportData.projects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileBarChart /></EmptyMedia>
            <EmptyTitle>No job data</EmptyTitle>
            <EmptyDescription>Create jobs and record costs to see the report</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="w-4 h-4 flex-shrink-0" /><span className="truncate">Total Budget</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold mt-1 break-words leading-tight">{fmt(totals.totalBudget)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Receipt className="w-4 h-4 flex-shrink-0" /><span className="truncate">Total Cost</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold mt-1 break-words leading-tight">{fmt(totals.totalCost)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4 flex-shrink-0" /><span className="truncate">Total Revenue</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold mt-1 break-words leading-tight">{fmt(totals.totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {totals.totalProfit >= 0 ? <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" /> : <TrendingDown className="w-4 h-4 text-red-600 flex-shrink-0" />}
                  <span className="truncate">Total Profit</span>
                </div>
                <p className={`text-xl sm:text-2xl font-bold mt-1 break-words leading-tight ${totals.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmt(totals.totalProfit)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Cost Breakdown Pie */}
            {costBreakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Cost Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={costBreakdown}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        >
                          {costBreakdown.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: unknown) => `${symbol} ${Number(val).toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Budget vs Actual Bar Chart */}
            {projectComparisonData.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Budget vs Actual vs Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projectComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip formatter={(val: unknown) => `${symbol} ${Number(val).toLocaleString()}`} />
                        <Legend />
                        <Bar dataKey="Budget" fill="#94a3b8" />
                        <Bar dataKey="Actual" fill="#3b82f6" />
                        <Bar dataKey="Revenue" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Detailed Project Rows */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Job Cost Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Job</th>
                      <th className="text-left px-3 py-2 font-medium">Customer</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-right px-3 py-2 font-medium">Budget</th>
                      <th className="text-right px-3 py-2 font-medium">Labor</th>
                      <th className="text-right px-3 py-2 font-medium">Materials</th>
                      <th className="text-right px-3 py-2 font-medium">Contractors</th>
                      <th className="text-right px-3 py-2 font-medium">Expenses</th>
                      <th className="text-right px-3 py-2 font-medium">Bills</th>
                      <th className="text-right px-3 py-2 font-medium font-bold">Total Cost</th>
                      <th className="text-right px-3 py-2 font-medium">Revenue</th>
                      <th className="text-right px-3 py-2 font-medium">Profit</th>
                      <th className="text-right px-3 py-2 font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reportData.projects.map((p) => (
                      <tr key={p.projectId} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="font-medium">{p.projectName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{p.projectCode}</div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{p.customerName}</td>
                        <td className="px-3 py-2">
                          <Badge className={STATUS_COLORS[p.status] + " text-xs"}>{p.status.replace("_", " ")}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right">{fmt(p.estimatedBudget)}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.laborCost)}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.materialCost)}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.contractorCost)}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.expenseCost)}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.billsCost)}</td>
                        <td className="px-3 py-2 text-right font-bold">{fmt(p.totalCost)}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.revenue)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${p.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(p.profit)}
                        </td>
                        <td className={`px-3 py-2 text-right ${p.profitMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {p.profitMargin.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/50 font-medium">
                    <tr>
                      <td className="px-3 py-2" colSpan={3}>Totals</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.totalBudget)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.totalLabor)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.totalMaterials)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.totalContractors)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.totalExpenses)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.totalBills)}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmt(totals.totalCost)}</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.totalRevenue)}</td>
                      <td className={`px-3 py-2 text-right ${totals.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmt(totals.totalProfit)}
                      </td>
                      <td className="px-3 py-2 text-right">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Hours & Activity Summary */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg flex-shrink-0">
                  <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground truncate">Total Hours</p>
                  <p className="text-xl font-bold break-words leading-tight">{totals.totalHours.toFixed(1)} hrs</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg flex-shrink-0">
                  <HardHat className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground truncate">Contractor Budget</p>
                  <p className="text-xl font-bold break-words leading-tight">{fmt(totals.totalContractors)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg flex-shrink-0">
                  <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground truncate">Active Jobs</p>
                  <p className="text-xl font-bold break-words leading-tight">{totals.projectCount}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
