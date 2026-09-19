/**
 * Hook that provides print functionality for documents.
 * Loads company profile data and logo URL, then generates printable HTML.
 */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { openPrintWindow } from "@/lib/print-utils.ts";
import { generateInvoiceHtml } from "@/lib/print-templates/invoice-template.ts";
import { generateQuotationHtml } from "@/lib/print-templates/quotation-template.ts";
import { generatePurchaseOrderHtml } from "@/lib/print-templates/purchase-order-template.ts";
import { generatePaymentReceiptHtml } from "@/lib/print-templates/receipt-template.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export function usePrintDocument() {
  const { i18n } = useTranslation();
  const profile = useQuery(api.companyProfile.get);
  const logoUrl = useQuery(
    api.companyProfile.getLogoUrl,
    profile?.logoStorageId ? { storageId: profile.logoStorageId as Id<"_storage"> } : "skip"
  );

  const currentLang = i18n.language || "en";

  function printInvoice(invoice: Parameters<typeof generateInvoiceHtml>[0], lang?: string) {
    const html = generateInvoiceHtml(invoice, profile, logoUrl, lang || currentLang);
    openPrintWindow(html);
  }

  function printQuotation(quotation: Parameters<typeof generateQuotationHtml>[0], lang?: string) {
    const html = generateQuotationHtml(quotation, profile, logoUrl, lang || currentLang);
    openPrintWindow(html);
  }

  function printPurchaseOrder(po: Parameters<typeof generatePurchaseOrderHtml>[0], lang?: string) {
    const html = generatePurchaseOrderHtml(po, profile, logoUrl, lang || currentLang);
    openPrintWindow(html);
  }

  function printReceipt(receipt: Parameters<typeof generatePaymentReceiptHtml>[0], lang?: string) {
    const html = generatePaymentReceiptHtml(receipt, profile, logoUrl, lang || currentLang);
    openPrintWindow(html);
  }

  return {
    printInvoice,
    printQuotation,
    printPurchaseOrder,
    printReceipt,
    isReady: profile !== undefined,
  };
}
