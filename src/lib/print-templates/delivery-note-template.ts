/**
 * Generates printable HTML for a Delivery Note document.
 */
import { getPrintPageCss, formatDate } from "@/lib/print-utils.ts";

type DeliveryNoteData = {
  noteNumber: string;
  date: string;
  status: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryAddress?: string;
  driverName?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  vehicleDescription?: string;
  receiverName?: string;
  items: { description: string; quantity: number; unitPrice?: number }[];
  notes?: string;
  saleRef?: string;
  invoiceRef?: string;
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

export function generateDeliveryNoteHtml(
  note: DeliveryNoteData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const labels = getLabels(lang);

  const companyHeader = buildCompanyHeader(company, logoUrl);
  const customerInfo = buildCustomerInfo(note, labels);
  const deliveryInfo = buildDeliveryInfo(note, labels);
  const itemsTable = buildItemsTable(note.items, labels);
  const transportInfo = buildTransportInfo(note, labels);
  const notes = note.notes ? `<div class="notes-section"><h3>${labels.notes}</h3><p>${escapeHtml(note.notes)}</p></div>` : "";
  const footer = buildFooter(company);
  const signature = buildSignature(labels);

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${labels.deliveryNote} ${note.noteNumber}</title>
  <style>${css}
    .transport-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 16px 0;
    }
    .transport-box {
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 12px;
    }
    .transport-box-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .transport-box p {
      margin: 2px 0;
      font-size: 12px;
    }
    .reference-line {
      font-size: 11px;
      color: #666;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="document-container">
    ${companyHeader}
    <div class="document-title">
      <h1>${labels.deliveryNote}</h1>
      <div class="doc-number">${note.noteNumber} &bull; <span class="status-badge status-${note.status}">${note.status}</span></div>
      ${note.saleRef ? `<div class="reference-line">${labels.saleRef}: ${note.saleRef}</div>` : ""}
      ${note.invoiceRef ? `<div class="reference-line">${labels.invoiceRef}: ${note.invoiceRef}</div>` : ""}
    </div>
    <div class="info-grid">
      ${customerInfo}
      ${deliveryInfo}
    </div>
    ${transportInfo}
    ${itemsTable}
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
      deliveryNote: "إشعار تسليم",
      deliverTo: "تسليم إلى",
      details: "تفاصيل التسليم",
      date: "التاريخ",
      address: "عنوان التسليم",
      driver: "معلومات السائق",
      driverName: "اسم السائق",
      driverPhone: "هاتف السائق",
      vehicle: "معلومات المركبة",
      vehiclePlate: "رقم اللوحة",
      vehicleDesc: "وصف المركبة",
      receiver: "المستلم",
      num: "#",
      description: "الوصف",
      qty: "الكمية",
      notes: "ملاحظات",
      print: "طباعة",
      close: "إغلاق",
      authorizedSignature: "التوقيع المعتمد",
      receiverSignature: "توقيع المستلم",
      saleRef: "مرجع البيع",
      invoiceRef: "مرجع الفاتورة",
    };
  }
  if (lang === "ur") {
    return {
      deliveryNote: "ڈلیوری نوٹ",
      deliverTo: "ترسیل بنام",
      details: "ڈلیوری تفصیلات",
      date: "تاریخ",
      address: "ڈلیوری پتہ",
      driver: "ڈرائیور معلومات",
      driverName: "ڈرائیور کا نام",
      driverPhone: "ڈرائیور فون",
      vehicle: "گاڑی کی معلومات",
      vehiclePlate: "نمبر پلیٹ",
      vehicleDesc: "گاڑی کی تفصیل",
      receiver: "وصول کنندہ",
      num: "#",
      description: "تفصیل",
      qty: "مقدار",
      notes: "نوٹس",
      print: "پرنٹ",
      close: "بند کریں",
      authorizedSignature: "مجاز دستخط",
      receiverSignature: "وصول کنندہ کے دستخط",
      saleRef: "سیل حوالہ",
      invoiceRef: "انوائس حوالہ",
    };
  }
  return {
    deliveryNote: "DELIVERY NOTE",
    deliverTo: "Deliver To",
    details: "Delivery Details",
    date: "Date",
    address: "Delivery Address",
    driver: "Driver Information",
    driverName: "Driver Name",
    driverPhone: "Driver Phone",
    vehicle: "Vehicle Information",
    vehiclePlate: "Plate Number",
    vehicleDesc: "Vehicle",
    receiver: "Receiver",
    num: "#",
    description: "Description",
    qty: "Qty",
    notes: "Notes",
    print: "Print",
    close: "Close",
    authorizedSignature: "Authorized Signature",
    receiverSignature: "Receiver Signature",
    saleRef: "Sale Ref",
    invoiceRef: "Invoice Ref",
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

function buildCustomerInfo(note: DeliveryNoteData, labels: ReturnType<typeof getLabels>): string {
  return `<div class="info-box">
    <div class="info-box-title">${labels.deliverTo}</div>
    <p class="name">${escapeHtml(note.customerName)}</p>
    ${note.customerAddress ? `<p>${escapeHtml(note.customerAddress)}</p>` : ""}
    ${note.customerPhone ? `<p>${escapeHtml(note.customerPhone)}</p>` : ""}
    ${note.customerEmail ? `<p>${escapeHtml(note.customerEmail)}</p>` : ""}
  </div>`;
}

function buildDeliveryInfo(note: DeliveryNoteData, labels: ReturnType<typeof getLabels>): string {
  return `<div class="info-box">
    <div class="info-box-title">${labels.details}</div>
    <p><strong>${labels.date}:</strong> ${formatDate(note.date)}</p>
    ${note.deliveryAddress ? `<p><strong>${labels.address}:</strong> ${escapeHtml(note.deliveryAddress)}</p>` : ""}
    ${note.receiverName ? `<p><strong>${labels.receiver}:</strong> ${escapeHtml(note.receiverName)}</p>` : ""}
  </div>`;
}

function buildTransportInfo(note: DeliveryNoteData, labels: ReturnType<typeof getLabels>): string {
  const hasDriver = note.driverName || note.driverPhone;
  const hasVehicle = note.vehiclePlate || note.vehicleDescription;
  if (!hasDriver && !hasVehicle) return "";

  return `<div class="transport-grid">
    ${hasDriver ? `<div class="transport-box">
      <div class="transport-box-title">${labels.driver}</div>
      ${note.driverName ? `<p><strong>${labels.driverName}:</strong> ${escapeHtml(note.driverName)}</p>` : ""}
      ${note.driverPhone ? `<p><strong>${labels.driverPhone}:</strong> ${escapeHtml(note.driverPhone)}</p>` : ""}
    </div>` : ""}
    ${hasVehicle ? `<div class="transport-box">
      <div class="transport-box-title">${labels.vehicle}</div>
      ${note.vehiclePlate ? `<p><strong>${labels.vehiclePlate}:</strong> ${escapeHtml(note.vehiclePlate)}</p>` : ""}
      ${note.vehicleDescription ? `<p><strong>${labels.vehicleDesc}:</strong> ${escapeHtml(note.vehicleDescription)}</p>` : ""}
    </div>` : ""}
  </div>`;
}

function buildItemsTable(items: DeliveryNoteData["items"], labels: ReturnType<typeof getLabels>): string {
  const rows = items.map((item, idx) => `
    <tr>
      <td class="num">${idx + 1}</td>
      <td>${escapeHtml(item.description)}</td>
      <td class="num">${item.quantity}</td>
    </tr>
  `).join("");

  return `<table class="items-table">
    <thead>
      <tr>
        <th class="num">${labels.num}</th>
        <th>${labels.description}</th>
        <th class="num">${labels.qty}</th>
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

function buildSignature(labels: ReturnType<typeof getLabels>): string {
  return `<div class="signature-area">
    <div class="signature-box"><div class="signature-line">${labels.authorizedSignature}</div></div>
    <div class="signature-box"><div class="signature-line">${labels.receiverSignature}</div></div>
  </div>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
