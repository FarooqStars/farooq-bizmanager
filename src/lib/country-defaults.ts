/**
 * Country defaults configuration.
 * When a Default Country is set in Company Profile, the system uses these
 * defaults system-wide. All defaults are overridable by admin.
 */

export type CountryCode = "QA" | "AE" | "SA" | "PK" | "IN" | "BH" | "KW" | "OM" | "EG" | "JO" | "US" | "CA";

export type CountryConfig = {
  code: CountryCode;
  name: string;
  nameAr: string;
  nameUr: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  taxLabel: string;
  taxRate: number; // Default VAT/GST rate
  taxEnabled: boolean; // Whether tax is enabled by default
  dateFormat: string; // e.g. "dd/MM/yyyy"
  phoneCode: string;
  crLabel: string; // Company Registration # label
  taxIdLabel: string; // Tax registration # label
  fiscalYearStartMonth: number; // 1-12, month the fiscal year starts (1=January)
  idLabels: {
    primary: string; // e.g. "QID", "Emirates ID", "Iqama", "CNIC", "Aadhaar"
    secondary: string; // e.g. "Health Card #", "Labour Card #", "GOSI #", "EOBI #", "PAN"
    tertiary?: string; // e.g. "UAN" for India
  };
};

export const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  QA: {
    code: "QA",
    name: "Qatar",
    nameAr: "قطر",
    nameUr: "قطر",
    flag: "🇶🇦",
    currency: "QAR",
    currencySymbol: "QR",
    taxLabel: "VAT",
    taxRate: 0,
    taxEnabled: false, // Not yet implemented in Qatar
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+974",
    crLabel: "CR Number",
    taxIdLabel: "Tax Registration Number",
    fiscalYearStartMonth: 1, // January
    idLabels: {
      primary: "QID (Qatar ID)",
      secondary: "Health Card Number",
    },
  },
  AE: {
    code: "AE",
    name: "United Arab Emirates",
    nameAr: "الإمارات العربية المتحدة",
    nameUr: "متحدہ عرب امارات",
    flag: "🇦🇪",
    currency: "AED",
    currencySymbol: "AED",
    taxLabel: "VAT",
    taxRate: 5,
    taxEnabled: true,
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+971",
    crLabel: "Trade License Number",
    taxIdLabel: "TRN (Tax Registration Number)",
    fiscalYearStartMonth: 1, // January
    idLabels: {
      primary: "Emirates ID",
      secondary: "Labour Card Number",
    },
  },
  SA: {
    code: "SA",
    name: "Saudi Arabia",
    nameAr: "المملكة العربية السعودية",
    nameUr: "سعودی عرب",
    flag: "🇸🇦",
    currency: "SAR",
    currencySymbol: "SAR",
    taxLabel: "VAT",
    taxRate: 15,
    taxEnabled: true,
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+966",
    crLabel: "CR Number (سجل تجاري)",
    taxIdLabel: "VAT Registration Number",
    fiscalYearStartMonth: 1, // January
    idLabels: {
      primary: "Iqama Number",
      secondary: "GOSI Number",
    },
  },
  PK: {
    code: "PK",
    name: "Pakistan",
    nameAr: "باكستان",
    nameUr: "پاکستان",
    flag: "🇵🇰",
    currency: "PKR",
    currencySymbol: "Rs",
    taxLabel: "GST",
    taxRate: 18,
    taxEnabled: true,
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+92",
    crLabel: "NTN (National Tax Number)",
    taxIdLabel: "Sales Tax Registration Number",
    fiscalYearStartMonth: 7, // July (Pakistan fiscal year: July-June)
    idLabels: {
      primary: "CNIC",
      secondary: "EOBI Number",
    },
  },
  IN: {
    code: "IN",
    name: "India",
    nameAr: "الهند",
    nameUr: "بھارت",
    flag: "🇮🇳",
    currency: "INR",
    currencySymbol: "₹",
    taxLabel: "GST",
    taxRate: 18,
    taxEnabled: true,
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+91",
    crLabel: "CIN (Corporate Identity Number)",
    taxIdLabel: "GSTIN",
    fiscalYearStartMonth: 4, // April (India fiscal year: April-March)
    idLabels: {
      primary: "Aadhaar Number",
      secondary: "PAN",
      tertiary: "UAN",
    },
  },
  BH: {
    code: "BH",
    name: "Bahrain",
    nameAr: "البحرين",
    nameUr: "بحرین",
    flag: "🇧🇭",
    currency: "BHD",
    currencySymbol: "BD",
    taxLabel: "VAT",
    taxRate: 10,
    taxEnabled: true,
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+973",
    crLabel: "CR Number",
    taxIdLabel: "VAT Registration Number",
    fiscalYearStartMonth: 1, // January
    idLabels: {
      primary: "CPR Number",
      secondary: "LMRA Card Number",
    },
  },
  KW: {
    code: "KW",
    name: "Kuwait",
    nameAr: "الكويت",
    nameUr: "کویت",
    flag: "🇰🇼",
    currency: "KWD",
    currencySymbol: "KD",
    taxLabel: "VAT",
    taxRate: 0,
    taxEnabled: false,
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+965",
    crLabel: "Commercial License Number",
    taxIdLabel: "Tax ID",
    fiscalYearStartMonth: 4, // April (Kuwait fiscal year: April-March)
    idLabels: {
      primary: "Civil ID",
      secondary: "Work Permit Number",
    },
  },
  OM: {
    code: "OM",
    name: "Oman",
    nameAr: "عُمان",
    nameUr: "عمان",
    flag: "🇴🇲",
    currency: "OMR",
    currencySymbol: "OMR",
    taxLabel: "VAT",
    taxRate: 5,
    taxEnabled: true,
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+968",
    crLabel: "CR Number",
    taxIdLabel: "VATIN",
    fiscalYearStartMonth: 1, // January
    idLabels: {
      primary: "Resident Card Number",
      secondary: "Labour Card Number",
    },
  },
  EG: {
    code: "EG",
    name: "Egypt",
    nameAr: "مصر",
    nameUr: "مصر",
    flag: "🇪🇬",
    currency: "EGP",
    currencySymbol: "E£",
    taxLabel: "VAT",
    taxRate: 14,
    taxEnabled: true,
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+20",
    crLabel: "Commercial Register Number",
    taxIdLabel: "Tax Registration Number",
    fiscalYearStartMonth: 7, // July (Egypt fiscal year: July-June)
    idLabels: {
      primary: "National ID",
      secondary: "Insurance Number",
    },
  },
  JO: {
    code: "JO",
    name: "Jordan",
    nameAr: "الأردن",
    nameUr: "اردن",
    flag: "🇯🇴",
    currency: "JOD",
    currencySymbol: "JD",
    taxLabel: "GST",
    taxRate: 16,
    taxEnabled: true,
    dateFormat: "dd/MM/yyyy",
    phoneCode: "+962",
    crLabel: "Company Registration Number",
    taxIdLabel: "Tax Number",
    fiscalYearStartMonth: 1, // January
    idLabels: {
      primary: "National Number",
      secondary: "Social Security Number",
    },
  },
  US: {
    code: "US",
    name: "United States",
    nameAr: "الولايات المتحدة",
    nameUr: "امریکہ",
    flag: "🇺🇸",
    currency: "USD",
    currencySymbol: "$",
    taxLabel: "Sales Tax",
    taxRate: 0, // Varies by state
    taxEnabled: false, // No federal VAT/GST
    dateFormat: "MM/dd/yyyy",
    phoneCode: "+1",
    crLabel: "EIN (Employer Identification Number)",
    taxIdLabel: "EIN / SSN",
    fiscalYearStartMonth: 1, // January (most common)
    idLabels: {
      primary: "SSN (Social Security Number)",
      secondary: "State ID / Driver License",
    },
  },
  CA: {
    code: "CA",
    name: "Canada",
    nameAr: "كندا",
    nameUr: "کینیڈا",
    flag: "🇨🇦",
    currency: "CAD",
    currencySymbol: "C$",
    taxLabel: "GST/HST",
    taxRate: 5, // Federal GST rate
    taxEnabled: true,
    dateFormat: "yyyy-MM-dd",
    phoneCode: "+1",
    crLabel: "Business Number (BN)",
    taxIdLabel: "GST/HST Registration Number",
    fiscalYearStartMonth: 1, // January (most common)
    idLabels: {
      primary: "SIN (Social Insurance Number)",
      secondary: "Provincial Health Card",
    },
  },
};

/** List of all supported countries for UI dropdowns */
export const COUNTRY_LIST = Object.values(COUNTRY_CONFIGS).map((c) => ({
  code: c.code,
  name: c.name,
  flag: c.flag,
  label: `${c.flag} ${c.name}`,
}));

/** Get the country config, falling back to Qatar if unknown */
export function getCountryConfig(code: string | undefined | null): CountryConfig {
  if (code && code in COUNTRY_CONFIGS) {
    return COUNTRY_CONFIGS[code as CountryCode];
  }
  return COUNTRY_CONFIGS.QA;
}

/** Get default currency for a country code */
export function getDefaultCurrency(countryCode: string | undefined | null): string {
  return getCountryConfig(countryCode).currency;
}

/** Get the fiscal year start month for a country (1=January, 7=July, etc.) */
export function getFiscalYearStartMonth(countryCode: string | undefined | null): number {
  return getCountryConfig(countryCode).fiscalYearStartMonth;
}

/**
 * Get the fiscal year date range for a given date based on the fiscal year start month.
 * Returns { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
 */
export function getFiscalYearRange(
  referenceDate: Date,
  fiscalYearStartMonth: number
): { start: string; end: string } {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1; // 1-based

  let fyStartYear: number;
  if (month >= fiscalYearStartMonth) {
    fyStartYear = year;
  } else {
    fyStartYear = year - 1;
  }

  const startMonth = String(fiscalYearStartMonth).padStart(2, "0");
  const start = `${fyStartYear}-${startMonth}-01`;

  // End is one day before the start of next fiscal year
  let endYear = fyStartYear + 1;
  let endMonth = fiscalYearStartMonth - 1;
  if (endMonth === 0) {
    endMonth = 12;
    endYear = fyStartYear;
  }
  // Last day of endMonth
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return { start, end };
}

/** Get a display label for the fiscal year, e.g. "FY 2025-26" or "FY 2026" */
export function getFiscalYearLabel(
  referenceDate: Date,
  fiscalYearStartMonth: number
): string {
  const { start, end } = getFiscalYearRange(referenceDate, fiscalYearStartMonth);
  const startYear = parseInt(start.slice(0, 4));
  const endYear = parseInt(end.slice(0, 4));
  if (startYear === endYear) {
    return `FY ${startYear}`;
  }
  return `FY ${startYear}-${String(endYear).slice(2)}`;
}

/** Month names for display */
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
