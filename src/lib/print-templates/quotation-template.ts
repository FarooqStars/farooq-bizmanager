/**
 * Generates printable HTML for a Quotation document.
 */
import { getPrintPageCss, formatCurrency, formatDate } from "@/lib/print-utils.ts";
import { numberToWords } from "@/lib/number-to-words.ts";

type QuotationData = {
  quoteNumber: string;
  date: string;
  validUntil: string;
  status: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: { description: string; quantity: number; unitPrice: number; subtotal: number }[];
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  discount?: number;
  totalAmount: number;
  currency?: string;
  notes?: string;
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

export function generateQuotationHtml(
  quotation: QuotationData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const curr = quotation.currency || "QAR";
  const labels = getLabels(lang);

  const companyHeader = buildCompanyHeader(company, logoUrl);
  const amountWords = numberToWords(quotation.totalAmount, lang);

  const customerInfo = `<div class="info-box">
    <div class="info-box-title">${labels.quoteTo}</div>
    <p class="name">${escapeHtml(quotation.customerName)}</p>
    ${quotation.customerAddress ? `<p>${escapeHtml(quotation.customerAddress)}</p>` : ""}
    ${quotation.customerPhone ? `<p>${escapeHtml(quotation.customerPhone)}</p>` : ""}
    ${quotation.customerEmail ? `<p>${escapeHtml(quotation.customerEmail)}</p>` : ""}
  </div>`;

  const documentInfo = `<div class="info-box">
    <div class="info-box-title">${labels.details}</div>
    <p><strong>${labels.date}:</strong> ${formatDate(quotation.date)}</p>
    <p><strong>${labels.validUntil}:</strong> ${formatDate(quotation.validUntil)}</p>
  </div>`;

  const rows = quotation.items.map((item, idx) => `
    <tr>
      <td class="num">${idx + 1}</td>
      <td>${escapeHtml(item.description)}</td>
      <td class="num">${item.quantity}</td>
      <td class="amount">${formatCurrency(item.unitPrice, curr)}</td>
      <td class="amount">${formatCurrency(item.subtotal, curr)}</td>
    </tr>
  `).join("");

  const itemsTable = `<table class="items-table">
    <thead><tr>
      <th class="num">${labels.num}</th>
      <th>${labels.description}</th>
      <th class="num">${labels.qty}</th>
      <th class="amount">${labels.unitPrice}</th>
      <th class="amount">${labels.amount}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  let totalsRows = `<tr><td>${labels.subtotal}</td><td>${formatCurrency(quotation.subtotal, curr)}</td></tr>`;
  if (quotation.discount) {
    totalsRows += `<tr><td>${labels.discount}</td><td>-${formatCurrency(quotation.discount, curr)}</td></tr>`;
  }
  if (quotation.taxAmount) {
    totalsRows += `<tr><td>${labels.tax} (${quotation.taxRate || 0}%)</td><td>${formatCurrency(quotation.taxAmount, curr)}</td></tr>`;
  }
  totalsRows += `<tr class="total-row"><td>${labels.total}</td><td>${formatCurrency(quotation.totalAmount, curr)}</td></tr>`;

  const notes = quotation.notes ? `<div class="notes-section"><h3>${labels.notes}</h3><p>${escapeHtml(quotation.notes)}</p></div>` : "";
  const footer = buildFooter(company);
  const signature = `<div class="signature-area">
    <div class="signature-box"><div class="signature-line">${labels.authorizedSignature}</div></div>
    <div class="signature-box"><div class="signature-line">${labels.customerAcceptance}</div></div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${labels.quotation} ${quotation.quoteNumber}</title>
  <style>${css}</style>
</head>
<body>
  <div class="document-container">
    ${companyHeader}
    <div class="document-title">
      <h1>${labels.quotation}</h1>
      <div class="doc-number">${quotation.quoteNumber} &bull; <span class="status-badge status-${quotation.status}">${quotation.status}</span></div>
    </div>
    <div class="info-grid">
      ${customerInfo}
      ${documentInfo}
    </div>
    ${itemsTable}
    <div class="totals-section"><table class="totals-table">${totalsRows}</table></div>
    <div class="amount-words"><strong>${labels.amountInWords}:</strong> ${amountWords} ${curr}</div>
    ${notes}
    ${footer}
    ${signature}
  </div>
  <div class="no-print" style="text-align:center;margin:20px;">
    <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#1a56db;color:white;border:none;border-radius:6px;margin-right:8px;">${labels.print}</button>
    <button onclick="window.close()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#6b7280;color:white;border:none;border-radius:6px;">${labels.close}</button>
  </div>
</body>
</html>`;
}

function getLabels(lang: string) {
  if (lang === "ar") {
    return {
      quotation: "عرض سعر",
      quoteTo: "عرض سعر إلى",
      details: "تفاصيل العرض",
      date: "التاريخ",
      validUntil: "صالح حتى",
      num: "#",
      description: "الوصف",
      qty: "الكمية",
      unitPrice: "سعر الوحدة",
      amount: "المبلغ",
      subtotal: "المجموع الفرعي",
      tax: "الضريبة",
      discount: "الخصم",
      total: "الإجمالي",
      amountInWords: "المبلغ بالحروف",
      notes: "ملاحظات",
      print: "طباعة",
      close: "إغلاق",
      authorizedSignature: "التوقيع المعتمد",
      customerAcceptance: "قبول العميل",
    };
  }
  if (lang === "ur") {
    return {
      quotation: "کوٹیشن",
      quoteTo: "کوٹیشن بنام",
      details: "کوٹیشن تفصیلات",
      date: "تاریخ",
      validUntil: "درست تاریخ تک",
      num: "#",
      description: "تفصیل",
      qty: "مقدار",
      unitPrice: "یونٹ قیمت",
      amount: "رقم",
      subtotal: "ذیلی کل",
      tax: "ٹیکس",
      discount: "رعایت",
      total: "کل رقم",
      amountInWords: "رقم بالفاظ",
      notes: "نوٹس",
      print: "پرنٹ",
      close: "بند کریں",
      authorizedSignature: "مجاز دستخط",
      customerAcceptance: "گاہک کی منظوری",
    };
  }
  return {
    quotation: "QUOTATION",
    quoteTo: "Quote To",
    details: "Quotation Details",
    date: "Date",
    validUntil: "Valid Until",
    num: "#",
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit Price",
    amount: "Amount",
    subtotal: "Subtotal",
    tax: "Tax",
    discount: "Discount",
    total: "Total",
    amountInWords: "Amount in Words",
    notes: "Notes",
    print: "Print",
    close: "Close",
    authorizedSignature: "Authorized Signature",
    customerAcceptance: "Customer Acceptance",
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
