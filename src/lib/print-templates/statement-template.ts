/**
 * Generates printable HTML for a Statement of Account document.
 */
import { getPrintPageCss, formatCurrency, formatDate } from "@/lib/print-utils.ts";

type StatementTransaction = {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
};

type StatementData = {
  entityType: "customer" | "vendor";
  entityName: string;
  entityEmail?: string;
  entityPhone?: string;
  entityAddress?: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  transactions: StatementTransaction[];
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
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

export function generateStatementHtml(
  statement: StatementData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const curr = statement.currency || "QAR";
  const labels = getLabels(lang, statement.entityType);

  const companyHeader = buildCompanyHeader(company, logoUrl);
  const entityInfo = buildEntityInfo(statement, labels);
  const periodInfo = buildPeriodInfo(statement, labels);
  const transactionsTable = buildTransactionsTable(statement, curr, labels, dir);
  const summary = buildSummary(statement, curr, labels);
  const footer = buildFooter(company);

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${labels.title} - ${statement.entityName}</title>
  <style>${css}
    .statement-summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin: 16px 0;
    }
    .summary-card {
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .summary-card .label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #888;
      letter-spacing: 0.5px;
    }
    .summary-card .value {
      font-size: 16px;
      font-weight: 700;
      margin-top: 4px;
    }
    .summary-card .value.positive { color: #dc2626; }
    .summary-card .value.negative { color: #16a34a; }
    .type-badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .type-invoice { background: #dbeafe; color: #1e40af; }
    .type-payment { background: #d1fae5; color: #065f46; }
    .type-credit_note { background: #fef3c7; color: #92400e; }
    .type-bill { background: #fce7f3; color: #9d174d; }
    .type-purchase_order { background: #ede9fe; color: #6b21a8; }
  </style>
</head>
<body>
  <div class="document-container">
    ${companyHeader}
    <div class="document-title">
      <h1>${labels.title}</h1>
      <div class="doc-number">${labels.period}: ${formatDate(statement.startDate)} - ${formatDate(statement.endDate)}</div>
    </div>
    <div class="info-grid">
      ${entityInfo}
      ${periodInfo}
    </div>
    ${summary}
    ${transactionsTable}
    ${footer}
  </div>
  <div class="no-print" style="text-align:center;margin:20px;">
    <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#1a56db;color:white;border:none;border-radius:6px;margin-right:8px;">${labels.print}</button>
    <button onclick="window.close()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#6b7280;color:white;border:none;border-radius:6px;">${labels.close}</button>
  </div>
</body>
</html>`;
}

function getLabels(lang: string, entityType: "customer" | "vendor") {
  if (lang === "ar") {
    return {
      title: entityType === "customer" ? "كشف حساب العميل" : "كشف حساب المورد",
      entityLabel: entityType === "customer" ? "العميل" : "المورد",
      period: "الفترة",
      statementDate: "تاريخ الكشف",
      openingBalance: "الرصيد الافتتاحي",
      closingBalance: "الرصيد الختامي",
      totalDebits: "إجمالي المدين",
      totalCredits: "إجمالي الدائن",
      date: "التاريخ",
      type: "النوع",
      reference: "المرجع",
      description: "الوصف",
      debit: "مدين",
      credit: "دائن",
      balance: "الرصيد",
      print: "طباعة",
      close: "إغلاق",
      noTransactions: "لا توجد معاملات في هذه الفترة",
    };
  }
  if (lang === "ur") {
    return {
      title: entityType === "customer" ? "گاہک اکاؤنٹ اسٹیٹمنٹ" : "وینڈر اکاؤنٹ اسٹیٹمنٹ",
      entityLabel: entityType === "customer" ? "گاہک" : "وینڈر",
      period: "مدت",
      statementDate: "اسٹیٹمنٹ تاریخ",
      openingBalance: "ابتدائی بیلنس",
      closingBalance: "اختتامی بیلنس",
      totalDebits: "کل ڈیبٹ",
      totalCredits: "کل کریڈٹ",
      date: "تاریخ",
      type: "قسم",
      reference: "حوالہ",
      description: "تفصیل",
      debit: "ڈیبٹ",
      credit: "کریڈٹ",
      balance: "بیلنس",
      print: "پرنٹ",
      close: "بند کریں",
      noTransactions: "اس مدت میں کوئی لین دین نہیں",
    };
  }
  return {
    title: entityType === "customer" ? "Customer Statement of Account" : "Vendor Statement of Account",
    entityLabel: entityType === "customer" ? "Customer" : "Vendor",
    period: "Period",
    statementDate: "Statement Date",
    openingBalance: "Opening Balance",
    closingBalance: "Closing Balance",
    totalDebits: "Total Debits",
    totalCredits: "Total Credits",
    date: "Date",
    type: "Type",
    reference: "Reference",
    description: "Description",
    debit: "Debit",
    credit: "Credit",
    balance: "Balance",
    print: "Print",
    close: "Close",
    noTransactions: "No transactions in this period",
  };
}

function buildCompanyHeader(company: CompanyProfile | null | undefined, logoUrl: string | null | undefined): string {
  if (!company) {
    return `<div class="document-header"><div class="company-info"><div><h2 class="company-name">BizManager</h2></div></div></div>`;
  }
  const logo = logoUrl ? `<img src="${logoUrl}" class="company-logo" alt="Logo" />` : "";
  const contacts: string[] = [];
  if (company.phone) contacts.push(company.phone);
  if (company.email) contacts.push(company.email);
  if (company.website) contacts.push(company.website);
  if (company.crNumber) contacts.push(`CR: ${company.crNumber}`);
  if (company.taxId) contacts.push(`Tax ID: ${company.taxId}`);

  return `<div class="document-header">
    <div class="company-info">
      ${logo}
      <div>
        <h2 class="company-name">${escapeHtml(company.nameEn)}</h2>
        ${company.nameAr ? `<p class="company-name-ar">${escapeHtml(company.nameAr)}</p>` : ""}
        ${company.address ? `<p class="company-address">${escapeHtml(company.address)}</p>` : ""}
      </div>
    </div>
    <div class="company-contacts">
      ${contacts.map((c) => `<div>${escapeHtml(c)}</div>`).join("")}
    </div>
  </div>`;
}

function buildEntityInfo(statement: StatementData, labels: ReturnType<typeof getLabels>): string {
  return `<div class="info-box">
    <div class="info-box-title">${labels.entityLabel}</div>
    <p class="name">${escapeHtml(statement.entityName)}</p>
    ${statement.entityAddress ? `<p>${escapeHtml(statement.entityAddress)}</p>` : ""}
    ${statement.entityPhone ? `<p>${escapeHtml(statement.entityPhone)}</p>` : ""}
    ${statement.entityEmail ? `<p>${escapeHtml(statement.entityEmail)}</p>` : ""}
  </div>`;
}

function buildPeriodInfo(statement: StatementData, labels: ReturnType<typeof getLabels>): string {
  const today = new Date().toISOString().split("T")[0];
  return `<div class="info-box">
    <div class="info-box-title">${labels.period}</div>
    <p><strong>${labels.statementDate}:</strong> ${formatDate(today)}</p>
    <p><strong>From:</strong> ${formatDate(statement.startDate)}</p>
    <p><strong>To:</strong> ${formatDate(statement.endDate)}</p>
  </div>`;
}

function buildSummary(statement: StatementData, curr: string, labels: ReturnType<typeof getLabels>): string {
  const closingClass = statement.closingBalance > 0 ? "positive" : statement.closingBalance < 0 ? "negative" : "";
  return `<div class="statement-summary">
    <div class="summary-card">
      <div class="label">${labels.openingBalance}</div>
      <div class="value">${formatCurrency(statement.openingBalance, curr)}</div>
    </div>
    <div class="summary-card">
      <div class="label">${labels.totalDebits} / ${labels.totalCredits}</div>
      <div class="value">${formatCurrency(statement.totalDebits, curr)} / ${formatCurrency(statement.totalCredits, curr)}</div>
    </div>
    <div class="summary-card">
      <div class="label">${labels.closingBalance}</div>
      <div class="value ${closingClass}">${formatCurrency(statement.closingBalance, curr)}</div>
    </div>
  </div>`;
}

function buildTransactionsTable(statement: StatementData, curr: string, labels: ReturnType<typeof getLabels>, _dir: string): string {
  if (statement.transactions.length === 0) {
    return `<div style="text-align:center;padding:40px;color:#888;font-size:14px;">${labels.noTransactions}</div>`;
  }

  let runningBalance = statement.openingBalance;

  // Opening balance row
  let rows = `<tr style="background:#f9fafb;font-weight:600;">
    <td></td><td></td><td></td><td>${labels.openingBalance}</td>
    <td class="amount"></td><td class="amount"></td>
    <td class="amount">${formatCurrency(runningBalance, curr)}</td>
  </tr>`;

  for (const t of statement.transactions) {
    runningBalance += t.debit - t.credit;
    rows += `<tr>
      <td>${formatDate(t.date)}</td>
      <td><span class="type-badge type-${t.type}">${t.type.replace("_", " ")}</span></td>
      <td>${escapeHtml(t.reference)}</td>
      <td>${escapeHtml(t.description)}</td>
      <td class="amount">${t.debit > 0 ? formatCurrency(t.debit, curr) : "-"}</td>
      <td class="amount">${t.credit > 0 ? formatCurrency(t.credit, curr) : "-"}</td>
      <td class="amount" style="font-weight:600;">${formatCurrency(runningBalance, curr)}</td>
    </tr>`;
  }

  // Closing balance row
  rows += `<tr style="background:#f0f9ff;font-weight:700;border-top:2px solid #333;">
    <td></td><td></td><td></td><td>${labels.closingBalance}</td>
    <td class="amount">${formatCurrency(statement.totalDebits, curr)}</td>
    <td class="amount">${formatCurrency(statement.totalCredits, curr)}</td>
    <td class="amount">${formatCurrency(statement.closingBalance, curr)}</td>
  </tr>`;

  return `<table class="items-table">
    <thead>
      <tr>
        <th>${labels.date}</th>
        <th>${labels.type}</th>
        <th>${labels.reference}</th>
        <th>${labels.description}</th>
        <th class="amount">${labels.debit}</th>
        <th class="amount">${labels.credit}</th>
        <th class="amount">${labels.balance}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildFooter(company: CompanyProfile | null | undefined): string {
  if (!company) return "";
  const parts: string[] = [];
  if (company.invoiceFooterEn) parts.push(`<p>${escapeHtml(company.invoiceFooterEn)}</p>`);
  if (company.invoiceFooterAr) parts.push(`<p style="direction:rtl">${escapeHtml(company.invoiceFooterAr)}</p>`);
  if (parts.length === 0) return "";
  return `<div class="footer-terms">${parts.join("")}</div>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
