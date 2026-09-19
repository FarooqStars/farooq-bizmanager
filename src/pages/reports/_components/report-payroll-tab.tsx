import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { fmt, CHART_COLORS } from "./report-utils.tsx";
import { useCurrency } from "@/hooks/use-currency.ts";

export default function PayrollTab() {
  const { symbol } = useCurrency();
  const payroll = useQuery(api.advancedReports.payrollSummary, {});

  if (!payroll) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Active Employees</p>
            <p className="text-xl font-bold break-words leading-tight">{payroll.activeEmployees}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Total Monthly Salary</p>
            <p className="text-xl font-bold text-primary break-words leading-tight">{fmt(payroll.totalBasicSalary)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Average Salary</p>
            <p className="text-xl font-bold break-words leading-tight">{fmt(payroll.avgSalary)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Total Paid YTD</p>
            <p className="text-xl font-bold text-green-600 break-words leading-tight">{fmt(payroll.totalPaidYTD)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly payroll chart */}
      {payroll.monthlyPayroll.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Monthly Payroll Cost</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={payroll.monthlyPayroll}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `${symbol} ${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => [fmt(Number(v)), "Payroll Cost"]} />
                <Bar dataKey="amount" fill="oklch(0.488 0.243 264.376)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Department breakdown */}
      {payroll.byDepartment.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Cost by Department</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={payroll.byDepartment}
                    dataKey="cost"
                    nameKey="department"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {payroll.byDepartment.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Department Details</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {payroll.byDepartment.map((dept, idx) => {
                  const total = payroll.byDepartment.reduce((s, d) => s + d.cost, 0);
                  const pct = total > 0 ? (dept.cost / total) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{dept.department}</span>
                        <span className="text-muted-foreground">{dept.headcount} employees — {fmt(dept.cost)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payroll run count */}
      <Card>
        <CardContent className="pt-5">
          <div className={cn("flex items-center justify-between")}>
            <div>
              <p className="text-sm text-muted-foreground">Total Payroll Runs This Year</p>
              <p className="text-2xl font-bold mt-1">{payroll.totalRuns}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
