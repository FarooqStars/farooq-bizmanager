// Shared utilities for report components

import { formatMoney } from "@/hooks/use-currency.ts";

export function fmt(n: number, currency = "QAR") {
  return formatMoney(n, currency);
}

export function fmtCompact(n: number, currency = "QAR") {
  const symbol = currency === "USD" ? "$" : currency === "QAR" ? "QR" : "";
  if (n >= 1000000) return `${symbol}${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${symbol}${(n / 1000).toFixed(1)}K`;
  return fmt(n, currency);
}

export function tooltipFmt(value: unknown) {
  return [fmt(Number(value)), "Revenue"];
}

export function tooltipFmtAmount(value: unknown) {
  return [fmt(Number(value)), "Amount"];
}

export function tooltipFmtExpense(value: unknown) {
  return fmt(Number(value));
}

export function tooltipLabelDate(label: unknown) {
  return new Date(String(label)).toLocaleDateString();
}

export const CHART_COLORS = [
  "oklch(0.646 0.222 41.116)",
  "oklch(0.6 0.118 184.704)",
  "oklch(0.398 0.07 227.392)",
  "oklch(0.828 0.189 84.429)",
  "oklch(0.769 0.188 70.08)",
  "oklch(0.488 0.243 264.376)",
  "oklch(0.7 0.15 150)",
  "oklch(0.55 0.2 300)",
];
