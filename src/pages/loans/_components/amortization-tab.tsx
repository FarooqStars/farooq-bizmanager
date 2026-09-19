import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription as EmptyDesc } from "@/components/ui/empty.tsx";
import { Table2 } from "lucide-react";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function AmortizationTab() {
  const loans = useQuery(api.loans.listLoans, {});
  const [selectedLoanId, setSelectedLoanId] = useState<string>("");

  const schedule = useQuery(
    api.loans.getAmortizationSchedule,
    selectedLoanId ? { loanId: selectedLoanId as Id<"loans"> } : "skip"
  );

  const selectedLoan = loans?.find((l) => l._id === selectedLoanId);

  if (loans === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  const activeLoans = loans.filter((l) => l.status === "active" || l.status === "paid_off");

  if (activeLoans.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Table2 /></EmptyMedia>
          <EmptyTitle>No loans available</EmptyTitle>
          <EmptyDesc>Create a loan first to view its amortization schedule</EmptyDesc>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {/* Loan selector */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium whitespace-nowrap">Select Loan:</label>
            <Select value={selectedLoanId} onValueChange={setSelectedLoanId}>
              <SelectTrigger className="cursor-pointer max-w-md">
                <SelectValue placeholder="Choose a loan to view schedule..." />
              </SelectTrigger>
              <SelectContent>
                {activeLoans.map((loan) => (
                  <SelectItem key={loan._id} value={loan._id}>
                    {loan.loanNumber} — {loan.name} ({loan.principalAmount.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Schedule table */}
      {selectedLoanId && schedule && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Amortization Schedule — {selectedLoan?.name}</span>
              <span className="text-muted-foreground font-normal">
                {selectedLoan?.interestRate}% {selectedLoan?.interestType} | {selectedLoan?.termMonths} months
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="p-3 font-medium">Payment #</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium text-right">Payment</th>
                    <th className="p-3 font-medium text-right">Principal</th>
                    <th className="p-3 font-medium text-right">Interest</th>
                    <th className="p-3 font-medium text-right">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((entry) => (
                    <tr key={entry.paymentNumber} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">{entry.paymentNumber}</td>
                      <td className="p-3 text-muted-foreground">{entry.date}</td>
                      <td className="p-3 text-right font-medium">{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-green-700 dark:text-green-400">{entry.principalPortion.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-red-700 dark:text-red-400">{entry.interestPortion.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right font-semibold">{entry.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30">
                  <tr className="font-semibold">
                    <td className="p-3" colSpan={2}>Totals</td>
                    <td className="p-3 text-right">
                      {schedule.reduce((s, e) => s + e.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right text-green-700 dark:text-green-400">
                      {schedule.reduce((s, e) => s + e.principalPortion, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right text-red-700 dark:text-red-400">
                      {schedule.reduce((s, e) => s + e.interestPortion, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right">0.00</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedLoanId && !schedule && <Skeleton className="h-48 w-full" />}
    </div>
  );
}
