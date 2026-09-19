import { useSystemDefaults } from "@/hooks/use-system-defaults.ts";

/**
 * Currency symbol mapping for quick display (no Intl overhead).
 * Falls back to the 3-letter code if unknown.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  QAR: "QR",
  AED: "AED",
  SAR: "SAR",
  PKR: "Rs",
  INR: "₹",
  BHD: "BD",
  KWD: "KD",
  OMR: "OMR",
  EGP: "E£",
  JOD: "JD",
  CAD: "CA$",
};

export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

/**
 * Formats an amount with the given currency code using Intl.NumberFormat.
 * Works without React context — pass the currency code directly.
 */
export function formatMoney(amount: number, currencyCode: string, opts?: { maximumFractionDigits?: number }): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: opts?.maximumFractionDigits ?? 2,
  }).format(amount);
}

/**
 * React hook that returns a `fmt` function pre-configured with the system default currency.
 * Use inside components that need to display formatted currency values.
 */
export function useCurrency() {
  const { defaultCurrency } = useSystemDefaults();

  const fmt = (amount: number, overrideCurrency?: string, opts?: { maximumFractionDigits?: number }) => {
    return formatMoney(amount, overrideCurrency ?? defaultCurrency, opts);
  };

  return { fmt, currency: defaultCurrency, symbol: getCurrencySymbol(defaultCurrency) };
}
