/**
 * Generates printable HTML for AR/AP Aging Reports.
 */
import { getPrintPageCss, formatCurrency, formatDate } from "@/lib/print-utils.ts";

type AgingRow = {
  name: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120: number;
  over120: number;
  total: number;
};

type AgingDetailRow = {
  reference: string;
  entityName: string;
  dueDate: string;
  amount: number;
  balance: number;
  daysPast: number;
  bucket: string;
};

type AgingReportData = {
  type: "receivable" | "payable";
  asOfDate: string;
  summary: {
    current: number;
    days30: number;
    days60: number;
    days90: number;
    days120: number;
    over120: number;
  };
  totalOutstanding: number;
  byEntity: AgingRow[];
  details?: AgingDetailRow[];
  currency?: string;
};

type CompanyProfile = {
  nameEn: string;
  nameAr?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  crNumber?: string;
  taxId?: string;
  invoiceFooterEn?: string;
  invoiceFooterAr?: string;
};

function buildCompanyHeader(company: CompanyProfile | null | undefined, logoUrl: string | null | undefined, dir: string): string {
  if (!company) return "";
  const logo = logoUrl ? `<img src="${logoUrl}" style="max-height:60px;max-width:180px;" alt="Logo" />` : "";
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #333;padding-bottom:12px;">
      <div style="flex:1;">
        ${logo}
        <h2 style="margin:4px 0 0;font-size:18px;">${company.nameEn}</h2>
        ${company.nameAr ? `<h3 style="margin:2px 0;font-size:14px;color:#555;direction:rtl;">${company.nameAr}</h3>` : ""}
      </div>
      <div style="text-align:${dir === "rtl" ? "left" : "right"};font-size:11px;color:#555;">
        ${company.address ? `<div>${company.address}</div>` : ""}
        ${company.phone ? `<div>Tel: ${company.phone}</div>` : ""}
        ${company.email ? `<div>${company.email}</div>` : ""}
        ${company.crNumber ? `<div>CR: ${company.crNumber}</div>` : ""}
        ${company.taxId ? `<div>Tax ID: ${company.taxId}</div>` : ""}
      </div>
    </div>
  `;
}

export function generateAgingReportHtml(
  data: AgingReportData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const curr = data.currency || "QAR";

  const title = data.type === "receivable"
    ? "Accounts Receivable Aging Report / تقرير أعمار الذمم المدينة"
    : "Accounts Payable Aging Report / تقرير أعمار الذمم الدائنة";

  const entityLabel = data.type === "receivable" ? "Customer" : "Vendor";

  const companyHeader = buildCompanyHeader(company, logoUrl, dir);

  // Summary table
  const summaryTable = `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#f4f4f4;">
          <th style="padding:8px;border:1px solid #ddd;text-align:center;font-size:11px;">Current</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;font-size:11px;">1-30 Days</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;font-size:11px;">31-60 Days</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;font-size:11px;">61-90 Days</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;font-size:11px;">91-120 Days</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;font-size:11px;">120+ Days</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;font-size:11px;font-weight:bold;">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-size:12px;">${formatCurrency(data.summary.current, curr)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-size:12px;">${formatCurrency(data.summary.days30, curr)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-size:12px;">${formatCurrency(data.summary.days60, curr)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-size:12px;">${formatCurrency(data.summary.days90, curr)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-size:12px;color:#b45309;">${formatCurrency(data.summary.days120, curr)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-size:12px;color:#dc2626;">${formatCurrency(data.summary.over120, curr)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-size:12px;font-weight:bold;">${formatCurrency(data.totalOutstanding, curr)}</td>
        </tr>
      </tbody>
    </table>
  `;

  // By entity table
  const entityRows = data.byEntity.map((row) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #ddd;font-size:11px;">${row.name}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">${row.current > 0 ? formatCurrency(row.current, curr) : "—"}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">${row.days30 > 0 ? formatCurrency(row.days30, curr) : "—"}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">${row.days60 > 0 ? formatCurrency(row.days60, curr) : "—"}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">${row.days90 > 0 ? formatCurrency(row.days90, curr) : "—"}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;color:#b45309;">${row.days120 > 0 ? formatCurrency(row.days120, curr) : "—"}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;color:#dc2626;">${row.over120 > 0 ? formatCurrency(row.over120, curr) : "—"}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;font-weight:bold;">${formatCurrency(row.total, curr)}</td>
    </tr>
  `).join("");

  const entityTable = `
    <h3 style="font-size:13px;margin:24px 0 8px;">By ${entityLabel}</h3>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f4f4f4;">
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;font-size:11px;">${entityLabel}</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">Current</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">1-30</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">31-60</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">61-90</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">91-120</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">120+</th>
          <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">Total</th>
        </tr>
      </thead>
      <tbody>${entityRows}</tbody>
    </table>
  `;

  // Detail table (optional)
  let detailTable = "";
  if (data.details && data.details.length > 0) {
    const bucketLabel = (b: string) => {
      switch (b) {
        case "current": return "Current";
        case "days30": return "1-30";
        case "days60": return "31-60";
        case "days90": return "61-90";
        case "days120": return "91-120";
        case "over120": return "120+";
        default: return b;
      }
    };

    const detailRows = data.details.map((d) => `
      <tr>
        <td style="padding:5px 6px;border:1px solid #ddd;font-size:10px;">${d.reference}</td>
        <td style="padding:5px 6px;border:1px solid #ddd;font-size:10px;">${d.entityName}</td>
        <td style="padding:5px 6px;border:1px solid #ddd;font-size:10px;text-align:center;">${formatDate(d.dueDate)}</td>
        <td style="padding:5px 6px;border:1px solid #ddd;font-size:10px;text-align:right;">${formatCurrency(d.balance, curr)}</td>
        <td style="padding:5px 6px;border:1px solid #ddd;font-size:10px;text-align:center;">${d.daysPast}</td>
        <td style="padding:5px 6px;border:1px solid #ddd;font-size:10px;text-align:center;">${bucketLabel(d.bucket)}</td>
      </tr>
    `).join("");

    detailTable = `
      <h3 style="font-size:13px;margin:24px 0 8px;page-break-before:auto;">Detailed Breakdown</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f4f4f4;">
            <th style="padding:5px 6px;border:1px solid #ddd;text-align:left;font-size:10px;">Reference</th>
            <th style="padding:5px 6px;border:1px solid #ddd;text-align:left;font-size:10px;">${entityLabel}</th>
            <th style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-size:10px;">Due Date</th>
            <th style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-size:10px;">Balance</th>
            <th style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-size:10px;">Days Past</th>
            <th style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-size:10px;">Bucket</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>${css}
    @media print { .no-print { display: none !important; } }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; margin: 0; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:16px;">
    <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#2563eb;color:#fff;border:none;border-radius:6px;">Print</button>
    <button onclick="window.close()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#6b7280;color:#fff;border:none;border-radius:6px;margin-left:8px;">Close</button>
  </div>
  ${companyHeader}
  <h1 style="font-size:16px;text-align:center;margin:8px 0;">${title}</h1>
  <p style="text-align:center;font-size:11px;color:#555;">As of ${formatDate(data.asOfDate)}</p>
  ${summaryTable}
  ${entityTable}
  ${detailTable}
  ${company?.invoiceFooterEn ? `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#666;text-align:center;">${company.invoiceFooterEn}</div>` : ""}
</body>
</html>`;
}
