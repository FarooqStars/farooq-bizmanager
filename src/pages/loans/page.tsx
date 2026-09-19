import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, AuthLoading } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Landmark, ArrowUpRight, ArrowDownLeft, ListChecks, BarChart3, UserCheck } from "lucide-react";
import LoansListTab from "./_components/loans-list-tab.tsx";
import AmortizationTab from "./_components/amortization-tab.tsx";
import SalaryAdvancesTab from "./_components/salary-advances-tab.tsx";
import { useState } from "react";

function LoansPageInner() {
  const summary = useQuery(api.loans.getLoanSummary);
  const [activeTab, setActiveTab] = useState("all");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Landmark className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Loans & Financing</h1>
          <p className="text-muted-foreground text-sm">Track loans receivable, payable, and amortization schedules</p>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ArrowDownLeft className="w-4 h-4 text-green-600" /> Receivable
              </div>
              <div className="text-xl font-bold text-green-700 break-words leading-tight">{summary.totalReceivable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ArrowUpRight className="w-4 h-4 text-red-600" /> Payable
              </div>
              <div className="text-xl font-bold text-red-700 break-words leading-tight">{summary.totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ListChecks className="w-4 h-4" /> Active Loans
              </div>
              <div className="text-xl font-bold break-words leading-tight">{summary.activeLoansCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <BarChart3 className="w-4 h-4" /> Total Loans
              </div>
              <div className="text-xl font-bold break-words leading-tight">{summary.totalLoans}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="cursor-pointer">All Loans</TabsTrigger>
          <TabsTrigger value="receivable" className="cursor-pointer">Receivable</TabsTrigger>
          <TabsTrigger value="payable" className="cursor-pointer">Payable</TabsTrigger>
          <TabsTrigger value="amortization" className="cursor-pointer">Amortization</TabsTrigger>
          <TabsTrigger value="salary-advances" className="cursor-pointer">
            <UserCheck className="w-4 h-4 mr-1" /> Salary Advances
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <LoansListTab />
        </TabsContent>
        <TabsContent value="receivable">
          <LoansListTab type="receivable" />
        </TabsContent>
        <TabsContent value="payable">
          <LoansListTab type="payable" />
        </TabsContent>
        <TabsContent value="amortization">
          <AmortizationTab />
        </TabsContent>
        <TabsContent value="salary-advances">
          <SalaryAdvancesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function LoansPage() {
  return (
    <>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </AuthLoading>
      <Authenticated>
        <LoansPageInner />
      </Authenticated>
    </>
  );
}
