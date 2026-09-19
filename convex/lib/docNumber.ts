// Derive the next document number from the highest existing sequence value
// rather than a row count. Counting reuses a number after any row is deleted
// (10 invoices, delete one => count 9 => "INV-00010" collides). Parsing the
// trailing integer and taking the max avoids that.

export function maxNumber<T>(docs: T[], getNum: (doc: T) => string | undefined | null): number {
  let max = 0;
  for (const doc of docs) {
    const value = getNum(doc);
    if (!value) continue;
    const match = /(\d+)$/.exec(value);
    if (!match) continue;
    const parsed = parseInt(match[1], 10);
    if (parsed > max) max = parsed;
  }
  return max;
}

export function nextNumber<T>(
  docs: T[],
  getNum: (doc: T) => string | undefined | null,
  prefix: string,
  pad = 0,
): string {
  return `${prefix}${String(maxNumber(docs, getNum) + 1).padStart(pad, "0")}`;
}
