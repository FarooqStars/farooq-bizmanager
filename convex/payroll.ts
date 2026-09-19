import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import { getUser } from "./users";
import {
  postPayrollAccrual,
  postEmployerSI,
  postPayrollPayment,
  reversePayrollEntries,
  accrualAlreadyPosted,
  paymentAlreadyPosted,
  getEOSPayable,
  getEOSExpense,
} from "./lib/payrollPosting.ts";
import { postBalancedEntry, round2 } from "./lib/ledger.ts";
import {
  GRATUITY_ACCRUAL_SOURCE,
  GRATUITY_PAYMENT_SOURCE,
} from "./lib/sourceTypes.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> };
  db: unknown;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ─── Multi-Country Labour Law Configuration ─────────────────

// Overtime multipliers per country
const COUNTRY_OVERTIME_RATES: Record<
  string,
  { regular: number; restDay: number; holiday: number; nightShift?: number }
> = {
  // Qatar Labour Law Art. 74
  QA: { regular: 1.25, restDay: 1.5, holiday: 2.0 },
  // UAE Federal Decree-Law No. 33/2021
  AE: { regular: 1.25, restDay: 1.5, holiday: 1.5, nightShift: 1.5 },
  // Saudi Labour Law Art. 107
  SA: { regular: 1.5, restDay: 1.5, holiday: 1.5 },
  // Pakistan Factories Act 1934
  PK: { regular: 2.0, restDay: 2.0, holiday: 2.0 },
  // India Factories Act 1948 / Shops & Establishments Acts
  IN: { regular: 2.0, restDay: 2.0, holiday: 2.0 },
  // Bahrain Labour Law (2012) Art. 54 — 25% regular, 50% rest day, 100% holiday
  BH: { regular: 1.25, restDay: 1.5, holiday: 2.0 },
  // Kuwait Labour Law No. 6/2010 Art. 64 — 25% weekday, 50% weekend, 100% holiday
  KW: { regular: 1.25, restDay: 1.5, holiday: 2.0 },
  // Oman Labour Law (Royal Decree 35/2003) Art. 68
  OM: { regular: 1.25, restDay: 1.5, holiday: 2.0 },
  // Egypt Labour Law No. 12/2003 Art. 85 — 35% day, 70% night, 100% holiday
  EG: { regular: 1.35, restDay: 2.0, holiday: 2.0, nightShift: 1.7 },
  // Jordan Labour Law No. 8/1996 Art. 58 — 25% regular, 50% holiday
  JO: { regular: 1.25, restDay: 1.5, holiday: 1.5 },
  // USA Fair Labor Standards Act (FLSA) — 1.5x after 40 hrs/week
  US: { regular: 1.5, restDay: 1.5, holiday: 1.5 },
  // Canada Labour Code — 1.5x overtime, varies by province
  CA: { regular: 1.5, restDay: 1.5, holiday: 2.0 },
};

// Gratuity rules per country
const COUNTRY_GRATUITY_RULES: Record<
  string,
  {
    law: string;
    minYears: number;
    calculate: (
      baseSalary: number,
      yearsWorked: number,
      isResignation?: boolean,
    ) => { amount: number; breakdown: string };
  }
> = {
  // Qatar Labour Law Art. 54: 3 weeks/year first 5 yrs, 4 weeks/year after
  QA: {
    law: "Qatar Labour Law Art. 54",
    minYears: 1,
    calculate: (baseSalary, yearsWorked) => {
      const weeklyWage = baseSalary / 4.33;
      if (yearsWorked <= 5) {
        const amount = weeklyWage * 3 * yearsWorked;
        return {
          amount,
          breakdown: `${yearsWorked.toFixed(2)} yrs × 3 weeks × ${Math.round(weeklyWage)} weekly = ${Math.round(amount)}`,
        };
      }
      const first5 = weeklyWage * 3 * 5;
      const remaining = weeklyWage * 4 * (yearsWorked - 5);
      const amount = first5 + remaining;
      return {
        amount,
        breakdown: `First 5 yrs: 5 × 3 weeks × ${Math.round(weeklyWage)} = ${Math.round(first5)}; Remaining ${(yearsWorked - 5).toFixed(2)} yrs × 4 weeks × ${Math.round(weeklyWage)} = ${Math.round(remaining)}`,
      };
    },
  },
  // UAE Federal Decree-Law No. 33/2021: 21 days/year first 5 yrs, 30 days/year after, capped at 2 years salary
  AE: {
    law: "UAE Federal Decree-Law No. 33/2021",
    minYears: 1,
    calculate: (baseSalary, yearsWorked) => {
      const dailyWage = baseSalary / 30;
      let amount: number;
      let breakdown: string;
      if (yearsWorked <= 5) {
        amount = dailyWage * 21 * yearsWorked;
        breakdown = `${yearsWorked.toFixed(2)} yrs × 21 days × ${Math.round(dailyWage)} daily = ${Math.round(amount)}`;
      } else {
        const first5 = dailyWage * 21 * 5;
        const remaining = dailyWage * 30 * (yearsWorked - 5);
        amount = first5 + remaining;
        breakdown = `First 5 yrs: 5 × 21 days × ${Math.round(dailyWage)} = ${Math.round(first5)}; Remaining ${(yearsWorked - 5).toFixed(2)} yrs × 30 days × ${Math.round(dailyWage)} = ${Math.round(remaining)}`;
      }
      // Cap at 2 years salary
      const cap = baseSalary * 24;
      if (amount > cap) {
        amount = cap;
        breakdown += ` (Capped at 2 years salary: ${Math.round(cap)})`;
      }
      return { amount, breakdown };
    },
  },
  // Saudi Labour Law Art. 84-85: Half month first 5 yrs, 1 month after; reduced on resignation
  SA: {
    law: "Saudi Labour Law Art. 84-85",
    minYears: 2,
    calculate: (baseSalary, yearsWorked, isResignation = false) => {
      let amount: number;
      let breakdown: string;
      if (yearsWorked <= 5) {
        amount = (baseSalary / 2) * yearsWorked;
        breakdown = `${yearsWorked.toFixed(2)} yrs × half month (${Math.round(baseSalary / 2)}) = ${Math.round(amount)}`;
      } else {
        const first5 = (baseSalary / 2) * 5;
        const remaining = baseSalary * (yearsWorked - 5);
        amount = first5 + remaining;
        breakdown = `First 5 yrs: 5 × half month = ${Math.round(first5)}; Remaining ${(yearsWorked - 5).toFixed(2)} yrs × full month = ${Math.round(remaining)}`;
      }
      // Resignation reduction
      if (isResignation) {
        if (yearsWorked < 5) {
          amount = amount * (1 / 3);
          breakdown += ` (Resignation <5 yrs: 1/3 = ${Math.round(amount)})`;
        } else if (yearsWorked < 10) {
          amount = amount * (2 / 3);
          breakdown += ` (Resignation 5-10 yrs: 2/3 = ${Math.round(amount)})`;
        }
        // 10+ years: full gratuity on resignation
      }
      return { amount, breakdown };
    },
  },
  // Pakistan: Common agreement - 30 days per year (no universal statute)
  PK: {
    law: "Pakistan Industrial & Commercial Employment (Standing Orders) Ordinance",
    minYears: 1,
    calculate: (baseSalary, yearsWorked) => {
      const dailyWage = baseSalary / 30;
      const amount = dailyWage * 30 * yearsWorked;
      const breakdown = `${yearsWorked.toFixed(2)} yrs × 30 days × ${Math.round(dailyWage)} daily = ${Math.round(amount)}`;
      return { amount, breakdown };
    },
  },
  // India Payment of Gratuity Act 1972: 15 days/year (based on 26-day month)
  IN: {
    law: "India Payment of Gratuity Act 1972",
    minYears: 5,
    calculate: (baseSalary, yearsWorked) => {
      // Formula: (Last drawn salary × 15 × years of service) / 26
      const amount = (baseSalary * 15 * yearsWorked) / 26;
      const breakdown = `(${Math.round(baseSalary)} × 15 × ${yearsWorked.toFixed(2)}) / 26 = ${Math.round(amount)}`;
      return { amount, breakdown };
    },
  },
  // Bahrain Labour Law Art. 116: Half month first 3 yrs, 1 month after
  BH: {
    law: "Bahrain Labour Law Art. 116",
    minYears: 1,
    calculate: (baseSalary, yearsWorked) => {
      const dailyWage = baseSalary / 30;
      let amount: number;
      let breakdown: string;
      if (yearsWorked <= 3) {
        amount = dailyWage * 15 * yearsWorked;
        breakdown = `${yearsWorked.toFixed(2)} yrs × 15 days × ${Math.round(dailyWage)} daily = ${Math.round(amount)}`;
      } else {
        const first3 = dailyWage * 15 * 3;
        const remaining = dailyWage * 30 * (yearsWorked - 3);
        amount = first3 + remaining;
        breakdown = `First 3 yrs: 3 × 15 days = ${Math.round(first3)}; Remaining ${(yearsWorked - 3).toFixed(2)} yrs × 30 days = ${Math.round(remaining)}`;
      }
      return { amount, breakdown };
    },
  },
  // Kuwait Labour Law No. 6/2010 Art. 51: 15 days first 5 yrs, 1 month after
  KW: {
    law: "Kuwait Labour Law No. 6/2010 Art. 51",
    minYears: 3,
    calculate: (baseSalary, yearsWorked) => {
      const dailyWage = baseSalary / 26;
      let amount: number;
      let breakdown: string;
      if (yearsWorked <= 5) {
        amount = dailyWage * 15 * yearsWorked;
        breakdown = `${yearsWorked.toFixed(2)} yrs × 15 days × ${Math.round(dailyWage)} daily = ${Math.round(amount)}`;
      } else {
        const first5 = dailyWage * 15 * 5;
        const remaining = baseSalary * (yearsWorked - 5);
        amount = first5 + remaining;
        breakdown = `First 5 yrs: 5 × 15 days = ${Math.round(first5)}; Remaining ${(yearsWorked - 5).toFixed(2)} yrs × 1 month = ${Math.round(remaining)}`;
      }
      // Cap at 1.5 years salary
      const cap = baseSalary * 18;
      if (amount > cap) {
        amount = cap;
        breakdown += ` (Capped at 1.5 years salary: ${Math.round(cap)})`;
      }
      return { amount, breakdown };
    },
  },
  // Oman Labour Law Art. 45: 15 days first 3 yrs, 1 month after
  OM: {
    law: "Oman Labour Law (Royal Decree 35/2003) Art. 45",
    minYears: 1,
    calculate: (baseSalary, yearsWorked) => {
      const dailyWage = baseSalary / 30;
      let amount: number;
      let breakdown: string;
      if (yearsWorked <= 3) {
        amount = dailyWage * 15 * yearsWorked;
        breakdown = `${yearsWorked.toFixed(2)} yrs × 15 days × ${Math.round(dailyWage)} daily = ${Math.round(amount)}`;
      } else {
        const first3 = dailyWage * 15 * 3;
        const remaining = baseSalary * (yearsWorked - 3);
        amount = first3 + remaining;
        breakdown = `First 3 yrs: 3 × 15 days = ${Math.round(first3)}; Remaining ${(yearsWorked - 3).toFixed(2)} yrs × 1 month = ${Math.round(remaining)}`;
      }
      return { amount, breakdown };
    },
  },
  // Egypt Labour Law No. 12/2003 Art. 126: Half month first 5 yrs, 1 month after (min 3 months salary)
  EG: {
    law: "Egypt Labour Law No. 12/2003 Art. 126",
    minYears: 0,
    calculate: (baseSalary, yearsWorked) => {
      let amount: number;
      let breakdown: string;
      if (yearsWorked <= 5) {
        amount = (baseSalary / 2) * yearsWorked;
        breakdown = `${yearsWorked.toFixed(2)} yrs × half month = ${Math.round(amount)}`;
      } else {
        const first5 = (baseSalary / 2) * 5;
        const remaining = baseSalary * (yearsWorked - 5);
        amount = first5 + remaining;
        breakdown = `First 5 yrs: 5 × half month = ${Math.round(first5)}; Remaining ${(yearsWorked - 5).toFixed(2)} yrs × full month = ${Math.round(remaining)}`;
      }
      // Min 3 months salary
      const min = baseSalary * 3;
      if (amount < min && yearsWorked > 0) {
        amount = min;
        breakdown += ` (Minimum 3 months salary: ${Math.round(min)})`;
      }
      return { amount, breakdown };
    },
  },
  // Jordan Labour Law No. 8/1996 Art. 32: 1 month per year
  JO: {
    law: "Jordan Labour Law No. 8/1996 Art. 32",
    minYears: 0,
    calculate: (baseSalary, yearsWorked) => {
      const amount = baseSalary * yearsWorked;
      const breakdown = `${yearsWorked.toFixed(2)} yrs × 1 month (${Math.round(baseSalary)}) = ${Math.round(amount)}`;
      return { amount, breakdown };
    },
  },
  // USA: No statutory severance/gratuity — at-will employment
  US: {
    law: "No federal mandatory severance (at-will employment)",
    minYears: 0,
    calculate: (_baseSalary, _yearsWorked) => {
      return {
        amount: 0,
        breakdown:
          "No mandatory gratuity — US is at-will employment. Severance packages are discretionary.",
      };
    },
  },
  // Canada: Common law reasonable notice or pay in lieu (approx 1 month per year, varies by province and court rulings)
  CA: {
    law: "Canada Labour Code / Provincial Employment Standards",
    minYears: 0,
    calculate: (baseSalary, yearsWorked) => {
      // Minimum statutory: ~1-2 weeks per year (federal). Common law can be higher.
      const weeksPerYear = Math.min(yearsWorked, 8); // Statutory max ~8 weeks federally
      const weeklyWage = baseSalary / 4.33;
      const amount = weeklyWage * weeksPerYear;
      const breakdown = `${weeksPerYear} weeks × ${Math.round(weeklyWage)} weekly = ${Math.round(amount)} (Statutory minimum; common law may award more)`;
      return { amount, breakdown };
    },
  },
};

// Default to Qatar if no country set (backward compatibility)
function getEmployeeCountry(emp: { country?: string | null }): string {
  return emp.country ?? "QA";
}

// ─── Social Insurance Configuration ──────────────────────────

type SocialInsuranceResult = {
  employeeContribution: number;
  employerContribution: number;
  details: string;
  applicable: boolean;
};

// Social insurance rates by country
function calculateSocialInsurance(country: string, baseSalary: number): SocialInsuranceResult {
  switch (country) {
    case "SA": {
      // Saudi GOSI: pension 9%+9%, hazard 2% employer, SANED 0.75%+0.75%
      const empPension = baseSalary * 0.09;
      const erPension = baseSalary * 0.09;
      const erHazard = baseSalary * 0.02;
      const empSANED = baseSalary * 0.0075;
      const erSANED = baseSalary * 0.0075;
      const employeeTotal = empPension + empSANED;
      const employerTotal = erPension + erHazard + erSANED;
      return {
        employeeContribution: Math.round(employeeTotal * 100) / 100,
        employerContribution: Math.round(employerTotal * 100) / 100,
        details: `GOSI Pension: ${Math.round(empPension)} emp + ${Math.round(erPension)} er; Hazard: ${Math.round(erHazard)} er; SANED: ${Math.round(empSANED)} emp + ${Math.round(erSANED)} er`,
        applicable: true,
      };
    }
    case "PK": {
      // EOBI: 5% employer + 1% employee (on minimum wage basis, PKR 9000 ceiling)
      // Provincial Social Security (PESSI/SESSI): ~6% employer (on wages up to PKR 30,000)
      const eobiCeiling = 9000; // EOBI contribution ceiling
      const eobiBase = Math.min(baseSalary, eobiCeiling);
      const empEOBI = eobiBase * 0.01;
      const erEOBI = eobiBase * 0.05;
      const ssCeiling = 30000;
      const ssBase = Math.min(baseSalary, ssCeiling);
      const erSS = ssBase * 0.06;
      return {
        employeeContribution: Math.round(empEOBI * 100) / 100,
        employerContribution: Math.round((erEOBI + erSS) * 100) / 100,
        details: `EOBI: ${Math.round(empEOBI)} emp + ${Math.round(erEOBI)} er (ceiling PKR ${eobiCeiling}); Prov. SS: ${Math.round(erSS)} er (ceiling PKR ${ssCeiling})`,
        applicable: true,
      };
    }
    case "IN": {
      // India: EPF 12%+12%, ESI 0.75%+3.25% (if salary ≤ 21,000)
      const epfBase = Math.min(baseSalary, 15000); // EPF ceiling INR 15,000 basic
      const empEPF = epfBase * 0.12;
      const erEPF = epfBase * 0.12;
      const esiApplicable = baseSalary <= 21000;
      const empESI = esiApplicable ? baseSalary * 0.0075 : 0;
      const erESI = esiApplicable ? baseSalary * 0.0325 : 0;
      const employeeTotal = empEPF + empESI;
      const employerTotal = erEPF + erESI;
      const parts = [`EPF: ${Math.round(empEPF)} emp + ${Math.round(erEPF)} er (ceiling ₹15,000)`];
      if (esiApplicable) {
        parts.push(`ESI: ${Math.round(empESI)} emp + ${Math.round(erESI)} er`);
      }
      return {
        employeeContribution: Math.round(employeeTotal * 100) / 100,
        employerContribution: Math.round(employerTotal * 100) / 100,
        details: parts.join("; "),
        applicable: true,
      };
    }
    case "BH": {
      // Bahrain SIO: Employee 7% + Employer 12% (pension), + 3% employer (unemployment)
      const empPension = baseSalary * 0.07;
      const erPension = baseSalary * 0.12;
      const erUnemploy = baseSalary * 0.03;
      return {
        employeeContribution: Math.round(empPension * 100) / 100,
        employerContribution: Math.round((erPension + erUnemploy) * 100) / 100,
        details: `SIO Pension: ${Math.round(empPension)} emp (7%) + ${Math.round(erPension)} er (12%); Unemployment: ${Math.round(erUnemploy)} er (3%)`,
        applicable: true,
      };
    }
    case "KW": {
      // Kuwait PIFSS: Employee 10.5% + Employer 11.5%
      const empKW = baseSalary * 0.105;
      const erKW = baseSalary * 0.115;
      return {
        employeeContribution: Math.round(empKW * 100) / 100,
        employerContribution: Math.round(erKW * 100) / 100,
        details: `PIFSS: ${Math.round(empKW)} emp (10.5%) + ${Math.round(erKW)} er (11.5%)`,
        applicable: true,
      };
    }
    case "OM": {
      // Oman PASI: Employee 7% + Employer 11.5%
      const empOM = baseSalary * 0.07;
      const erOM = baseSalary * 0.115;
      return {
        employeeContribution: Math.round(empOM * 100) / 100,
        employerContribution: Math.round(erOM * 100) / 100,
        details: `PASI: ${Math.round(empOM)} emp (7%) + ${Math.round(erOM)} er (11.5%)`,
        applicable: true,
      };
    }
    case "EG": {
      // Egypt NOSI: Employee ~11% + Employer ~18.75% (varies by salary bracket)
      const empEG = baseSalary * 0.11;
      const erEG = baseSalary * 0.1875;
      return {
        employeeContribution: Math.round(empEG * 100) / 100,
        employerContribution: Math.round(erEG * 100) / 100,
        details: `NOSI: ${Math.round(empEG)} emp (11%) + ${Math.round(erEG)} er (18.75%)`,
        applicable: true,
      };
    }
    case "JO": {
      // Jordan SSC: Employee 7.5% + Employer 14.25%
      const empJO = baseSalary * 0.075;
      const erJO = baseSalary * 0.1425;
      return {
        employeeContribution: Math.round(empJO * 100) / 100,
        employerContribution: Math.round(erJO * 100) / 100,
        details: `SSC: ${Math.round(empJO)} emp (7.5%) + ${Math.round(erJO)} er (14.25%)`,
        applicable: true,
      };
    }
    case "US": {
      // US: Social Security (FICA) 6.2% employee + 6.2% employer (wage base $168,600/2025)
      // Medicare 1.45% employee + 1.45% employer (no cap)
      const ssCeiling = 168600 / 12; // Monthly equivalent
      const ssBase = Math.min(baseSalary, ssCeiling);
      const empSS = ssBase * 0.062;
      const erSS = ssBase * 0.062;
      const empMedicare = baseSalary * 0.0145;
      const erMedicare = baseSalary * 0.0145;
      const empTotal = empSS + empMedicare;
      const erTotal = erSS + erMedicare;
      return {
        employeeContribution: Math.round(empTotal * 100) / 100,
        employerContribution: Math.round(erTotal * 100) / 100,
        details: `FICA/SS: ${Math.round(empSS)} emp (6.2%) + ${Math.round(erSS)} er (6.2%); Medicare: ${Math.round(empMedicare)} emp (1.45%) + ${Math.round(erMedicare)} er (1.45%)`,
        applicable: true,
      };
    }
    case "CA": {
      // Canada: CPP 5.95% employee + 5.95% employer (2024, max pensionable earnings ~$68,500)
      // EI: 1.63% employee + 2.282% employer (max insurable earnings ~$63,200)
      const cppCeiling = 68500 / 12;
      const cppBase = Math.min(baseSalary, cppCeiling);
      const empCPP = cppBase * 0.0595;
      const erCPP = cppBase * 0.0595;
      const eiCeiling = 63200 / 12;
      const eiBase = Math.min(baseSalary, eiCeiling);
      const empEI = eiBase * 0.0163;
      const erEI = eiBase * 0.02282;
      const empTotal = empCPP + empEI;
      const erTotal = erCPP + erEI;
      return {
        employeeContribution: Math.round(empTotal * 100) / 100,
        employerContribution: Math.round(erTotal * 100) / 100,
        details: `CPP: ${Math.round(empCPP)} emp (5.95%) + ${Math.round(erCPP)} er (5.95%); EI: ${Math.round(empEI)} emp (1.63%) + ${Math.round(erEI)} er (2.28%)`,
        applicable: true,
      };
    }
    case "QA":
    case "AE":
    default:
      // Qatar & UAE have no employee social insurance deductions
      return {
        employeeContribution: 0,
        employerContribution: 0,
        details: "Not applicable — no mandatory social insurance",
        applicable: false,
      };
  }
}

// Legacy constant for backward compatibility
const OVERTIME_RATES = COUNTRY_OVERTIME_RATES.QA;

// ─── Country Labour Law Info Query ──────────────────────────

export const getCountryLabourRules = query({
  args: { country: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const code = args.country ?? "QA";
    const ot = COUNTRY_OVERTIME_RATES[code] ?? COUNTRY_OVERTIME_RATES.QA;
    const gratuity = COUNTRY_GRATUITY_RULES[code] ?? COUNTRY_GRATUITY_RULES.QA;
    return {
      country: code,
      overtime: {
        regular: ot.regular,
        restDay: ot.restDay,
        holiday: ot.holiday,
        nightShift: ot.nightShift ?? null,
      },
      gratuity: { law: gratuity.law, minYears: gratuity.minYears },
      countryName:
        {
          QA: "Qatar",
          AE: "UAE",
          SA: "Saudi Arabia",
          PK: "Pakistan",
          IN: "India",
          BH: "Bahrain",
          KW: "Kuwait",
          OM: "Oman",
          EG: "Egypt",
          JO: "Jordan",
          US: "United States",
          CA: "Canada",
        }[code] ?? code,
    };
  },
});

// ─── Social Insurance Queries ─────────────────────────────────

export const getSocialInsuranceBreakdown = query({
  args: { employeeId: v.optional(v.id("employees")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (!args.employeeId) return null;
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) return null;
    const country = getEmployeeCountry(emp);
    const result = calculateSocialInsurance(country, emp.baseSalary);
    return {
      ...result,
      country,
      countryName:
        (
          {
            QA: "Qatar",
            AE: "UAE",
            SA: "Saudi Arabia",
            PK: "Pakistan",
            IN: "India",
            BH: "Bahrain",
            KW: "Kuwait",
            OM: "Oman",
            EG: "Egypt",
            JO: "Jordan",
            US: "United States",
            CA: "Canada",
          } as Record<string, string>
        )[country] ?? country,
      baseSalary: emp.baseSalary,
      socialInsuranceEnabled: emp.socialInsuranceEnabled ?? true,
      socialInsuranceNumber: emp.socialInsuranceNumber ?? null,
    };
  },
});

export const getSocialInsuranceSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const employees = await ctx.db.query("employees").collect();
    const activeEmployees = employees.filter((e) => e.isActive);

    const summary: Array<{
      id: string;
      name: string;
      country: string;
      countryName: string;
      baseSalary: number;
      enabled: boolean;
      employeeContribution: number;
      employerContribution: number;
      applicable: boolean;
      details: string;
      insuranceNumber: string | null;
    }> = [];

    for (const emp of activeEmployees) {
      const country = getEmployeeCountry(emp);
      const result = calculateSocialInsurance(country, emp.baseSalary);
      summary.push({
        id: emp._id,
        name: emp.name,
        country,
        countryName:
          (
            {
              QA: "Qatar",
              AE: "UAE",
              SA: "Saudi Arabia",
              PK: "Pakistan",
              IN: "India",
              BH: "Bahrain",
              KW: "Kuwait",
              OM: "Oman",
              EG: "Egypt",
              JO: "Jordan",
              US: "United States",
              CA: "Canada",
            } as Record<string, string>
          )[country] ?? country,
        baseSalary: emp.baseSalary,
        enabled: emp.socialInsuranceEnabled ?? true,
        employeeContribution: result.employeeContribution,
        employerContribution: result.employerContribution,
        applicable: result.applicable,
        details: result.details,
        insuranceNumber: emp.socialInsuranceNumber ?? null,
      });
    }
    return summary;
  },
});

export const toggleSocialInsurance = mutation({
  args: { employeeId: v.id("employees"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.employeeId, { socialInsuranceEnabled: args.enabled });
  },
});

export const updateSocialInsuranceNumber = mutation({
  args: { employeeId: v.id("employees"), insuranceNumber: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.employeeId, {
      socialInsuranceNumber: args.insuranceNumber || undefined,
    });
  },
});

// ─── Employee Queries ────────────────────────────────────────

export const listEmployees = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let employees = await ctx.db.query("employees").collect();
    if (args.activeOnly) {
      employees = employees.filter((e) => e.isActive);
    }
    const withPhotos = await Promise.all(
      employees.map(async (emp) => {
        const photoUrl = emp.photoStorageId ? await ctx.storage.getUrl(emp.photoStorageId) : null;
        return { ...emp, photoUrl };
      }),
    );
    return withPhotos;
  },
});

export const getLinkedUserIds = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const employees = await ctx.db.query("employees").collect();
    const linkedIds = employees.filter((e) => e.userId).map((e) => e.userId as string);
    return linkedIds;
  },
});

export const getEmployee = query({
  args: { id: v.id("employees") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const emp = await ctx.db.get(args.id);
    if (!emp) return null;
    const photoUrl = emp.photoStorageId ? await ctx.storage.getUrl(emp.photoStorageId) : null;
    return { ...emp, photoUrl };
  },
});

// ─── Employee Mutations ──────────────────────────────────────

export const createEmployee = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    employeeId: v.string(),
    hireDate: v.string(),
    baseSalary: v.number(),
    housingAllowance: v.optional(v.number()),
    transportAllowance: v.optional(v.number()),
    otherAllowances: v.optional(v.number()),
    currency: v.string(),
    payFrequency: v.union(v.literal("monthly"), v.literal("biweekly"), v.literal("weekly")),
    bankName: v.optional(v.string()),
    bankAccount: v.optional(v.string()),
    routingNumber: v.optional(v.string()),
    taxId: v.optional(v.string()),
    nationality: v.optional(v.string()),
    country: v.optional(
      v.union(
        v.literal("QA"),
        v.literal("AE"),
        v.literal("SA"),
        v.literal("PK"),
        v.literal("IN"),
        v.literal("BH"),
        v.literal("KW"),
        v.literal("OM"),
        v.literal("EG"),
        v.literal("JO"),
        v.literal("US"),
        v.literal("CA"),
      ),
    ),
    passportNumber: v.optional(v.string()),
    qidNumber: v.optional(v.string()),
    secondaryId: v.optional(v.string()),
    tertiaryId: v.optional(v.string()),
    annualLeaveBalance: v.optional(v.number()),
    sickLeaveBalance: v.optional(v.number()),
    socialInsuranceEnabled: v.optional(v.boolean()),
    socialInsuranceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db
      .query("employees")
      .withIndex("by_employee_id", (q) => q.eq("employeeId", args.employeeId))
      .first();
    if (existing) {
      throw new ConvexError({ message: "Employee ID already exists", code: "CONFLICT" });
    }
    // Default leave balances based on country
    const countryCode = args.country ?? "QA";
    const defaultLeave: Record<string, { annual: number; sick: number }> = {
      QA: { annual: 21, sick: 14 },
      AE: { annual: 30, sick: 90 },
      SA: { annual: 21, sick: 30 },
      PK: { annual: 14, sick: 16 },
      IN: { annual: 15, sick: 12 },
      BH: { annual: 30, sick: 15 },
      KW: { annual: 30, sick: 15 },
      OM: { annual: 30, sick: 14 },
      EG: { annual: 21, sick: 90 },
      JO: { annual: 14, sick: 14 },
      US: { annual: 10, sick: 5 },
      CA: { annual: 15, sick: 10 },
    };
    const leaves = defaultLeave[countryCode] ?? defaultLeave.QA;
    return await ctx.db.insert("employees", {
      ...args,
      isActive: true,
      annualLeaveBalance: args.annualLeaveBalance ?? leaves.annual,
      sickLeaveBalance: args.sickLeaveBalance ?? leaves.sick,
      unpaidLeaveTaken: 0,
    });
  },
});

export const updateEmployee = mutation({
  args: {
    id: v.id("employees"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    baseSalary: v.optional(v.number()),
    housingAllowance: v.optional(v.number()),
    transportAllowance: v.optional(v.number()),
    otherAllowances: v.optional(v.number()),
    currency: v.optional(v.string()),
    payFrequency: v.optional(
      v.union(v.literal("monthly"), v.literal("biweekly"), v.literal("weekly")),
    ),
    bankName: v.optional(v.string()),
    bankAccount: v.optional(v.string()),
    routingNumber: v.optional(v.string()),
    taxId: v.optional(v.string()),
    nationality: v.optional(v.string()),
    country: v.optional(
      v.union(
        v.literal("QA"),
        v.literal("AE"),
        v.literal("SA"),
        v.literal("PK"),
        v.literal("IN"),
        v.literal("BH"),
        v.literal("KW"),
        v.literal("OM"),
        v.literal("EG"),
        v.literal("JO"),
        v.literal("US"),
        v.literal("CA"),
      ),
    ),
    passportNumber: v.optional(v.string()),
    qidNumber: v.optional(v.string()),
    secondaryId: v.optional(v.string()),
    tertiaryId: v.optional(v.string()),
    annualLeaveBalance: v.optional(v.number()),
    sickLeaveBalance: v.optional(v.number()),
    unpaidLeaveTaken: v.optional(v.number()),
    socialInsuranceEnabled: v.optional(v.boolean()),
    socialInsuranceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const { id, ...updates } = args;
    const emp = await ctx.db.get(id);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });
    const cleaned = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(id, cleaned);
  },
});

export const deleteEmployee = mutation({
  args: { id: v.id("employees") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });
    if (emp.photoStorageId) {
      await ctx.storage.delete(emp.photoStorageId);
    }
    await ctx.db.delete(args.id);
  },
});

// ─── Photo Upload ────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setEmployeePhoto = mutation({
  args: { employeeId: v.id("employees"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });
    if (emp.photoStorageId) {
      await ctx.storage.delete(emp.photoStorageId);
    }
    await ctx.db.patch(args.employeeId, { photoStorageId: args.storageId });
  },
});

export const removeEmployeePhoto = mutation({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });
    if (emp.photoStorageId) {
      await ctx.storage.delete(emp.photoStorageId);
      await ctx.db.patch(args.employeeId, { photoStorageId: undefined });
    }
  },
});

// ─── Payroll Run Queries ─────────────────────────────────────

export const listPayrollRuns = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("payrollRuns").order("desc").collect();
  },
});

export const getPayrollRun = query({
  args: { id: v.id("payrollRuns") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const run = await ctx.db.get(args.id);
    if (!run) return null;
    const payslips = await ctx.db
      .query("payslips")
      .withIndex("by_payroll_run", (q) => q.eq("payrollRunId", args.id))
      .collect();
    const enrichedPayslips = await Promise.all(
      payslips.map(async (slip) => {
        const employee = await ctx.db.get(slip.employeeId);
        const photoUrl = employee?.photoStorageId
          ? await ctx.storage.getUrl(employee.photoStorageId)
          : null;
        return {
          ...slip,
          employeeName: employee?.name ?? "Unknown",
          employeePosition: employee?.position,
          employeeEmployeeId: employee?.employeeId,
          employeeCountry: employee?.country ?? "QA",
          bankName: employee?.bankName,
          bankAccount: employee?.bankAccount,
          routingNumber: employee?.routingNumber,
          photoUrl,
        };
      }),
    );
    return { ...run, payslips: enrichedPayslips };
  },
});

// ─── Compliance Dashboard Query ─────────────────────────────

export const getComplianceDashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const employees = await ctx.db.query("employees").collect();
    const active = employees.filter((e) => e.isActive);

    const COUNTRY_NAMES: Record<string, string> = {
      QA: "Qatar",
      AE: "UAE",
      SA: "Saudi Arabia",
      PK: "Pakistan",
      IN: "India",
      BH: "Bahrain",
      KW: "Kuwait",
      OM: "Oman",
      EG: "Egypt",
      JO: "Jordan",
      US: "United States",
      CA: "Canada",
    };

    // Group by country
    const countryGroups: Record<
      string,
      {
        count: number;
        totalBaseSalary: number;
        totalSIEmployee: number;
        totalSIEmployer: number;
        totalLeaveEntitlement: number;
        siApplicable: boolean;
      }
    > = {};

    for (const emp of active) {
      const country = getEmployeeCountry(emp);
      if (!countryGroups[country]) {
        countryGroups[country] = {
          count: 0,
          totalBaseSalary: 0,
          totalSIEmployee: 0,
          totalSIEmployer: 0,
          totalLeaveEntitlement: 0,
          siApplicable: false,
        };
      }
      const group = countryGroups[country];
      group.count++;
      group.totalBaseSalary += emp.baseSalary;
      group.totalLeaveEntitlement += emp.annualLeaveBalance ?? 0;

      if (emp.socialInsuranceEnabled !== false) {
        const si = calculateSocialInsurance(country, emp.baseSalary);
        group.totalSIEmployee += si.employeeContribution;
        group.totalSIEmployer += si.employerContribution;
        if (si.applicable) group.siApplicable = true;
      }
    }

    // Compliance checklist per country
    const checklist: Array<{
      country: string;
      countryName: string;
      items: Array<{ label: string; status: "pass" | "warning" | "info"; detail: string }>;
    }> = [];

    for (const [code, group] of Object.entries(countryGroups)) {
      const items: Array<{ label: string; status: "pass" | "warning" | "info"; detail: string }> =
        [];
      const countryEmployees = active.filter((e) => getEmployeeCountry(e) === code);

      // Check social insurance enrollment
      if (code === "SA" || code === "PK" || code === "IN") {
        const enrolled = countryEmployees.filter((e) => e.socialInsuranceEnabled !== false).length;
        const unenrolled = group.count - enrolled;
        if (unenrolled === 0) {
          items.push({
            label: "Social Insurance",
            status: "pass",
            detail: `All ${enrolled} employees enrolled`,
          });
        } else {
          items.push({
            label: "Social Insurance",
            status: "warning",
            detail: `${unenrolled} of ${group.count} employees not enrolled`,
          });
        }
      } else {
        items.push({
          label: "Social Insurance",
          status: "info",
          detail: "Not applicable in this country",
        });
      }

      // Check leave balances assigned
      const withLeave = countryEmployees.filter((e) => (e.annualLeaveBalance ?? 0) > 0).length;
      if (withLeave === group.count) {
        items.push({
          label: "Leave Entitlements",
          status: "pass",
          detail: `All ${group.count} employees have leave balances`,
        });
      } else {
        items.push({
          label: "Leave Entitlements",
          status: "warning",
          detail: `${group.count - withLeave} employees missing leave balance`,
        });
      }

      // Country field set
      const withCountry = countryEmployees.filter((e) => e.country).length;
      if (withCountry === group.count) {
        items.push({
          label: "Country Assignment",
          status: "pass",
          detail: "All employees have country set",
        });
      } else {
        items.push({
          label: "Country Assignment",
          status: "warning",
          detail: `${group.count - withCountry} using default (Qatar)`,
        });
      }

      // Gratuity eligibility
      const eligibleForGratuity = countryEmployees.filter((e) => {
        const years =
          (Date.now() - new Date(e.hireDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        const rule = COUNTRY_GRATUITY_RULES[code];
        return rule && years >= rule.minYears;
      }).length;
      items.push({
        label: "Gratuity Eligible",
        status: "info",
        detail: `${eligibleForGratuity} of ${group.count} employees eligible`,
      });

      checklist.push({ country: code, countryName: COUNTRY_NAMES[code] ?? code, items });
    }

    return {
      totalEmployees: active.length,
      countryGroups: Object.entries(countryGroups).map(([code, data]) => ({
        country: code,
        countryName: COUNTRY_NAMES[code] ?? code,
        ...data,
      })),
      checklist,
    };
  },
});

// ─── Payroll Run Mutations ───────────────────────────────────

export const createPayrollRun = mutation({
  args: {
    title: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    payDate: v.string(),
    notes: v.optional(v.string()),
    employeeIds: v.array(v.id("employees")),
    overtime: v.optional(
      v.array(
        v.object({
          employeeId: v.id("employees"),
          hours: v.number(),
          rateType: v.union(v.literal("regular"), v.literal("restDay"), v.literal("holiday")),
        }),
      ),
    ),
    extraDeductions: v.optional(
      v.array(
        v.object({
          employeeId: v.id("employees"),
          amount: v.number(),
          details: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args): Promise<Id<"payrollRuns">> => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    // Owner or manager only; owner always passes.
    if (user.role !== "owner" && user.role !== "manager") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    let totalAmount = 0;
    const payslipData: Array<{
      employeeId: Id<"employees">;
      baseSalary: number;
      housingAllowance?: number;
      transportAllowance?: number;
      otherAllowances?: number;
      overtimeHours?: number;
      overtimeRate?: number;
      overtimeAmount?: number;
      allowances: number;
      deductions: number;
      netPay: number;
      allowanceDetails?: string;
      deductionDetails?: string;
      socialInsuranceEmployee?: number;
      socialInsuranceEmployer?: number;
      socialInsuranceDetails?: string;
    }> = [];

    for (const empId of args.employeeIds) {
      const emp = await ctx.db.get(empId);
      if (!emp || !emp.isActive) continue;

      // Allowances from employee record
      const housing = emp.housingAllowance ?? 0;
      const transport = emp.transportAllowance ?? 0;
      const other = emp.otherAllowances ?? 0;
      const totalAllowances = housing + transport + other;

      // Overtime calculation per employee's country labour law
      const country = getEmployeeCountry(emp);
      const countryOT = COUNTRY_OVERTIME_RATES[country] ?? COUNTRY_OVERTIME_RATES.QA;
      const overtimeEntry = args.overtime?.find((o) => o.employeeId === empId);
      let overtimeAmount = 0;
      let overtimeHours = 0;
      let overtimeRate = 0;
      if (overtimeEntry && overtimeEntry.hours > 0) {
        const hourlyRate = emp.baseSalary / (30 * 8); // monthly / 30 days / 8 hours
        overtimeRate =
          countryOT[overtimeEntry.rateType as keyof typeof countryOT] ?? countryOT.regular;
        overtimeHours = overtimeEntry.hours;
        overtimeAmount = hourlyRate * overtimeRate * overtimeHours;
      }

      // Social insurance deductions (auto-calculated if enabled)
      const siEnabled = emp.socialInsuranceEnabled !== false; // default enabled
      const siResult = siEnabled
        ? calculateSocialInsurance(country, emp.baseSalary)
        : {
            employeeContribution: 0,
            employerContribution: 0,
            details: "Disabled",
            applicable: false,
          };
      const siEmployeeDeduction = siResult.employeeContribution;
      const siEmployerCost = siResult.employerContribution;

      // Extra deductions
      const deductionEntry = args.extraDeductions?.find((d) => d.employeeId === empId);
      const deductAmt = (deductionEntry?.amount ?? 0) + siEmployeeDeduction;

      const netPay = emp.baseSalary + totalAllowances + overtimeAmount - deductAmt;

      const allowanceDetailParts = [];
      if (housing > 0) allowanceDetailParts.push(`Housing: ${housing}`);
      if (transport > 0) allowanceDetailParts.push(`Transport: ${transport}`);
      if (other > 0) allowanceDetailParts.push(`Other: ${other}`);
      if (overtimeAmount > 0)
        allowanceDetailParts.push(
          `Overtime (${overtimeHours}h x ${overtimeRate}x): ${Math.round(overtimeAmount)}`,
        );

      const deductionDetailParts: string[] = [];
      if (deductionEntry?.details) deductionDetailParts.push(deductionEntry.details);
      if (siEmployeeDeduction > 0)
        deductionDetailParts.push(`Social Insurance: ${Math.round(siEmployeeDeduction)}`);

      payslipData.push({
        employeeId: empId,
        baseSalary: emp.baseSalary,
        housingAllowance: housing || undefined,
        transportAllowance: transport || undefined,
        otherAllowances: other || undefined,
        overtimeHours: overtimeHours || undefined,
        overtimeRate: overtimeRate || undefined,
        overtimeAmount: overtimeAmount ? Math.round(overtimeAmount) : undefined,
        allowances: totalAllowances + overtimeAmount,
        deductions: deductAmt,
        netPay: Math.round(netPay),
        allowanceDetails:
          allowanceDetailParts.length > 0 ? allowanceDetailParts.join("; ") : undefined,
        deductionDetails:
          deductionDetailParts.length > 0
            ? deductionDetailParts.join("; ")
            : deductionEntry?.details,
        socialInsuranceEmployee: siEmployeeDeduction || undefined,
        socialInsuranceEmployer: siEmployerCost || undefined,
        socialInsuranceDetails: siResult.applicable ? siResult.details : undefined,
      });
      totalAmount += Math.round(netPay);
    }

    const runId = await ctx.db.insert("payrollRuns", {
      title: args.title,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      payDate: args.payDate,
      status: "draft",
      totalAmount,
      employeeCount: payslipData.length,
      notes: args.notes,
      createdBy: user._id,
    });

    for (const slip of payslipData) {
      await ctx.db.insert("payslips", { payrollRunId: runId, ...slip });
    }

    return runId;
  },
});

export const updatePayrollStatus = mutation({
  args: {
    id: v.id("payrollRuns"),
    status: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("paid"),
      v.literal("voided"),
    ),
    /** Required when transitioning to "paid". Must be a chart-of-accounts account ID (type bank/cash). */
    paymentAccountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    // Owner or manager only; owner always passes.
    if (user.role !== "owner" && user.role !== "manager") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }
    const run = await ctx.db.get(args.id);
    if (!run) throw new ConvexError({ message: "Payroll run not found", code: "NOT_FOUND" });

    const from = run.status;
    const to = args.status;

    // ── draft → approved: post accrual + employer SI ──────────────────────
    if (from === "draft" && to === "approved") {
      // Double-post guard
      if (await accrualAlreadyPosted(ctx, args.id)) {
        throw new ConvexError({
          message: "Payroll accrual has already been posted for this run",
          code: "CONFLICT",
        });
      }

      // Load payslips and build PayslipForPosting
      const payslips = await ctx.db
        .query("payslips")
        .withIndex("by_payroll_run", (q) => q.eq("payrollRunId", args.id))
        .collect();

      const slipsForPosting = payslips.map((s) => {
        const gross = s.baseSalary +
          (s.housingAllowance ?? 0) +
          (s.transportAllowance ?? 0) +
          (s.otherAllowances ?? 0) +
          (s.overtimeAmount ?? 0);
        const siEmployee = s.socialInsuranceEmployee ?? 0;
        const siEmployer = s.socialInsuranceEmployer ?? 0;
        // Manual deductions = total deductions minus the employee SI portion
        const manualDeductions = Math.max(0, s.deductions - siEmployee);
        return {
          employeeName: String(s.employeeId), // enriched below
          gross,
          netPay: s.netPay,
          siEmployee,
          siEmployer,
          manualDeductions,
        };
      });

      // Enrich with employee names for journal descriptions
      const enriched = await Promise.all(
        slipsForPosting.map(async (slip, i) => {
          const emp = await ctx.db.get(payslips[i].employeeId);
          return { ...slip, employeeName: emp?.name ?? `Employee ${String(payslips[i].employeeId)}` };
        }),
      );

      // Both entries posted in the same mutation transaction —
      // if the second throws, the entire mutation rolls back.
      await postPayrollAccrual(ctx, run, enriched, user._id);
      await postEmployerSI(ctx, run, enriched, user._id);

      await ctx.db.patch(args.id, { status: "approved" });
      return;
    }

    // ── approved → draft: reverse accrual and employer SI ────────────────
    if (from === "approved" && to === "draft") {
      await reversePayrollEntries(ctx, args.id, false, {
        date: run.payDate,
        createdBy: user._id,
      });
      await ctx.db.patch(args.id, { status: "draft" });
      return;
    }

    // ── approved → paid: post payment ─────────────────────────────────────
    if (from === "approved" && to === "paid") {
      if (!args.paymentAccountId) {
        throw new ConvexError({
          message: "paymentAccountId is required when marking a run as paid",
          code: "BAD_REQUEST",
        });
      }

      // Double-post guard
      if (await paymentAlreadyPosted(ctx, args.id)) {
        throw new ConvexError({
          message: "Payment has already been posted for this run",
          code: "CONFLICT",
        });
      }

      // Verify the account exists and has a valid ledgerAccountId if it came
      // from bankAccounts — callers must resolve this before calling.
      const payAccount = await ctx.db.get(args.paymentAccountId);
      if (!payAccount) {
        throw new ConvexError({ message: "Payment account not found", code: "NOT_FOUND" });
      }

      // Total net pay = sum of payslip netPay for this run
      const payslips = await ctx.db
        .query("payslips")
        .withIndex("by_payroll_run", (q) => q.eq("payrollRunId", args.id))
        .collect();
      const totalNetPay = payslips.reduce((sum, s) => sum + s.netPay, 0);

      await postPayrollPayment(ctx, run, args.paymentAccountId, totalNetPay, user._id);
      await ctx.db.patch(args.id, {
        status: "paid",
        paymentAccountId: args.paymentAccountId,
      });
      return;
    }

    // ── paid → approved: reverse payment only (accrual stays) ────────────
    if (from === "paid" && to === "approved") {
      await reversePayrollEntries(ctx, args.id, true, {
        date: run.payDate,
        createdBy: user._id,
      });
      // Also patch to remove paymentAccountId so it can be re-selected
      await ctx.db.patch(args.id, { status: "approved", paymentAccountId: undefined });
      return;
    }

    // ── voided: handled by voidPayrollRun — reject here ──────────────────
    if (to === "voided") {
      throw new ConvexError({
        message: "Use voidPayrollRun to void a run",
        code: "BAD_REQUEST",
      });
    }

    // Any other transition (e.g. same status) is a no-op
    await ctx.db.patch(args.id, { status: args.status });
  },
});

/**
 * Void a payroll run.
 *
 * Reverses all posted journal entries for the run (accrual, employer SI,
 * payment if paid), sets status to "voided", and leaves all rows intact.
 * Never deletes financial history.
 *
 * Hard delete is still available via deletePayrollRunDraft for draft runs
 * with no journal entries — this is the only permissible delete path.
 */
export const voidPayrollRun = mutation({
  args: { id: v.id("payrollRuns") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (user.role !== "owner" && user.role !== "manager") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    const run = await ctx.db.get(args.id);
    if (!run) throw new ConvexError({ message: "Payroll run not found", code: "NOT_FOUND" });

    if (run.status === "voided") {
      throw new ConvexError({ message: "Run is already voided", code: "CONFLICT" });
    }

    // Reverse all posted entries (payment reversal = true, covers both paid and approved)
    await reversePayrollEntries(ctx, args.id, true, {
      date: run.payDate,
      createdBy: user._id,
    });

    await ctx.db.patch(args.id, { status: "voided" });
  },
});

/**
 * Hard-delete a payroll run that is in draft status and has no journal entries.
 * This is the only permissible delete path. Approved, paid, and voided runs
 * have financial history and cannot be deleted.
 */
export const deletePayrollRunDraft = mutation({
  args: { id: v.id("payrollRuns") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const run = await ctx.db.get(args.id);
    if (!run) throw new ConvexError({ message: "Payroll run not found", code: "NOT_FOUND" });

    if (run.status !== "draft") {
      throw new ConvexError({
        message: `Cannot delete a ${run.status} payroll run. Use voidPayrollRun instead.`,
        code: "FORBIDDEN",
      });
    }

    // Safety check: confirm no journal entries exist for this run
    const existingEntry = await ctx.db
      .query("journalEntries")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", "payroll_accrual").eq("sourceId", args.id as string),
      )
      .first();

    if (existingEntry) {
      throw new ConvexError({
        message: "Cannot delete a run that has ledger entries. Use voidPayrollRun.",
        code: "FORBIDDEN",
      });
    }

    const payslips = await ctx.db
      .query("payslips")
      .withIndex("by_payroll_run", (q) => q.eq("payrollRunId", args.id))
      .collect();
    for (const slip of payslips) {
      await ctx.db.delete(slip._id);
    }
    await ctx.db.delete(args.id);
  },
});

// ─── Employee Payslip History ────────────────────────────────

export const getEmployeePayHistory = query({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const payslips = await ctx.db
      .query("payslips")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    const enriched = await Promise.all(
      payslips.map(async (slip) => {
        const run = await ctx.db.get(slip.payrollRunId);
        return {
          ...slip,
          periodStart: run?.periodStart,
          periodEnd: run?.periodEnd,
          payDate: run?.payDate,
          runTitle: run?.title,
          runStatus: run?.status,
        };
      }),
    );
    return enriched;
  },
});

// ─── End of Service Gratuity Calculator (Multi-Country) ─────

export const calculateGratuity = query({
  args: {
    employeeId: v.id("employees"),
    endDate: v.optional(v.string()),
    isResignation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });

    const country = getEmployeeCountry(emp);
    const rules = COUNTRY_GRATUITY_RULES[country] ?? COUNTRY_GRATUITY_RULES.QA;

    const hire = new Date(emp.hireDate);
    const end = args.endDate ? new Date(args.endDate) : new Date();
    const yearsWorked = (end.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    if (yearsWorked < rules.minYears) {
      return {
        yearsWorked: Math.round(yearsWorked * 100) / 100,
        gratuityAmount: 0,
        breakdown: `Less than ${rules.minYears} year${rules.minYears > 1 ? "s" : ""} — no gratuity`,
        baseSalary: emp.baseSalary,
        weeklyWage: Math.round(emp.baseSalary / 4.33),
        country,
        law: rules.law,
        isResignation: args.isResignation ?? false,
      };
    }

    const { amount, breakdown } = rules.calculate(emp.baseSalary, yearsWorked, args.isResignation);

    return {
      yearsWorked: Math.round(yearsWorked * 100) / 100,
      gratuityAmount: Math.round(amount),
      breakdown,
      baseSalary: emp.baseSalary,
      weeklyWage: Math.round(emp.baseSalary / 4.33),
      country,
      law: rules.law,
      isResignation: args.isResignation ?? false,
    };
  },
});

// ─── Leave Management ────────────────────────────────────────

/**
 * Helper: compute gratuity amount for an employee inline (no query ctx needed).
 * Returns 0 if the employee has not reached minimum tenure.
 */
function computeGratuityAmount(
  baseSalary: number,
  hireDate: string,
  country: string,
  asOfDate: string,
  isResignation: boolean,
): number {
  const rules = COUNTRY_GRATUITY_RULES[country] ?? COUNTRY_GRATUITY_RULES.QA;
  const hire = new Date(hireDate);
  const end = new Date(asOfDate);
  const yearsWorked = (end.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (yearsWorked < rules.minYears) return 0;
  const { amount } = rules.calculate(baseSalary, yearsWorked, isResignation);
  return Math.round(amount);
}

/**
 * Period-end gratuity accrual.
 *
 * For each active employee, calculates the current total gratuity obligation and
 * posts the DELTA vs the already-posted balance in 2700. Only positive deltas are
 * posted (over-accrual is unwound at termination, not here).
 */
export const accrueGratuityForPeriod = mutation({
  args: {
    asOfDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (user.role !== "owner" && user.role !== "manager") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    const activeEmployees = await ctx.db
      .query("employees")
      .collect()
      .then((all) => all.filter((e) => e.isActive !== false));

    const eosPayableId = await getEOSPayable(ctx);
    const eosExpenseId = await getEOSExpense(ctx);

    // Find 2700 posted credit balance per employee by scanning gratuity_accrual lines
    // We read all GRATUITY_ACCRUAL lines for 2700 and match by description pattern,
    // OR we use gratuityAccrualRuns with per-employee sourceId.
    // Architecture choice: one gratuityAccrualRun record per period, one JE per employee.
    // We compute the per-employee already-accrued balance from posted journal lines
    // tagged GRATUITY_ACCRUAL_SOURCE. Since sourceId is the accrualRun._id, we must
    // read all such lines for account 2700 — there is no per-employee index.
    // For now, read all GRATUITY_ACCRUAL journal entries and their 2700 lines.
    const allGratuityEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();

    const gratuityEntryIds = new Set(
      allGratuityEntries
        .filter((e) => e.sourceType === GRATUITY_ACCRUAL_SOURCE || e.sourceType === `${GRATUITY_ACCRUAL_SOURCE}_reversal`)
        .map((e) => e._id as string),
    );

    // Build per-employee accrued balance from lines description (employee name matching is fragile).
    // Better: accumulate total 2700 credit minus debit across all gratuity entries, then use
    // a single "already accrued total" rather than per-employee. This is correct because the
    // Reconciliation Panel compares the total anyway.
    // For the delta calculation per employee we use their individual computed amount.
    // The total posted = sum of all 2700 credit - debit in gratuity entries.
    let totalAlreadyAccrued = 0;
    for (const entryId of gratuityEntryIds) {
      const lines = await ctx.db
        .query("journalLines")
        .withIndex("by_journal_entry", (q) =>
          q.eq("journalEntryId", entryId as Parameters<typeof q.eq>[1]),
        )
        .collect();
      for (const line of lines) {
        if ((line.accountId as string) === (eosPayableId as string)) {
          totalAlreadyAccrued += (line.credit ?? 0) - (line.debit ?? 0);
        }
      }
    }
    totalAlreadyAccrued = round2(totalAlreadyAccrued);

    // Compute total current obligation across active employees
    let totalCurrentObligation = 0;
    for (const emp of activeEmployees) {
      if (!emp.hireDate) continue;
      const country = getEmployeeCountry(emp);
      const amount = computeGratuityAmount(emp.baseSalary, emp.hireDate, country, args.asOfDate, false);
      totalCurrentObligation += amount;
    }
    totalCurrentObligation = round2(totalCurrentObligation);

    const delta = round2(totalCurrentObligation - totalAlreadyAccrued);

    if (delta <= 0) {
      // No new accrual needed — return info without posting
      return {
        posted: false,
        reason: "No positive delta — obligation has not increased since last accrual",
        totalCurrentObligation,
        totalAlreadyAccrued,
        delta,
      };
    }

    // Insert the gratuityAccrualRuns record (used as sourceId)
    const accrualRunId = await ctx.db.insert("gratuityAccrualRuns", {
      asOfDate: args.asOfDate,
      status: "posted",
      employeeCount: activeEmployees.length,
      totalAccrued: delta,
      createdBy: user._id,
    });

    await postBalancedEntry(ctx, {
      date: args.asOfDate,
      description: `Gratuity accrual — ${args.asOfDate} (${activeEmployees.length} employees)`,
      reference: `Gratuity ${args.asOfDate}`,
      createdBy: user._id,
      sourceType: GRATUITY_ACCRUAL_SOURCE,
      sourceId: accrualRunId as string,
      lines: [
        {
          accountId: eosExpenseId,
          debit: delta,
          description: `EOS expense accrual — ${args.asOfDate}`,
        },
        {
          accountId: eosPayableId,
          credit: delta,
          description: `EOS benefits payable — ${args.asOfDate}`,
        },
      ],
    });

    return {
      posted: true,
      accrualRunId: accrualRunId as string,
      totalCurrentObligation,
      totalAlreadyAccrued,
      delta,
      employeeCount: activeEmployees.length,
    };
  },
});

/**
 * Pay end-of-service gratuity to a departing employee.
 *
 * Clears the entire accrued balance in 2700 for the company (since the accrual
 * is aggregate, not per-employee), then credits the bank for the actual payment.
 * The difference (over- or under-accrual) is posted to 6020.
 *
 * Caller must supply:
 *   - paymentAmount: the actual amount paid to the employee
 *   - paymentAccountId: chart-of-accounts ID for the bank/cash account
 *   - terminationDate: ISO date string of termination
 *   - isResignation: affects the gratuity calculation for the amount verification
 */
export const payGratuity = mutation({
  args: {
    employeeId: v.id("employees"),
    paymentAmount: v.number(),
    paymentAccountId: v.id("accounts"),
    terminationDate: v.string(),
    isResignation: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (user.role !== "owner" && user.role !== "manager") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    const emp = await ctx.db.get(args.employeeId);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });

    const payAccount = await ctx.db.get(args.paymentAccountId);
    if (!payAccount) throw new ConvexError({ message: "Payment account not found", code: "NOT_FOUND" });

    if (args.paymentAmount <= 0) {
      throw new ConvexError({ message: "Payment amount must be positive", code: "BAD_REQUEST" });
    }

    const eosPayableId = await getEOSPayable(ctx);
    const eosExpenseId = await getEOSExpense(ctx);

    // Read the current total 2700 posted credit balance (entire company)
    const allGratuityEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();

    const gratuitySourceTypes = new Set([
      GRATUITY_ACCRUAL_SOURCE,
      `${GRATUITY_ACCRUAL_SOURCE}_reversal`,
      GRATUITY_PAYMENT_SOURCE,
      `${GRATUITY_PAYMENT_SOURCE}_reversal`,
    ]);

    const gratuityEntryIds = allGratuityEntries
      .filter((e) => gratuitySourceTypes.has(e.sourceType ?? ""))
      .map((e) => e._id as string);

    let totalAccruedBalance = 0;
    for (const entryId of gratuityEntryIds) {
      const lines = await ctx.db
        .query("journalLines")
        .withIndex("by_journal_entry", (q) =>
          q.eq("journalEntryId", entryId as Parameters<typeof q.eq>[1]),
        )
        .collect();
      for (const line of lines) {
        if ((line.accountId as string) === (eosPayableId as string)) {
          totalAccruedBalance += (line.credit ?? 0) - (line.debit ?? 0);
        }
      }
    }
    totalAccruedBalance = round2(totalAccruedBalance);

    const payment = round2(args.paymentAmount);
    // correction > 0 means under-accrual (extra expense); < 0 means over-accrual (income credit)
    const correction = round2(payment - totalAccruedBalance);

    // Build lines
    type LineArg = { accountId: typeof eosPayableId; debit?: number; credit?: number; description?: string };
    const lines: LineArg[] = [];

    // Clear the full accrued balance in 2700
    if (totalAccruedBalance > 0) {
      lines.push({
        accountId: eosPayableId,
        debit: totalAccruedBalance,
        description: `EOS benefits payable cleared — ${emp.name}`,
      });
    }

    // Bank credit for actual payment
    lines.push({
      accountId: args.paymentAccountId as typeof eosPayableId,
      credit: payment,
      description: `Gratuity payment — ${emp.name}`,
    });

    // Correction to 6020 for the difference
    if (Math.abs(correction) >= 0.01) {
      if (correction > 0) {
        // Under-accrual: additional expense
        lines.push({
          accountId: eosExpenseId as typeof eosPayableId,
          debit: correction,
          description: `Under-accrual correction — ${emp.name}`,
        });
      } else {
        // Over-accrual: reverse excess expense
        lines.push({
          accountId: eosExpenseId as typeof eosPayableId,
          credit: Math.abs(correction),
          description: `Over-accrual reversal — ${emp.name}`,
        });
      }
    }

    // If no accrual existed (totalAccruedBalance = 0), debit 6020 for the full payment
    if (totalAccruedBalance <= 0 && Math.abs(correction) < 0.01) {
      lines.push({
        accountId: eosExpenseId as typeof eosPayableId,
        debit: payment,
        description: `EOS expense (no prior accrual) — ${emp.name}`,
      });
    }

    const entryId = await postBalancedEntry(ctx, {
      date: args.terminationDate,
      description: `Gratuity payment — ${emp.name}${args.notes ? ` (${args.notes})` : ""}`,
      reference: `Gratuity-${emp.name}`,
      createdBy: user._id,
      sourceType: GRATUITY_PAYMENT_SOURCE,
      sourceId: args.employeeId as string,
      lines,
    });

    return {
      journalEntryId: entryId as string,
      employeeName: emp.name,
      paymentAmount: payment,
      totalAccruedBalance,
      correction,
    };
  },
});

export const listLeaveRecords = query({
  args: { employeeId: v.optional(v.id("employees")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.employeeId) {
      return await ctx.db
        .query("leaveRecords")
        .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId!))
        .collect();
    }
    return await ctx.db.query("leaveRecords").order("desc").collect();
  },
});

export const createLeaveRequest = mutation({
  args: {
    employeeId: v.id("employees"),
    type: v.union(
      v.literal("annual"),
      v.literal("sick"),
      v.literal("unpaid"),
      v.literal("emergency"),
    ),
    startDate: v.string(),
    endDate: v.string(),
    days: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });

    return await ctx.db.insert("leaveRecords", { ...args, status: "pending" });
  },
});

export const updateLeaveStatus = mutation({
  args: { id: v.id("leaveRecords"), status: v.union(v.literal("approved"), v.literal("rejected")) },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const record = await ctx.db.get(args.id);
    if (!record) throw new ConvexError({ message: "Leave record not found", code: "NOT_FOUND" });

    await ctx.db.patch(args.id, { status: args.status, approvedBy: user?._id });

    // If approved, deduct from employee's leave balance
    if (args.status === "approved") {
      const emp = await ctx.db.get(record.employeeId);
      if (emp) {
        if (record.type === "annual") {
          await ctx.db.patch(record.employeeId, {
            annualLeaveBalance: Math.max(0, (emp.annualLeaveBalance ?? 21) - record.days),
          });
        } else if (record.type === "sick") {
          await ctx.db.patch(record.employeeId, {
            sickLeaveBalance: Math.max(0, (emp.sickLeaveBalance ?? 14) - record.days),
          });
        } else if (record.type === "unpaid") {
          await ctx.db.patch(record.employeeId, {
            unpaidLeaveTaken: (emp.unpaidLeaveTaken ?? 0) + record.days,
          });
        }
      }
    }
  },
});

// ─── WPS Export Data ─────────────────────────────────────────

// ─── Country Leave Policy Configuration ─────────────────────

type LeavePolicyEntry = {
  type: string;
  label: string;
  days: number;
  payRate: string; // "full", "half", "75%", "unpaid"
  condition?: string;
  law: string;
};

function getCountryLeavePoliciesForTenure(
  country: string,
  yearsWorked: number,
): LeavePolicyEntry[] {
  switch (country) {
    case "QA":
      return [
        {
          type: "annual",
          label: "Annual Leave",
          days: yearsWorked >= 1 ? 21 : 0,
          payRate: "full",
          condition: yearsWorked < 1 ? "Accrues after 1 year" : undefined,
          law: "Qatar Labour Law Art. 79",
        },
        {
          type: "sick",
          label: "Sick Leave",
          days: 14,
          payRate: "full",
          law: "Qatar Labour Law Art. 82",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 50,
          payRate: "full",
          law: "Qatar Labour Law Art. 96",
        },
        {
          type: "hajj",
          label: "Hajj Leave",
          days: 10,
          payRate: "full",
          condition: "Once during employment (Muslim employees)",
          law: "Qatar Labour Law Art. 80",
        },
      ];
    case "AE":
      return [
        {
          type: "annual",
          label: "Annual Leave",
          days: yearsWorked >= 1 ? 30 : 2,
          payRate: "full",
          condition: yearsWorked < 1 ? "2 days/month until 1 year" : undefined,
          law: "UAE Labour Law Art. 29",
        },
        {
          type: "sick",
          label: "Sick Leave (full pay)",
          days: 15,
          payRate: "full",
          law: "UAE Labour Law Art. 31",
        },
        {
          type: "sick_half",
          label: "Sick Leave (half pay)",
          days: 30,
          payRate: "half",
          law: "UAE Labour Law Art. 31",
        },
        {
          type: "sick_unpaid",
          label: "Sick Leave (unpaid)",
          days: 45,
          payRate: "unpaid",
          law: "UAE Labour Law Art. 31",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 60,
          payRate: "full",
          condition: "45 full + 15 half pay",
          law: "UAE Labour Law Art. 30",
        },
        {
          type: "paternity",
          label: "Paternity Leave",
          days: 5,
          payRate: "full",
          law: "UAE Labour Law Art. 32",
        },
      ];
    case "SA":
      return [
        {
          type: "annual",
          label: "Annual Leave",
          days: yearsWorked >= 5 ? 30 : 21,
          payRate: "full",
          condition: yearsWorked < 5 ? "Increases to 30 days after 5 years" : undefined,
          law: "Saudi Labour Law Art. 109",
        },
        {
          type: "sick",
          label: "Sick Leave (full pay)",
          days: 30,
          payRate: "full",
          law: "Saudi Labour Law Art. 117",
        },
        {
          type: "sick_75",
          label: "Sick Leave (75% pay)",
          days: 60,
          payRate: "75%",
          law: "Saudi Labour Law Art. 117",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 70,
          payRate: "full",
          condition: "10 weeks total",
          law: "Saudi Labour Law Art. 151",
        },
        {
          type: "paternity",
          label: "Paternity Leave",
          days: 3,
          payRate: "full",
          law: "Saudi Labour Law Art. 113",
        },
        {
          type: "hajj",
          label: "Hajj Leave",
          days: 15,
          payRate: "full",
          condition: "Once during employment (after 2 years)",
          law: "Saudi Labour Law Art. 114",
        },
      ];
    case "PK":
      return [
        {
          type: "annual",
          label: "Annual Leave",
          days: 14,
          payRate: "full",
          law: "Factories Act 1934 Sec. 49-B",
        },
        {
          type: "casual",
          label: "Casual Leave",
          days: 10,
          payRate: "full",
          law: "W.P. Shops & Establishments Ordinance",
        },
        {
          type: "sick",
          label: "Sick Leave",
          days: 16,
          payRate: "half",
          condition: "Half pay (full pay varies by province)",
          law: "Factories Act 1934 Sec. 49-C",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 90,
          payRate: "full",
          condition: "12 weeks",
          law: "Maternity Benefits Ordinance 1958",
        },
      ];
    case "IN":
      return [
        {
          type: "annual",
          label: "Earned/Privilege Leave",
          days: 15,
          payRate: "full",
          condition: "1 day per 20 days worked",
          law: "Factories Act 1948 Sec. 79",
        },
        {
          type: "casual",
          label: "Casual Leave",
          days: 12,
          payRate: "full",
          law: "State Shops & Establishments Acts",
        },
        {
          type: "sick",
          label: "Sick Leave",
          days: 12,
          payRate: "half",
          condition: "Half pay (varies by state)",
          law: "ESI Act 1948 / State Acts",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 182,
          payRate: "full",
          condition: "26 weeks",
          law: "Maternity Benefit Act 2017",
        },
        {
          type: "paternity",
          label: "Paternity Leave",
          days: 15,
          payRate: "full",
          condition: "Central Govt. only; private varies",
          law: "CCS Leave Rules",
        },
      ];
    case "BH":
      return [
        {
          type: "annual",
          label: "Annual Leave",
          days: 30,
          payRate: "full",
          law: "Bahrain Labour Law Art. 58",
        },
        {
          type: "sick",
          label: "Sick Leave (full pay)",
          days: 15,
          payRate: "full",
          law: "Bahrain Labour Law Art. 82",
        },
        {
          type: "sick_half",
          label: "Sick Leave (half pay)",
          days: 20,
          payRate: "half",
          law: "Bahrain Labour Law Art. 82",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 75,
          payRate: "full",
          condition: "60 full + 15 unpaid",
          law: "Bahrain Labour Law Art. 64",
        },
      ];
    case "KW":
      return [
        {
          type: "annual",
          label: "Annual Leave",
          days: 30,
          payRate: "full",
          law: "Kuwait Labour Law Art. 70",
        },
        {
          type: "sick",
          label: "Sick Leave (full pay)",
          days: 15,
          payRate: "full",
          law: "Kuwait Labour Law Art. 69",
        },
        {
          type: "sick_75",
          label: "Sick Leave (75% pay)",
          days: 10,
          payRate: "75%",
          law: "Kuwait Labour Law Art. 69",
        },
        {
          type: "sick_half",
          label: "Sick Leave (half pay)",
          days: 10,
          payRate: "half",
          law: "Kuwait Labour Law Art. 69",
        },
        {
          type: "sick_25",
          label: "Sick Leave (25% pay)",
          days: 10,
          payRate: "25%",
          law: "Kuwait Labour Law Art. 69",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 70,
          payRate: "full",
          law: "Kuwait Labour Law Art. 24",
        },
      ];
    case "OM":
      return [
        {
          type: "annual",
          label: "Annual Leave",
          days: 30,
          payRate: "full",
          law: "Oman Labour Law Art. 61",
        },
        {
          type: "sick",
          label: "Sick Leave (full pay)",
          days: 14,
          payRate: "full",
          law: "Oman Labour Law Art. 63",
        },
        {
          type: "sick_75",
          label: "Sick Leave (75% pay)",
          days: 14,
          payRate: "75%",
          law: "Oman Labour Law Art. 63",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 50,
          payRate: "full",
          law: "Oman Labour Law Art. 67",
        },
        {
          type: "paternity",
          label: "Paternity Leave",
          days: 7,
          payRate: "full",
          law: "Oman Labour Law Art. 62",
        },
      ];
    case "EG":
      return [
        {
          type: "annual",
          label: "Annual Leave",
          days: yearsWorked >= 10 ? 30 : 21,
          payRate: "full",
          condition: yearsWorked < 10 ? "Increases to 30 days after 10 years" : undefined,
          law: "Egypt Labour Law Art. 47",
        },
        {
          type: "sick",
          label: "Sick Leave (75% pay)",
          days: 90,
          payRate: "75%",
          condition: "Up to 180 days over 3 years",
          law: "Egypt Labour Law Art. 54",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 90,
          payRate: "full",
          law: "Egypt Labour Law Art. 91",
        },
      ];
    case "JO":
      return [
        {
          type: "annual",
          label: "Annual Leave",
          days: 14,
          payRate: "full",
          condition: yearsWorked >= 5 ? "21 days after 5 years" : undefined,
          law: "Jordan Labour Law Art. 61",
        },
        {
          type: "sick",
          label: "Sick Leave (full pay)",
          days: 14,
          payRate: "full",
          law: "Jordan Labour Law Art. 65",
        },
        {
          type: "sick_half",
          label: "Sick Leave (half pay)",
          days: 14,
          payRate: "half",
          law: "Jordan Labour Law Art. 65",
        },
        {
          type: "maternity",
          label: "Maternity Leave",
          days: 70,
          payRate: "full",
          law: "Jordan Labour Law Art. 70",
        },
        {
          type: "paternity",
          label: "Paternity Leave",
          days: 3,
          payRate: "full",
          law: "Jordan Labour Law Art. 71",
        },
      ];
    default:
      return [
        { type: "annual", label: "Annual Leave", days: 21, payRate: "full", law: "Default" },
        { type: "sick", label: "Sick Leave", days: 14, payRate: "full", law: "Default" },
      ];
  }
}

export const getCountryLeavePolicies = query({
  args: { employeeId: v.optional(v.id("employees")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (!args.employeeId) return null;
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) return null;
    const country = getEmployeeCountry(emp);
    const hireDate = new Date(emp.hireDate);
    const now = new Date();
    const yearsWorked = (now.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const policies = getCountryLeavePoliciesForTenure(country, yearsWorked);
    const countryName =
      (
        {
          QA: "Qatar",
          AE: "UAE",
          SA: "Saudi Arabia",
          PK: "Pakistan",
          IN: "India",
          BH: "Bahrain",
          KW: "Kuwait",
          OM: "Oman",
          EG: "Egypt",
          JO: "Jordan",
          US: "United States",
          CA: "Canada",
        } as Record<string, string>
      )[country] ?? country;
    return {
      country,
      countryName,
      yearsWorked: Math.round(yearsWorked * 100) / 100,
      policies,
      currentBalances: {
        annual: emp.annualLeaveBalance ?? 0,
        sick: emp.sickLeaveBalance ?? 0,
        unpaidTaken: emp.unpaidLeaveTaken ?? 0,
      },
    };
  },
});

export const recalculateLeaveEntitlements = mutation({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const emp = await ctx.db.get(args.employeeId);
    if (!emp) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });
    const country = getEmployeeCountry(emp);
    const hireDate = new Date(emp.hireDate);
    const now = new Date();
    const yearsWorked = (now.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const policies = getCountryLeavePoliciesForTenure(country, yearsWorked);

    // Find the annual and sick leave entitlements
    const annualPolicy = policies.find((p) => p.type === "annual");
    const sickPolicy = policies.find((p) => p.type === "sick");

    const updates: { annualLeaveBalance?: number; sickLeaveBalance?: number } = {};
    if (annualPolicy) {
      updates.annualLeaveBalance = annualPolicy.days;
    }
    if (sickPolicy) {
      updates.sickLeaveBalance = sickPolicy.days;
    }

    await ctx.db.patch(args.employeeId, updates);
    return { annual: updates.annualLeaveBalance, sick: updates.sickLeaveBalance };
  },
});

export const recalculateAllLeaveEntitlements = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const employees = await ctx.db.query("employees").collect();
    const activeEmployees = employees.filter((e) => e.isActive);
    let updated = 0;

    for (const emp of activeEmployees) {
      const country = getEmployeeCountry(emp);
      const hireDate = new Date(emp.hireDate);
      const now = new Date();
      const yearsWorked = (now.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      const policies = getCountryLeavePoliciesForTenure(country, yearsWorked);

      const annualPolicy = policies.find((p) => p.type === "annual");
      const sickPolicy = policies.find((p) => p.type === "sick");

      const newAnnual = annualPolicy?.days ?? 21;
      const newSick = sickPolicy?.days ?? 14;

      // Only update if entitlement changed (tenure milestone reached)
      if ((emp.annualLeaveBalance ?? 0) !== newAnnual || (emp.sickLeaveBalance ?? 0) !== newSick) {
        await ctx.db.patch(emp._id, { annualLeaveBalance: newAnnual, sickLeaveBalance: newSick });
        updated++;
      }
    }
    return { updated, total: activeEmployees.length };
  },
});

export const getWpsExportData = query({
  args: { payrollRunId: v.id("payrollRuns") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const run = await ctx.db.get(args.payrollRunId);
    if (!run) throw new ConvexError({ message: "Payroll run not found", code: "NOT_FOUND" });

    const payslips = await ctx.db
      .query("payslips")
      .withIndex("by_payroll_run", (q) => q.eq("payrollRunId", args.payrollRunId))
      .collect();

    const rows = await Promise.all(
      payslips.map(async (slip) => {
        const emp = await ctx.db.get(slip.employeeId);
        return {
          employeeId: emp?.employeeId ?? "",
          employeeName: emp?.name ?? "",
          qidNumber: emp?.qidNumber ?? "",
          bankName: emp?.bankName ?? "",
          bankAccount: emp?.bankAccount ?? "",
          routingNumber: emp?.routingNumber ?? "",
          baseSalary: slip.baseSalary,
          housingAllowance: slip.housingAllowance ?? 0,
          transportAllowance: slip.transportAllowance ?? 0,
          otherAllowances: slip.otherAllowances ?? 0,
          overtimeAmount: slip.overtimeAmount ?? 0,
          totalAllowances: slip.allowances,
          deductions: slip.deductions,
          netPay: slip.netPay,
          payDate: run.payDate,
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
        };
      }),
    );

    return {
      runTitle: run.title,
      payDate: run.payDate,
      totalAmount: run.totalAmount,
      employeeCount: run.employeeCount,
      rows,
    };
  },
});
