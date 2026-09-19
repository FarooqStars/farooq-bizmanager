/**
 * CSV export utilities for AR/AP Ageing reports.
 */
import type { ARAgingResult, APAgingResult } from "@/convex/reports/ageing.ts";

function fmtNum(n: number): string {
  return n.toFixed(2);
}

export function generateAgeingCsv(type: "ar", data: ARAgingResult): string;
export function generateAgeingCsv(type: "ap", data: APAgingResult): string;
export function generateAgeingCsv(type: "ar" | "ap", data: ARAgingResult | APAgingResult): string {
  const buckets = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total"];
  const header = [type === "ar" ? "Customer" : "Vendor", ...buckets];
  const rows: string[][] = [header];

  if (type === "ar") {
    const d = data as ARAgingResult;
    for (const row of d.rows) {
      rows.push([
        row.customerName,
        fmtNum(row.current),
        fmtNum(row.days30),
        fmtNum(row.days60),
        fmtNum(row.days90),
        fmtNum(row.over90),
        fmtNum(row.total),
      ]);
    }
    rows.push([
      "Grand Total",
      fmtNum(d.summary.current),
      fmtNum(d.summary.days30),
      fmtNum(d.summary.days60),
      fmtNum(d.summary.days90),
      fmtNum(d.summary.over90),
      fmtNum(d.summary.total),
    ]);
    rows.push([]);
    rows.push([`${d.controlAccountName} Control Balance`, fmtNum(d.controlBalance)]);
    rows.push([`Ageing Total`, fmtNum(d.summary.total)]);
    rows.push([`Difference`, fmtNum(d.reconciliationDiff)]);
  } else {
    const d = data as APAgingResult;
    for (const row of d.rows) {
      rows.push([
        row.vendorName,
        fmtNum(row.current),
        fmtNum(row.days30),
        fmtNum(row.days60),
        fmtNum(row.days90),
        fmtNum(row.over90),
        fmtNum(row.total),
      ]);
    }
    rows.push([
      "Grand Total",
      fmtNum(d.summary.current),
      fmtNum(d.summary.days30),
      fmtNum(d.summary.days60),
      fmtNum(d.summary.days90),
      fmtNum(d.summary.over90),
      fmtNum(d.summary.total),
    ]);
    rows.push([]);
    rows.push([`${d.controlAccountName} Control Balance`, fmtNum(d.controlBalance)]);
    rows.push([`Ageing Total`, fmtNum(d.summary.total)]);
    rows.push([`Difference`, fmtNum(d.reconciliationDiff)]);
  }

  return rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
}
