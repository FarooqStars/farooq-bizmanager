/**
 * Parsers for QuickBooks (IIF, CSV), Peachtree/Sage 50 (CSV), and Tally (XML)
 * accounting software file formats.
 */

export type ImportSource = "quickbooks" | "peachtree" | "tally";
export type FileFormat = "iif" | "csv" | "xml";

export const SOURCE_LABELS: Record<ImportSource, string> = {
  quickbooks: "QuickBooks",
  peachtree: "Peachtree / Sage 50",
  tally: "Tally",
};

export const FORMAT_LABELS: Record<FileFormat, string> = {
  iif: "IIF (Intuit Interchange Format)",
  csv: "CSV (Comma Separated)",
  xml: "XML (Data Export)",
};

export const SOURCE_FORMATS: Record<ImportSource, FileFormat[]> = {
  quickbooks: ["iif", "csv"],
  peachtree: ["csv"],
  tally: ["xml", "csv"],
};

export const EXPORT_INSTRUCTIONS: Record<ImportSource, string[]> = {
  quickbooks: [
    "Open QuickBooks Desktop and go to File > Utilities > Export > Lists to IIF Files",
    "Select the lists you want to export (Chart of Accounts, Customer List, Vendor List, Item List)",
    "Choose a location to save the .IIF file",
    "For CSV: Go to Reports > select any report > click Excel > Create New Worksheet > Export as CSV",
    "For QuickBooks Online: Go to Settings > Export Data > select data types and download",
    "Backup files (.QBB, .QBW) can be restored and then exported as above",
  ],
  peachtree: [
    "Open Peachtree/Sage 50 and go to File > Select Import/Export",
    "Choose Export and select the record type (Accounts, Customers, Vendors, Inventory)",
    "Select CSV as the output format",
    "Choose fields to include and click Export",
    "For backup data: Restore the backup first, then export as above",
    "Sage 50 2022+: Go to Tasks > Export Records > select record type",
  ],
  tally: [
    "Open Tally ERP/Prime and go to Gateway of Tally > Export Data",
    "Select the masters to export (Ledgers, Stock Items, Groups)",
    "Choose XML format for export",
    "Set the export path and click Export",
    "For Tally Prime: Go to Export > Masters > select types > XML format",
    "Backup files can be restored using Tally's restore feature, then exported",
  ],
};

export type ParsedAccount = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  subType?: string;
  description?: string;
  balance?: number;
};

export type ParsedCustomer = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export type ParsedVendor = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export type ParsedProduct = {
  name: string;
  sku?: string;
  description?: string;
  type?: string;
  unitPrice?: number;
  unit?: string;
};

export type ParsedJournalEntry = {
  date: string;
  description: string;
  lines: { accountName: string; debit: number; credit: number }[];
};

export type ParsedAccountingData = {
  accounts: ParsedAccount[];
  customers: ParsedCustomer[];
  vendors: ParsedVendor[];
  products: ParsedProduct[];
  journalEntries: ParsedJournalEntry[];
  errors: string[];
};

// Map QuickBooks account types to our system
function mapQBAccountType(qbType: string): "asset" | "liability" | "equity" | "revenue" | "expense" {
  const typeMap: Record<string, "asset" | "liability" | "equity" | "revenue" | "expense"> = {
    // QuickBooks types
    "bank": "asset",
    "ar": "asset",
    "accounts receivable": "asset",
    "otherasset": "asset",
    "other asset": "asset",
    "fixedasset": "asset",
    "fixed asset": "asset",
    "othercurrentasset": "asset",
    "other current asset": "asset",
    "currentasset": "asset",
    "current asset": "asset",
    "cash": "asset",
    "ap": "liability",
    "accounts payable": "liability",
    "creditcard": "liability",
    "credit card": "liability",
    "othercurrentliability": "liability",
    "other current liability": "liability",
    "currentliability": "liability",
    "current liability": "liability",
    "longtermliability": "liability",
    "long term liability": "liability",
    "otherliability": "liability",
    "other liability": "liability",
    "equity": "equity",
    "income": "revenue",
    "revenue": "revenue",
    "otherincome": "revenue",
    "other income": "revenue",
    "expense": "expense",
    "otherexpense": "expense",
    "other expense": "expense",
    "costofgoodssold": "expense",
    "cost of goods sold": "expense",
    "cogs": "expense",
  };

  const normalized = qbType.toLowerCase().trim();
  return typeMap[normalized] ?? "expense";
}

// Map Peachtree account types
function mapPeachtreeAccountType(code: string): "asset" | "liability" | "equity" | "revenue" | "expense" {
  // Peachtree uses account code ranges
  const firstDigit = code.charAt(0);
  switch (firstDigit) {
    case "1": return "asset";
    case "2": return "liability";
    case "3": return "equity";
    case "4": return "revenue";
    case "5": case "6": case "7": return "expense";
    default: return "expense";
  }
}

// Map Tally groups to account types
function mapTallyGroupType(group: string): "asset" | "liability" | "equity" | "revenue" | "expense" {
  const g = group.toLowerCase().trim();
  if (g.includes("asset") || g.includes("bank") || g.includes("cash") || g.includes("debtors") || g.includes("receivable")) return "asset";
  if (g.includes("liabilit") || g.includes("creditor") || g.includes("payable") || g.includes("loan") || g.includes("duty")) return "liability";
  if (g.includes("capital") || g.includes("reserve") || g.includes("equity")) return "equity";
  if (g.includes("income") || g.includes("revenue") || g.includes("sales")) return "revenue";
  if (g.includes("expense") || g.includes("purchase") || g.includes("cost")) return "expense";
  return "expense";
}

/**
 * Parse QuickBooks IIF (Intuit Interchange Format) files.
 * IIF is a tab-separated format with section headers (!ACCNT, !CUST, !VEND, etc.)
 */
export function parseQuickBooksIIF(content: string): ParsedAccountingData {
  const accounts: ParsedAccount[] = [];
  const customers: ParsedCustomer[] = [];
  const vendors: ParsedVendor[] = [];
  const products: ParsedProduct[] = [];
  const journalEntries: ParsedJournalEntry[] = [];
  const errors: string[] = [];

  const lines = content.split(/\r?\n/);
  let currentSection = "";
  let headers: string[] = [];
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Section headers start with !
    if (trimmed.startsWith("!")) {
      currentSection = trimmed.split("\t")[0].replace("!", "").toUpperCase();
      headers = trimmed.split("\t").map((h) => h.replace("!", "").toUpperCase());
      continue;
    }

    const fields = trimmed.split("\t");
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length && i < fields.length; i++) {
      record[headers[i]] = fields[i] ?? "";
    }

    try {
      switch (currentSection) {
        case "ACCNT": {
          const name = record["NAME"] ?? record["ACCNT"];
          if (!name) break;
          const accType = record["ACCNTTYPE"] ?? record["TYPE"] ?? "expense";
          const balance = parseFloat(record["BALANCE"] ?? record["OPENBAL"] ?? "0") || 0;
          const code = record["ACCNUM"] ?? record["CODE"] ?? generateAccountCode(accounts.length, mapQBAccountType(accType));
          accounts.push({
            code,
            name,
            type: mapQBAccountType(accType),
            subType: record["ACCNTTYPE"] ?? undefined,
            description: record["DESC"] ?? undefined,
            balance,
          });
          break;
        }
        case "CUST": {
          const name = record["NAME"] ?? record["CUST"];
          if (!name) break;
          customers.push({
            name,
            email: record["EMAIL"] ?? record["EMAIL1"] ?? undefined,
            phone: record["PHONE1"] ?? record["PHONE"] ?? undefined,
            address: [record["ADDR1"], record["ADDR2"], record["CITY"], record["STATE"]]
              .filter(Boolean).join(", ") || undefined,
            notes: record["NOTE"] ?? record["NOTEPAD"] ?? undefined,
          });
          break;
        }
        case "VEND": {
          const name = record["NAME"] ?? record["VEND"];
          if (!name) break;
          vendors.push({
            name,
            email: record["EMAIL"] ?? record["EMAIL1"] ?? undefined,
            phone: record["PHONE1"] ?? record["PHONE"] ?? undefined,
            address: [record["ADDR1"], record["ADDR2"], record["CITY"], record["STATE"]]
              .filter(Boolean).join(", ") || undefined,
            notes: record["NOTE"] ?? record["NOTEPAD"] ?? undefined,
          });
          break;
        }
        case "INVITEM":
        case "ITEM": {
          const name = record["NAME"] ?? record["ITEM"];
          if (!name) break;
          products.push({
            name,
            sku: record["PARTNUM"] ?? record["SKU"] ?? undefined,
            description: record["DESC"] ?? record["DESCRIPTION"] ?? undefined,
            type: (record["TYPE"] ?? "").toLowerCase().includes("service") ? "service" : "product",
            unitPrice: parseFloat(record["PRICE"] ?? record["RATE"] ?? "0") || 0,
            unit: record["UNIT"] ?? undefined,
          });
          break;
        }
        case "TRNS":
        case "SPL": {
          // Journal entry transactions - note them but complex to fully parse
          if (currentSection === "TRNS" && record["TRNSTYPE"] === "GENERAL JOURNAL") {
            journalEntries.push({
              date: record["DATE"] ?? new Date().toISOString().split("T")[0],
              description: record["MEMO"] ?? "Imported journal entry",
              lines: [],
            });
          }
          break;
        }
      }
    } catch (err) {
      errors.push(`Line ${lineNum}: Failed to parse record - ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  if (accounts.length === 0 && customers.length === 0 && vendors.length === 0 && products.length === 0) {
    errors.push("No recognizable data found in this IIF file. Make sure the file contains section headers like !ACCNT, !CUST, !VEND, or !INVITEM.");
  }

  return { accounts, customers, vendors, products, journalEntries, errors };
}

/**
 * Parse QuickBooks CSV exports.
 * Detects data type from column headers.
 */
export function parseQuickBooksCSV(data: Record<string, unknown>[], headers: string[]): ParsedAccountingData {
  const accounts: ParsedAccount[] = [];
  const customers: ParsedCustomer[] = [];
  const vendors: ParsedVendor[] = [];
  const products: ParsedProduct[] = [];
  const journalEntries: ParsedJournalEntry[] = [];
  const errors: string[] = [];

  const h = headers.map((col) => col.toLowerCase());

  // Detect data type from columns
  const isAccounts = h.some((col) => col.includes("account") && (col.includes("type") || col.includes("name"))) ||
    h.some((col) => col.includes("accnt"));
  const isCustomers = h.some((col) => col.includes("customer")) ||
    (h.includes("name") && h.some((col) => col.includes("balance") || col.includes("email")));
  const isVendors = h.some((col) => col.includes("vendor"));
  const isProducts = h.some((col) => col.includes("item") || col.includes("product") || col.includes("sku"));

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      if (isAccounts) {
        const name = getField(row, ["account", "account name", "name", "accnt"]);
        if (!name) continue;
        const type = getField(row, ["account type", "type", "accnttype"]);
        const balance = getNumericField(row, ["balance", "openbal", "open balance", "current balance"]);
        const code = getField(row, ["account number", "account no", "accnum", "code", "number"]) ??
          generateAccountCode(accounts.length, mapQBAccountType(type ?? "expense"));
        accounts.push({
          code,
          name,
          type: mapQBAccountType(type ?? "expense"),
          subType: type ?? undefined,
          balance: balance ?? 0,
        });
      } else if (isCustomers) {
        const name = getField(row, ["customer", "customer name", "name", "company"]);
        if (!name) continue;
        customers.push({
          name,
          email: getField(row, ["email", "e-mail", "main email"]) ?? undefined,
          phone: getField(row, ["phone", "main phone", "phone number", "work phone"]) ?? undefined,
          address: getField(row, ["address", "billing address", "street", "bill to"]) ?? undefined,
          notes: getField(row, ["notes", "memo", "note"]) ?? undefined,
        });
      } else if (isVendors) {
        const name = getField(row, ["vendor", "vendor name", "name", "company"]);
        if (!name) continue;
        vendors.push({
          name,
          email: getField(row, ["email", "e-mail", "main email"]) ?? undefined,
          phone: getField(row, ["phone", "main phone", "phone number"]) ?? undefined,
          address: getField(row, ["address", "street", "billing address"]) ?? undefined,
          notes: getField(row, ["notes", "memo", "note"]) ?? undefined,
        });
      } else if (isProducts) {
        const name = getField(row, ["item", "item name", "product", "product name", "name", "description"]);
        if (!name) continue;
        products.push({
          name,
          sku: getField(row, ["sku", "part number", "partnum", "item code", "code"]) ?? undefined,
          description: getField(row, ["description", "desc", "item description"]) ?? undefined,
          type: (getField(row, ["type", "item type"]) ?? "").toLowerCase().includes("service") ? "service" : "product",
          unitPrice: getNumericField(row, ["price", "rate", "unit price", "sales price", "cost"]) ?? 0,
          unit: getField(row, ["unit", "uom", "unit of measure"]) ?? undefined,
        });
      } else {
        // Try auto-detect per row
        const name = getField(row, ["name", "account", "customer", "vendor", "item"]);
        if (name) {
          const type = getField(row, ["type"]);
          if (type && ["asset", "liability", "equity", "revenue", "expense", "income", "bank"].some((t) => (type).toLowerCase().includes(t))) {
            accounts.push({
              code: generateAccountCode(accounts.length, mapQBAccountType(type)),
              name,
              type: mapQBAccountType(type),
              balance: getNumericField(row, ["balance"]) ?? 0,
            });
          } else {
            customers.push({ name });
          }
        }
      }
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "Parse error"}`);
    }
  }

  if (accounts.length === 0 && customers.length === 0 && vendors.length === 0 && products.length === 0) {
    errors.push("Could not identify data type from CSV columns. Expected columns like 'Account Name', 'Customer', 'Vendor', or 'Item'.");
  }

  return { accounts, customers, vendors, products, journalEntries, errors };
}

/**
 * Parse Peachtree/Sage 50 CSV exports.
 */
export function parsePeachtreeCSV(data: Record<string, unknown>[], headers: string[]): ParsedAccountingData {
  const accounts: ParsedAccount[] = [];
  const customers: ParsedCustomer[] = [];
  const vendors: ParsedVendor[] = [];
  const products: ParsedProduct[] = [];
  const journalEntries: ParsedJournalEntry[] = [];
  const errors: string[] = [];

  const h = headers.map((col) => col.toLowerCase());

  // Peachtree column naming conventions
  const isAccounts = h.some((col) => col.includes("gl account") || col.includes("account id") || col.includes("account description"));
  const isCustomers = h.some((col) => col.includes("customer id") || col.includes("customer name"));
  const isVendors = h.some((col) => col.includes("vendor id") || col.includes("vendor name"));
  const isProducts = h.some((col) => col.includes("item id") || col.includes("item description") || col.includes("stock item"));

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      if (isAccounts) {
        const code = getField(row, ["gl account", "account id", "account number", "gl account id"]) ?? "";
        const name = getField(row, ["account description", "description", "name", "account name"]);
        if (!name) continue;
        accounts.push({
          code: code || generateAccountCode(accounts.length, mapPeachtreeAccountType(code)),
          name,
          type: mapPeachtreeAccountType(code),
          balance: getNumericField(row, ["balance", "current balance", "ending balance"]) ?? 0,
        });
      } else if (isCustomers) {
        const name = getField(row, ["customer name", "name", "company", "customer id"]);
        if (!name) continue;
        customers.push({
          name,
          email: getField(row, ["e-mail", "email", "email address"]) ?? undefined,
          phone: getField(row, ["telephone 1", "phone", "telephone", "phone 1"]) ?? undefined,
          address: [
            getField(row, ["address line 1", "address-line 1", "bill to address-line 1"]),
            getField(row, ["city", "bill to city"]),
            getField(row, ["state", "bill to state"]),
          ].filter(Boolean).join(", ") || undefined,
          notes: getField(row, ["note", "notes", "customer note"]) ?? undefined,
        });
      } else if (isVendors) {
        const name = getField(row, ["vendor name", "name", "company", "vendor id"]);
        if (!name) continue;
        vendors.push({
          name,
          email: getField(row, ["e-mail", "email", "email address"]) ?? undefined,
          phone: getField(row, ["telephone 1", "phone", "telephone"]) ?? undefined,
          address: [
            getField(row, ["address line 1", "address-line 1"]),
            getField(row, ["city"]),
            getField(row, ["state"]),
          ].filter(Boolean).join(", ") || undefined,
          notes: getField(row, ["note", "notes"]) ?? undefined,
        });
      } else if (isProducts) {
        const name = getField(row, ["item description", "description", "item id", "stock item"]);
        if (!name) continue;
        products.push({
          name,
          sku: getField(row, ["item id", "item code", "stock number"]) ?? undefined,
          description: getField(row, ["description", "item description"]) ?? undefined,
          type: (getField(row, ["item class", "item type"]) ?? "").toLowerCase().includes("service") ? "service" : "product",
          unitPrice: getNumericField(row, ["sales price", "unit price", "price level 1", "last unit cost"]) ?? 0,
          unit: getField(row, ["stocking u/m", "unit", "u/m"]) ?? undefined,
        });
      }
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "Parse error"}`);
    }
  }

  if (accounts.length === 0 && customers.length === 0 && vendors.length === 0 && products.length === 0) {
    errors.push("Could not identify Peachtree/Sage 50 data format. Expected columns like 'GL Account', 'Customer ID', 'Vendor ID', or 'Item ID'.");
  }

  return { accounts, customers, vendors, products, journalEntries, errors };
}

/**
 * Parse Tally XML export format.
 * Tally exports masters as XML with specific node structures.
 */
export function parseTallyXML(content: string): ParsedAccountingData {
  const accounts: ParsedAccount[] = [];
  const customers: ParsedCustomer[] = [];
  const vendors: ParsedVendor[] = [];
  const products: ParsedProduct[] = [];
  const journalEntries: ParsedJournalEntry[] = [];
  const errors: string[] = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/xml");

    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      errors.push("Invalid XML file. Please check the file format.");
      return { accounts, customers, vendors, products, journalEntries, errors };
    }

    // Parse Ledger entries (Tally accounts)
    const ledgers = doc.querySelectorAll("LEDGER");
    for (const ledger of ledgers) {
      const name = getXmlText(ledger, "NAME") ?? getXmlText(ledger, "LEDGERNAME");
      if (!name) continue;

      const parent = getXmlText(ledger, "PARENT") ?? "";
      const group = getXmlText(ledger, "PARENT") ?? getXmlText(ledger, "GROUP") ?? "";
      const openingBalance = parseFloat(getXmlText(ledger, "OPENINGBALANCE") ?? "0") || 0;
      const email = getXmlText(ledger, "EMAIL") ?? getXmlText(ledger, "LEDGEREMAIL");
      const phone = getXmlText(ledger, "LEDGERPHONE") ?? getXmlText(ledger, "PHONENUMBER");
      const address = getXmlText(ledger, "ADDRESS");

      const type = mapTallyGroupType(group || parent);

      // Categorize based on parent group
      const isSundryDebtor = parent.toLowerCase().includes("debtor") || parent.toLowerCase().includes("receivable");
      const isSundryCreditor = parent.toLowerCase().includes("creditor") || parent.toLowerCase().includes("payable");

      if (isSundryDebtor) {
        customers.push({
          name,
          email: email ?? undefined,
          phone: phone ?? undefined,
          address: address ?? undefined,
        });
      } else if (isSundryCreditor) {
        vendors.push({
          name,
          email: email ?? undefined,
          phone: phone ?? undefined,
          address: address ?? undefined,
        });
      } else {
        accounts.push({
          code: generateAccountCode(accounts.length, type),
          name,
          type,
          subType: group || undefined,
          balance: Math.abs(openingBalance),
        });
      }
    }

    // Parse Stock Items (Tally inventory)
    const stockItems = doc.querySelectorAll("STOCKITEM");
    for (const item of stockItems) {
      const name = getXmlText(item, "NAME") ?? getXmlText(item, "STOCKITEMNAME");
      if (!name) continue;

      const unit = getXmlText(item, "BASEUNITS") ?? getXmlText(item, "UNIT");
      const rate = parseFloat(getXmlText(item, "OPENINGRATE") ?? getXmlText(item, "STANDARDCOST") ?? "0") || 0;
      const partNo = getXmlText(item, "PARTNUMBER") ?? getXmlText(item, "NARRATION");

      products.push({
        name,
        sku: partNo ?? undefined,
        description: getXmlText(item, "DESCRIPTION") ?? undefined,
        type: "product",
        unitPrice: rate,
        unit: unit ?? undefined,
      });
    }

    // Parse Stock Groups (if no items found, try groups)
    if (products.length === 0) {
      const stockGroups = doc.querySelectorAll("STOCKGROUP");
      for (const group of stockGroups) {
        const name = getXmlText(group, "NAME");
        if (name && name !== "Primary") {
          products.push({ name, type: "product", unitPrice: 0 });
        }
      }
    }

    // Parse Vouchers (journal entries) - basic extraction
    const vouchers = doc.querySelectorAll("VOUCHER");
    for (const voucher of vouchers) {
      const vType = getXmlText(voucher, "VOUCHERTYPENAME") ?? "";
      if (vType.toLowerCase().includes("journal") || vType.toLowerCase().includes("contra")) {
        const date = getXmlText(voucher, "DATE") ?? "";
        const narration = getXmlText(voucher, "NARRATION") ?? "Imported entry";
        journalEntries.push({
          date: formatTallyDate(date),
          description: narration,
          lines: [],
        });
      }
    }

  } catch (err) {
    errors.push(`XML parsing failed: ${err instanceof Error ? err.message : "Unknown error"}`);
  }

  if (accounts.length === 0 && customers.length === 0 && vendors.length === 0 && products.length === 0) {
    errors.push("No recognizable Tally data found. Expected XML with LEDGER, STOCKITEM, or VOUCHER elements.");
  }

  return { accounts, customers, vendors, products, journalEntries, errors };
}

// ─── Helper functions ──────────────────────────────────────────────

function getField(row: Record<string, unknown>, possibleKeys: string[]): string | null {
  for (const key of possibleKeys) {
    // Check exact match (keys are lowercased by papaparse)
    const val = row[key] ?? row[key.toLowerCase()];
    if (val !== null && val !== undefined && String(val).trim() !== "") {
      return String(val).trim();
    }
    // Check partial match
    for (const rowKey of Object.keys(row)) {
      if (rowKey.toLowerCase().includes(key.toLowerCase())) {
        const v = row[rowKey];
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          return String(v).trim();
        }
      }
    }
  }
  return null;
}

function getNumericField(row: Record<string, unknown>, possibleKeys: string[]): number | null {
  const val = getField(row, possibleKeys);
  if (!val) return null;
  const num = parseFloat(val.replace(/[,$]/g, ""));
  return isNaN(num) ? null : num;
}

function generateAccountCode(index: number, type: "asset" | "liability" | "equity" | "revenue" | "expense"): string {
  const prefixes: Record<string, number> = {
    asset: 1000,
    liability: 2000,
    equity: 3000,
    revenue: 4000,
    expense: 5000,
  };
  return String(prefixes[type] + index + 100);
}

function getXmlText(element: Element, tagName: string): string | null {
  // Try direct child first
  const child = element.querySelector(`:scope > ${tagName}`);
  if (child?.textContent) return child.textContent.trim();

  // Try case-insensitive search
  const children = element.children;
  for (let i = 0; i < children.length; i++) {
    if (children[i].tagName.toUpperCase() === tagName.toUpperCase()) {
      return children[i].textContent?.trim() ?? null;
    }
  }
  return null;
}

function formatTallyDate(tallyDate: string): string {
  // Tally dates are often YYYYMMDD format
  if (tallyDate.length === 8 && !tallyDate.includes("-")) {
    return `${tallyDate.slice(0, 4)}-${tallyDate.slice(4, 6)}-${tallyDate.slice(6, 8)}`;
  }
  return tallyDate || new Date().toISOString().split("T")[0];
}
