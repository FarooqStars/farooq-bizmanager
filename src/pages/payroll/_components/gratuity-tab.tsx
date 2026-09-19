import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Calculator, Award, Globe, Scale, BookOpen, DollarSign, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const COUNTRY_NAMES: Record<string, string> = {
  QA: "Qatar",
  AE: "UAE",
  SA: "Saudi Arabia",
  PK: "Pakistan",
  IN: "India",
};

const COUNTRY_FLAGS: Record<string, string> = {
  QA: "🇶🇦",
  AE: "🇦🇪",
  SA: "🇸🇦",
  PK: "🇵🇰",
  IN: "🇮🇳",
};

export default function GratuityTab() {
  const employees = useQuery(api.payroll.listEmployees, {});
  const accounts = useQuery(api.accounting.listAccounts, {});
  const accrueGratuity = useMutation(api.payroll.accrueGratuityForPeriod);
  const payGratuityMutation = useMutation(api.payroll.payGratuity);

  const [selectedId, setSelectedId] = useState<string>("");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [isResignation, setIsResignation] = useState(false);

  // Accrual form state
  const [accrualDate, setAccrualDate] = useState(new Date().toISOString().slice(0, 10));
  const [accrualLoading, setAccrualLoading] = useState(false);

  // Payment form state
  const [paymentEmpId, setPaymentEmpId] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentAccountId, setPaymentAccountId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentLoading, setPaymentLoading] = useState(false);

  const bankAccounts = (accounts ?? []).filter(
    (a) => a.type === "bank" || a.type === "other_current_asset",
  );

  const handleAccrue = async () => {
    setAccrualLoading(true);
    try {
      const result = await accrueGratuity({ asOfDate: accrualDate });
      if (result.posted) {
        toast.success(`Gratuity accrual posted: ${result.delta?.toLocaleString()} (delta from last accrual)`);
      } else {
        toast.info(result.reason ?? "No delta — no entry posted");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to post accrual";
      toast.error(msg);
    } finally {
      setAccrualLoading(false);
    }
  };

  const handlePayGratuity = async () => {
    if (!paymentEmpId || !paymentAmount || !paymentAccountId) {
      toast.error("Fill in all payment fields");
      return;
    }
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Payment amount must be a positive number");
      return;
    }
    setPaymentLoading(true);
    try {
      const result = await payGratuityMutation({
        employeeId: paymentEmpId as Id<"employees">,
        paymentAmount: amount,
        paymentAccountId: paymentAccountId as Id<"accounts">,
        terminationDate: paymentDate,
        isResignation: false,
      });
      toast.success(`Gratuity payment posted for ${result.employeeName}: ${result.paymentAmount.toLocaleString()}`);
      setPaymentEmpId("");
      setPaymentAmount("");
      setPaymentAccountId("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to post gratuity payment";
      toast.error(msg);
    } finally {
      setPaymentLoading(false);
    }
  };

  const selectedEmp = employees?.find((e) => e._id === selectedId);
  const empCountry = selectedEmp?.country ?? "QA";

  const gratuity = useQuery(
    api.payroll.calculateGratuity,
    selectedId ? { employeeId: selectedId as Id<"employees">, endDate, isResignation } : "skip"
  );

  const labourRules = useQuery(
    api.payroll.getCountryLabourRules,
    selectedId ? { country: empCountry } : "skip"
  );

  if (!employees) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* ── Period-end accrual ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Post Gratuity Accrual to Ledger
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Posts the delta between the current obligation and the already-accrued balance (2700).
            Run this at end of month or period. Only positive deltas are posted.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label>As of Date</Label>
              <Input type="date" value={accrualDate} onChange={(e) => setAccrualDate(e.target.value)} className="w-44" />
            </div>
            <Button onClick={handleAccrue} disabled={accrualLoading} className="cursor-pointer">
              <BookOpen className="w-4 h-4 mr-2" />
              {accrualLoading ? "Posting…" : "Post Accrual"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Gratuity payment at termination ──────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Record Gratuity Payment (Employee Termination)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Clears the 2700 balance and credits the bank. Over/under-accrual correction is posted automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label>Employee</Label>
              <Select value={paymentEmpId} onValueChange={setPaymentEmpId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e) => (
                    <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Amount</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                min={0}
              />
            </div>
            <div>
              <Label>Payment Account</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger><SelectValue placeholder="Bank/cash account" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Termination Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={handlePayGratuity}
            disabled={paymentLoading || !paymentEmpId || !paymentAmount || !paymentAccountId}
            className="cursor-pointer"
          >
            <Landmark className="w-4 h-4 mr-2" />
            {paymentLoading ? "Posting…" : "Post Gratuity Payment"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Calculator ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            End-of-Service Gratuity Calculator
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Multi-country support: Qatar, UAE, Saudi Arabia, Pakistan, India, Bahrain, Kuwait, Oman, Egypt, Jordan
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Select Employee</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Choose an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp._id} value={emp._id}>
                      {emp.name} ({emp.employeeId}) {emp.country ? COUNTRY_FLAGS[emp.country] ?? "" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>End Date (termination/resignation)</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Saudi-specific: resignation toggle */}
          {empCountry === "SA" && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Switch checked={isResignation} onCheckedChange={setIsResignation} />
              <div>
                <p className="text-sm font-medium">Resignation</p>
                <p className="text-xs text-muted-foreground">
                  Saudi law reduces gratuity for resignations under 10 years
                </p>
              </div>
            </div>
          )}

          {/* Country law reference */}
          {selectedId && labourRules && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <Globe className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-medium">{COUNTRY_FLAGS[empCountry]} {labourRules.countryName}</span>
                {" — "}
                <span>{labourRules.gratuity.law}</span>
                <span className="ml-2">(Min. {labourRules.gratuity.minYears} year{labourRules.gratuity.minYears > 1 ? "s" : ""} service)</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {gratuity && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Award className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">End-of-Service Gratuity</p>
                <p className="text-3xl font-bold">
                  {gratuity.gratuityAmount.toLocaleString()}
                  {" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {selectedEmp?.currency ?? "QAR"}
                  </span>
                </p>
              </div>
              <div className="ml-auto">
                <Badge variant="secondary" className="text-xs">
                  {COUNTRY_FLAGS[gratuity.country]} {COUNTRY_NAMES[gratuity.country] ?? gratuity.country}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-background rounded-lg">
                <p className="text-xs text-muted-foreground">Years Worked</p>
                <p className="text-lg font-semibold">{gratuity.yearsWorked}</p>
              </div>
              <div className="p-3 bg-background rounded-lg">
                <p className="text-xs text-muted-foreground">Base Salary</p>
                <p className="text-lg font-semibold">{gratuity.baseSalary?.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-background rounded-lg">
                <p className="text-xs text-muted-foreground">Weekly Wage</p>
                <p className="text-lg font-semibold">{gratuity.weeklyWage?.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-background rounded-lg">
                <p className="text-xs text-muted-foreground">Applicable Law</p>
                <p className="text-xs font-medium mt-1">{gratuity.law}</p>
              </div>
            </div>

            {gratuity.isResignation && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg p-2">
                <Scale className="w-4 h-4" />
                <span>Resignation reduction applied per {gratuity.law}</span>
              </div>
            )}

            <div className="pt-2 text-xs text-muted-foreground">
              <p className="font-medium mb-1">Calculation breakdown:</p>
              <p>{gratuity.breakdown}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedId && !gratuity && (
        <Skeleton className="h-40 w-full" />
      )}

      {/* Overtime Rates Reference Card */}
      {selectedId && labourRules && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="w-4 h-4" />
              Overtime Rates — {labourRules.countryName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Regular</p>
                <p className="text-lg font-bold">{Math.round(labourRules.overtime.regular * 100)}%</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Rest Day</p>
                <p className="text-lg font-bold">{Math.round(labourRules.overtime.restDay * 100)}%</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Holiday</p>
                <p className="text-lg font-bold">{Math.round(labourRules.overtime.holiday * 100)}%</p>
              </div>
              {labourRules.overtime.nightShift && (
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Night Shift</p>
                  <p className="text-lg font-bold">{Math.round(labourRules.overtime.nightShift * 100)}%</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
