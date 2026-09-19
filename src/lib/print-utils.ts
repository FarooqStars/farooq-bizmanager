/**
 * Shared utilities for printable A4 documents.
 * Provides print CSS, print/download functions, and formatting helpers.
 */

/** Print CSS that hides navigation and formats A4 pages */
export const PRINT_STYLES = `
  @media print {
    @page {
      size: A4;
      margin: 15mm 20mm;
    }
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .no-print {
      display: none !important;
    }
  }
`;

/** Full page print CSS for a standalone print window */
export function getPrintPageCss(direction: "ltr" | "rtl" = "ltr"): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 15mm 20mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1a1a1a;
      background: white;
      direction: ${direction};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .document-container {
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    .document-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 14px;
      border-bottom: 2px solid #1a1a1a;
    }
    .company-info {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .company-logo {
      max-width: 70px;
      max-height: 70px;
      object-fit: contain;
    }
    .company-name {
      font-size: 20px;
      font-weight: 700;
      margin: 0;
    }
    .company-name-ar {
      font-size: 16px;
      color: #555;
      direction: rtl;
      margin: 2px 0;
    }
    .company-address {
      font-size: 11px;
      color: #666;
      margin-top: 4px;
    }
    .company-contacts {
      text-align: ${direction === "rtl" ? "left" : "right"};
      font-size: 11px;
      color: #666;
      line-height: 1.8;
    }
    .document-title {
      text-align: center;
      margin: 16px 0;
    }
    .document-title h1 {
      font-size: 22px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0;
    }
    .document-title .doc-number {
      font-size: 13px;
      color: #666;
      margin-top: 4px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 16px 0;
    }
    .info-box {
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 12px;
    }
    .info-box-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .info-box p {
      margin: 2px 0;
      font-size: 12px;
    }
    .info-box .name {
      font-weight: 600;
      font-size: 13px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .items-table th {
      background: #f5f5f5;
      border: 1px solid #ddd;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      text-align: ${direction === "rtl" ? "right" : "left"};
    }
    .items-table th.num {
      text-align: center;
      width: 40px;
    }
    .items-table th.amount {
      text-align: ${direction === "rtl" ? "left" : "right"};
    }
    .items-table td {
      border: 1px solid #ddd;
      padding: 8px 10px;
      font-size: 12px;
      vertical-align: top;
    }
    .items-table td.num {
      text-align: center;
    }
    .items-table td.amount {
      text-align: ${direction === "rtl" ? "left" : "right"};
      font-variant-numeric: tabular-nums;
    }
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin: 16px 0;
    }
    .totals-table {
      width: 280px;
      border-collapse: collapse;
    }
    .totals-table td {
      padding: 6px 10px;
      font-size: 12px;
      border-bottom: 1px solid #eee;
    }
    .totals-table td:last-child {
      text-align: ${direction === "rtl" ? "left" : "right"};
      font-variant-numeric: tabular-nums;
    }
    .totals-table .total-row td {
      font-size: 14px;
      font-weight: 700;
      border-top: 2px solid #333;
      border-bottom: 2px solid #333;
      padding: 8px 10px;
    }
    .amount-words {
      margin: 12px 0;
      padding: 8px 12px;
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 11px;
      font-style: italic;
    }
    .notes-section {
      margin: 16px 0;
      padding: 12px;
      background: #fafafa;
      border-radius: 4px;
    }
    .notes-section h3 {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 4px;
    }
    .notes-section p {
      font-size: 12px;
      white-space: pre-wrap;
    }
    .footer-terms {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
    }
    .footer-terms p {
      font-size: 10px;
      color: #888;
      margin: 2px 0;
    }
    .signature-area {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 40px;
      padding-top: 16px;
    }
    .signature-box {
      text-align: center;
    }
    .signature-line {
      border-top: 1px solid #aaa;
      margin-top: 50px;
      padding-top: 6px;
      font-size: 11px;
      color: #666;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-paid { background: #d4edda; color: #155724; }
    .status-draft { background: #f0f0f0; color: #555; }
    .status-sent { background: #cce5ff; color: #004085; }
    .status-overdue { background: #f8d7da; color: #721c24; }
    .status-void { background: #e2e3e5; color: #383d41; }
    .status-accepted { background: #d4edda; color: #155724; }
    .status-rejected { background: #f8d7da; color: #721c24; }
    .status-received { background: #d4edda; color: #155724; }

    @media screen {
      body { background: #eee; }
      .document-container {
        background: white;
        box-shadow: 0 2px 16px rgba(0,0,0,0.1);
        margin: 20px auto;
        padding: 40px;
        min-height: 297mm;
      }
    }
    @media print {
      .no-print { display: none !important; }
      body { background: white; }
      .document-container {
        box-shadow: none;
        margin: 0;
        padding: 0;
      }
    }
  `;
}

/** Format currency with appropriate symbol */
export function formatCurrency(amount: number, currency?: string): string {
  const curr = currency || "QAR";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: curr,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format date for display */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Open a print window with the given HTML content */
export function openPrintWindow(htmlContent: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  // Small delay to ensure content renders
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
