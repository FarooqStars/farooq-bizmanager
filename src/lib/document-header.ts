import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";

/**
 * Returns the company profile data for use in document headers.
 * Use this hook in any printable document component.
 */
export function useCompanyProfile() {
  const profile = useQuery(api.companyProfile.get);
  return profile;
}

/**
 * Generates the HTML string for a document header, suitable for print windows.
 * Used across POS receipts, invoices, quotations, purchase orders, etc.
 */
export function getDocumentHeaderHtml(profile: {
  nameEn: string;
  nameAr?: string;
  logoUrl?: string;
  logoStorageId?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  crNumber?: string;
  taxId?: string;
} | null | undefined, logoUrl?: string | null): string {
  if (!profile) {
    return `
      <div style="text-align:center;margin-bottom:16px;">
        <h2 style="margin:0;">BizManager</h2>
      </div>
    `;
  }

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" style="max-width:60px;max-height:60px;object-fit:contain;margin-right:12px;" />`
    : "";

  const contactLines: string[] = [];
  if (profile.phone) contactLines.push(profile.phone);
  if (profile.email) contactLines.push(profile.email);
  if (profile.website) contactLines.push(profile.website);
  if (profile.crNumber) contactLines.push(`CR: ${profile.crNumber}`);
  if (profile.taxId) contactLines.push(`Tax ID: ${profile.taxId}`);

  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #333;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        ${logoHtml}
        <div>
          <h2 style="margin:0;font-size:18px;">${profile.nameEn}</h2>
          ${profile.nameAr ? `<p style="margin:2px 0;font-size:14px;direction:rtl;color:#555;">${profile.nameAr}</p>` : ""}
          ${profile.address ? `<p style="margin:4px 0 0;font-size:11px;color:#666;">${profile.address}</p>` : ""}
        </div>
      </div>
      <div style="text-align:right;font-size:11px;color:#666;line-height:1.6;">
        ${contactLines.map((line) => `<div>${line}</div>`).join("")}
      </div>
    </div>
  `;
}

/**
 * Generates the HTML string for a document footer with terms.
 */
export function getDocumentFooterHtml(profile: {
  invoiceFooterEn?: string;
  invoiceFooterAr?: string;
} | null | undefined): string {
  if (!profile) return "";

  const parts: string[] = [];
  if (profile.invoiceFooterEn) {
    parts.push(`<p style="margin:0;font-size:11px;color:#666;">${profile.invoiceFooterEn}</p>`);
  }
  if (profile.invoiceFooterAr) {
    parts.push(`<p style="margin:4px 0 0;font-size:11px;color:#666;direction:rtl;">${profile.invoiceFooterAr}</p>`);
  }

  if (parts.length === 0) return "";

  return `
    <div style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;">
      ${parts.join("")}
    </div>
  `;
}
