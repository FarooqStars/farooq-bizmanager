/**
 * Converts a number to words in English, Arabic, or Urdu.
 * Used for displaying amounts in words on printed documents.
 */

const ONES_EN = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS_EN = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

const SCALES_EN = ["", "Thousand", "Million", "Billion"];

function convertGroupEn(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES_EN[n];
  if (n < 100) {
    const t = TENS_EN[Math.floor(n / 10)];
    const o = ONES_EN[n % 10];
    return o ? `${t}-${o}` : t;
  }
  const h = `${ONES_EN[Math.floor(n / 100)]} Hundred`;
  const rem = n % 100;
  return rem ? `${h} ${convertGroupEn(rem)}` : h;
}

function numberToWordsEn(num: number): string {
  if (num === 0) return "Zero";
  if (num < 0) return `Negative ${numberToWordsEn(-num)}`;

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  let result = "";
  let remaining = intPart;
  let scaleIdx = 0;

  while (remaining > 0) {
    const group = remaining % 1000;
    if (group !== 0) {
      const groupStr = convertGroupEn(group);
      const scale = SCALES_EN[scaleIdx];
      result = scale ? `${groupStr} ${scale} ${result}` : `${groupStr} ${result}`;
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx++;
  }

  result = result.trim();

  if (decPart > 0) {
    result += ` and ${decPart}/100`;
  }

  return result || "Zero";
}

// Arabic number words
const ONES_AR = [
  "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
  "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر",
  "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
];

const TENS_AR = [
  "", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون",
];

function convertGroupAr(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES_AR[n];
  if (n < 100) {
    const t = TENS_AR[Math.floor(n / 10)];
    const o = ONES_AR[n % 10];
    return o ? `${o} و${t}` : t;
  }
  const h = n >= 200 ? `${ONES_AR[Math.floor(n / 100)]}مائة` : "مائة";
  const rem = n % 100;
  return rem ? `${h} و${convertGroupAr(rem)}` : h;
}

function numberToWordsAr(num: number): string {
  if (num === 0) return "صفر";
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  const SCALES_AR = ["", "ألف", "مليون", "مليار"];
  let result = "";
  let remaining = intPart;
  let scaleIdx = 0;

  while (remaining > 0) {
    const group = remaining % 1000;
    if (group !== 0) {
      const groupStr = convertGroupAr(group);
      const scale = SCALES_AR[scaleIdx];
      const segment = scale ? `${groupStr} ${scale}` : groupStr;
      result = result ? `${segment} و${result}` : segment;
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx++;
  }

  if (decPart > 0) {
    result += ` و ${decPart}/100`;
  }

  return result || "صفر";
}

// Urdu number words
const ONES_UR = [
  "", "ایک", "دو", "تین", "چار", "پانچ", "چھ", "سات", "آٹھ", "نو",
  "دس", "گیارہ", "بارہ", "تیرہ", "چودہ", "پندرہ",
  "سولہ", "سترہ", "اٹھارہ", "انیس",
];

const TENS_UR = [
  "", "", "بیس", "تیس", "چالیس", "پچاس", "ساٹھ", "ستر", "اسی", "نوے",
];

function convertGroupUr(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES_UR[n];
  if (n < 100) {
    const t = TENS_UR[Math.floor(n / 10)];
    const o = ONES_UR[n % 10];
    return o ? `${o} ${t}` : t;
  }
  const h = `${ONES_UR[Math.floor(n / 100)]} سو`;
  const rem = n % 100;
  return rem ? `${h} ${convertGroupUr(rem)}` : h;
}

function numberToWordsUr(num: number): string {
  if (num === 0) return "صفر";
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  const SCALES_UR = ["", "ہزار", "لاکھ", "کروڑ"];
  let result = "";
  let remaining = intPart;
  let scaleIdx = 0;

  while (remaining > 0) {
    const group = remaining % 1000;
    if (group !== 0) {
      const groupStr = convertGroupUr(group);
      const scale = SCALES_UR[scaleIdx];
      const segment = scale ? `${groupStr} ${scale}` : groupStr;
      result = result ? `${segment} ${result}` : segment;
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx++;
  }

  if (decPart > 0) {
    result += ` اور ${decPart}/100`;
  }

  return result || "صفر";
}

/**
 * Converts a number to words in the given language.
 */
export function numberToWords(num: number, lang: string = "en"): string {
  const absNum = Math.abs(num);
  switch (lang) {
    case "ar":
      return numberToWordsAr(absNum);
    case "ur":
      return numberToWordsUr(absNum);
    default:
      return numberToWordsEn(absNum);
  }
}
