import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Info, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table.tsx";

const COUNTRY_FLAGS: Record<string, string> = {
  QA: "🇶🇦",
  AE: "🇦🇪",
  SA: "🇸🇦",
  PK: "🇵🇰",
  IN: "🇮🇳",
};

// Country-specific social insurance info
const COUNTRY_SI_INFO: Record<string, { name: string; components: string[]; note: string }> = {
  SA: {
    name: "GOSI (General Organization for Social Insurance)",
    components: [
      "Pension: 9% employee + 9% employer",
      "Occupational Hazard: 2% employer",
      "SANED Unemployment: 0.75% employee + 0.75% employer",
    ],
    note: "Based on basic salary + housing allowance",
  },
  PK: {
    name: "EOBI + Provincial Social Security",
    components: [
      "EOBI: 1% employee + 5% employer (ceiling PKR 9,000)",
      "Provincial SS (PESSI/SESSI): 6% employer (ceiling PKR 30,000)",
    ],
    note: "EOBI applies on minimum wage ceiling; Provincial SS varies by province",
  },
  IN: {
    name: "EPF + ESI (if applicable)",
    components: [
      "EPF: 12% employee + 12% employer (on basic up to ₹15,000)",
      "ESI: 0.75% employee + 3.25% employer (if salary ≤ ₹21,000)",
    ],
    note: "EPF ceiling is ₹15,000 basic; ESI only applies below ₹21,000 gross",
  },
  QA: {
    name: "Not Applicable",
    components: ["Qatar has no mandatory social insurance deductions for private sector employees"],
    note: "End-of-service gratuity applies instead",
  },
  AE: {
    name: "Not Applicable",
    components: ["UAE has no social insurance for expatriate workers (majority of workforce)"],
    note: "UAE nationals are covered by GPSSA (employer handles separately)",
  },
  BH: {
    name: "SIO (Social Insurance Organization)",
    components: [
      "Pension: 7% employee + 12% employer",
      "Unemployment: 3% employer",
    ],
    note: "Applies to all workers including Bahraini nationals and expatriates",
  },
  KW: {
    name: "PIFSS (Public Institution for Social Security)",
    components: [
      "Social Insurance: 10.5% employee + 11.5% employer",
    ],
    note: "Applies to Kuwaiti nationals; expatriates may have separate end-of-service",
  },
  OM: {
    name: "PASI (Public Authority for Social Insurance)",
    components: [
      "Social Insurance: 7% employee + 11.5% employer",
    ],
    note: "Mandatory for Omani employees; expatriates covered by end-of-service",
  },
  EG: {
    name: "NOSI (National Organization for Social Insurance)",
    components: [
      "Social Insurance: 11% employee + 18.75% employer (approx.)",
    ],
    note: "Rates vary by salary bracket; includes pension, medical, unemployment",
  },
  JO: {
    name: "SSC (Social Security Corporation)",
    components: [
      "Social Security: 7.5% employee + 14.25% employer",
    ],
    note: "Includes old age, disability, and death insurance plus work injury",
  },
};

export default function SocialInsuranceTab() {
  const summary = useQuery(api.payroll.getSocialInsuranceSummary, {});
  const toggleSI = useMutation(api.payroll.toggleSocialInsurance);
  const updateSINumber = useMutation(api.payroll.updateSocialInsuranceNumber);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNumber, setEditNumber] = useState("");

  if (!summary) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (summary.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia>
          <EmptyTitle>No employees found</EmptyTitle>
          <EmptyDescription>Add employees to manage social insurance</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Totals
  const totalEmployeeContrib = summary
    .filter((e) => e.enabled && e.applicable)
    .reduce((sum, e) => sum + e.employeeContribution, 0);
  const totalEmployerContrib = summary
    .filter((e) => e.enabled && e.applicable)
    .reduce((sum, e) => sum + e.employerContribution, 0);
  const applicableCount = summary.filter((e) => e.applicable && e.enabled).length;
  const notApplicableCount = summary.filter((e) => !e.applicable).length;

  // Group by country
  const countryCounts: Record<string, number> = {};
  for (const emp of summary) {
    countryCounts[emp.country] = (countryCounts[emp.country] ?? 0) + 1;
  }

  const handleToggle = async (employeeId: string, enabled: boolean) => {
    try {
      await toggleSI({ employeeId: employeeId as never, enabled });
      toast.success(enabled ? "Social insurance enabled" : "Social insurance disabled");
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleSaveNumber = async (employeeId: string) => {
    try {
      await updateSINumber({ employeeId: employeeId as never, insuranceNumber: editNumber });
      toast.success("Insurance number updated");
      setEditingId(null);
    } catch {
      toast.error("Failed to update");
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate">Employee Deductions</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold break-words leading-tight">{Math.round(totalEmployeeContrib).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Monthly total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate">Employer Contributions</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold break-words leading-tight">{Math.round(totalEmployerContrib).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Monthly total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate">Enrolled</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold break-words leading-tight">{applicableCount}</p>
            <p className="text-xs text-muted-foreground">Employees with SI</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate">Not Applicable</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold break-words leading-tight">{notApplicableCount}</p>
            <p className="text-xs text-muted-foreground">Employees in non-SI countries</p>
          </CardContent>
        </Card>
      </div>

      {/* Country Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(countryCounts).map(([code, count]) => {
          const info = COUNTRY_SI_INFO[code];
          if (!info) return null;
          return (
            <Card key={code}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span>{COUNTRY_FLAGS[code]}</span>
                  <span>{info.name}</span>
                  <Badge variant="secondary" className="ml-auto">{count} employees</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  {info.components.map((c, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <Info className="w-3 h-3" />
                  <span>{info.note}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Employee Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employee Social Insurance Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Base Salary</TableHead>
                  <TableHead>Employee Deduction</TableHead>
                  <TableHead>Employer Cost</TableHead>
                  <TableHead>SI Number</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        {COUNTRY_FLAGS[emp.country]} {emp.countryName}
                      </span>
                    </TableCell>
                    <TableCell>{emp.baseSalary.toLocaleString()}</TableCell>
                    <TableCell>
                      {emp.applicable && emp.enabled ? (
                        <span className="text-red-600 font-medium">
                          -{Math.round(emp.employeeContribution).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {emp.applicable && emp.enabled ? (
                        <span className="text-blue-600 font-medium">
                          {Math.round(emp.employerContribution).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === emp.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editNumber}
                            onChange={(e) => setEditNumber(e.target.value)}
                            className="h-7 w-32 text-xs"
                            placeholder="e.g. 1234567890"
                          />
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs cursor-pointer" onClick={() => handleSaveNumber(emp.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs cursor-pointer" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => { setEditingId(emp.id); setEditNumber(emp.insuranceNumber ?? ""); }}
                        >
                          {emp.insuranceNumber || "Click to add"}
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      {emp.applicable ? (
                        <Switch
                          checked={emp.enabled}
                          onCheckedChange={(checked) => handleToggle(emp.id, checked)}
                          className="cursor-pointer"
                        />
                      ) : (
                        <Badge variant="secondary" className="text-xs">N/A</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Social insurance deductions are automatically applied during payroll runs. Employee deductions are subtracted from net pay; employer contributions are an additional cost tracked separately.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
