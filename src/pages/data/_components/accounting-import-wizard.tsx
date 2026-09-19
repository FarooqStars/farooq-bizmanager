import { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import {
  Upload, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle,
  Loader2, FileText, HelpCircle, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { parseCSVFile } from "./csv-utils.ts";
import {
  parseQuickBooksIIF,
  parseQuickBooksCSV,
  parsePeachtreeCSV,
  parseTallyXML,
  type ParsedAccountingData,
  type ImportSource,
  type FileFormat,
  SOURCE_FORMATS,
  SOURCE_LABELS,
  FORMAT_LABELS,
  EXPORT_INSTRUCTIONS,
} from "./accounting-parsers.ts";

type Step = "source" | "upload" | "preview" | "importing" | "complete";

export default function AccountingImportWizard() {
  const [step, setStep] = useState<Step>("source");
  const [source, setSource] = useState<ImportSource>("quickbooks");
  const [format, setFormat] = useState<FileFormat>("iif");
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedAccountingData | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{
    accounts: number;
    customers: number;
    vendors: number;
    products: number;
    journalEntries: number;
    errors: number;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const createAccount = useMutation(api.accounting.createAccount);
  const createCustomer = useMutation(api.sales.createCustomer);
  const createVendor = useMutation(api.vendors.createVendor);
  const createProduct = useMutation(api.products.createProduct);

  const handleSourceChange = (val: ImportSource) => {
    setSource(val);
    const formats = SOURCE_FORMATS[val];
    setFormat(formats[0]);
  };

  const getAcceptedExtensions = (): string => {
    switch (format) {
      case "iif": return ".iif,.IIF";
      case "csv": return ".csv,.CSV";
      case "xml": return ".xml,.XML";
      default: return ".csv,.iif,.xml";
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.size > 50 * 1024 * 1024) {
      toast.error("File must be under 50MB");
      return;
    }

    setFile(f);
    setParseErrors([]);
    setParsedData(null);

    try {
      let data: ParsedAccountingData;

      if (source === "quickbooks" && format === "iif") {
        const text = await f.text();
        data = parseQuickBooksIIF(text);
      } else if (source === "quickbooks" && format === "csv") {
        const result = await parseCSVFile<Record<string, unknown>>(f, {});
        data = parseQuickBooksCSV(result.data, result.headers);
      } else if (source === "peachtree" && format === "csv") {
        const result = await parseCSVFile<Record<string, unknown>>(f, {});
        data = parsePeachtreeCSV(result.data, result.headers);
      } else if (source === "tally" && format === "xml") {
        const text = await f.text();
        data = parseTallyXML(text);
      } else {
        // Generic CSV fallback
        const result = await parseCSVFile<Record<string, unknown>>(f, {});
        data = parseQuickBooksCSV(result.data, result.headers);
      }

      if (data.errors.length > 0 && data.accounts.length === 0 && data.customers.length === 0 && data.vendors.length === 0 && data.products.length === 0) {
        setParseErrors(data.errors);
        return;
      }

      setParsedData(data);
      if (data.errors.length > 0) {
        setParseErrors(data.errors.slice(0, 10));
      }
      setStep("preview");
    } catch (err) {
      setParseErrors([`Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`]);
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;
    setStep("importing");
    setImporting(true);

    let accountsImported = 0;
    let customersImported = 0;
    let vendorsImported = 0;
    let productsImported = 0;
    let journalEntriesCount = 0;
    let errorCount = 0;

    // Import accounts
    for (const acc of parsedData.accounts) {
      try {
        await createAccount({
          code: acc.code,
          name: acc.name,
          type: acc.type,
          subType: acc.subType,
          description: acc.description,
          openingBalance: acc.balance ?? 0,
        });
        accountsImported++;
      } catch {
        errorCount++;
      }
    }

    // Import customers
    for (const cust of parsedData.customers) {
      try {
        await createCustomer({
          name: cust.name,
          email: cust.email,
          phone: cust.phone,
          address: cust.address,
          notes: cust.notes,
        });
        customersImported++;
      } catch {
        errorCount++;
      }
    }

    // Import vendors
    for (const vend of parsedData.vendors) {
      try {
        await createVendor({
          name: vend.name,
          email: vend.email,
          phone: vend.phone,
          address: vend.address,
          notes: vend.notes,
        });
        vendorsImported++;
      } catch {
        errorCount++;
      }
    }

    // Import products
    for (const prod of parsedData.products) {
      try {
        await createProduct({
          name: prod.name,
          sku: prod.sku,
          description: prod.description,
          type: prod.type === "service" ? "service" : "product",
          unitPrice: prod.unitPrice ?? 0,
          unit: prod.unit,
        });
        productsImported++;
      } catch {
        errorCount++;
      }
    }

    journalEntriesCount = parsedData.journalEntries.length;

    setImportResult({
      accounts: accountsImported,
      customers: customersImported,
      vendors: vendorsImported,
      products: productsImported,
      journalEntries: journalEntriesCount,
      errors: errorCount,
    });
    setImporting(false);
    setStep("complete");
    toast.success("Import completed!");
  };

  const reset = () => {
    setStep("source");
    setFile(null);
    setParsedData(null);
    setParseErrors([]);
    setImportResult(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Import from Accounting Software
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Import your data from QuickBooks, Peachtree/Sage 50, or Tally
        </p>
      </CardHeader>
      <CardContent>
        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-6">
          {(["source", "upload", "preview", "complete"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                step === s || (step === "importing" && s === "preview")
                  ? "bg-primary text-primary-foreground"
                  : ["source", "upload", "preview", "complete"].indexOf(step === "importing" ? "preview" : step) > i
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
              }`}>
                {["source", "upload", "preview", "complete"].indexOf(step === "importing" ? "preview" : step) > i
                  ? <CheckCircle2 className="w-4 h-4" />
                  : i + 1}
              </div>
              {i < 3 && <div className="w-8 h-0.5 bg-muted" />}
            </div>
          ))}
          <span className="text-xs text-muted-foreground ml-2">
            {step === "source" && "Select Source"}
            {step === "upload" && "Upload File"}
            {step === "preview" && "Preview & Confirm"}
            {step === "importing" && "Importing..."}
            {step === "complete" && "Complete"}
          </span>
        </div>

        {/* Step 1: Select Source */}
        {step === "source" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(Object.keys(SOURCE_LABELS) as ImportSource[]).map((src) => (
                <button
                  key={src}
                  onClick={() => handleSourceChange(src)}
                  className={`cursor-pointer p-4 rounded-lg border-2 text-left transition-all ${
                    source === src
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium">{SOURCE_LABELS[src]}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {src === "quickbooks" && "IIF, CSV exports & backup files"}
                    {src === "peachtree" && "CSV exports & backup data"}
                    {src === "tally" && "XML exports & data files"}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">File Format</label>
                <Select value={format} onValueChange={(v) => setFormat(v as FileFormat)}>
                  <SelectTrigger className="w-48 cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_FORMATS[source].map((f) => (
                      <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <Button onClick={() => setStep("upload")} className="cursor-pointer">
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <Button variant="ghost" className="cursor-pointer" onClick={() => setShowInstructions(!showInstructions)}>
                <HelpCircle className="w-4 h-4 mr-1" /> How to export from {SOURCE_LABELS[source]}
              </Button>
            </div>

            {showInstructions && (
              <div className="border rounded-lg p-4 bg-muted/50 text-sm space-y-2 mt-3">
                <p className="font-medium">Export Instructions for {SOURCE_LABELS[source]}:</p>
                {EXPORT_INSTRUCTIONS[source].map((inst, i) => (
                  <p key={i} className="flex gap-2">
                    <span className="font-medium text-primary">{i + 1}.</span> {inst}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Upload File */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium mb-1">
                Upload your {SOURCE_LABELS[source]} {FORMAT_LABELS[format]} file
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Max file size: 50MB. Accepts {getAcceptedExtensions()} files
              </p>
              <Button onClick={() => inputRef.current?.click()} className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" /> Choose File
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept={getAcceptedExtensions()}
                onChange={handleFileSelect}
                className="hidden"
              />
              {file && (
                <p className="mt-3 text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <FileText className="w-4 h-4" /> {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {parseErrors.length > 0 && (
              <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Parse Errors
                </p>
                <ul className="text-xs text-destructive space-y-0.5 max-h-40 overflow-y-auto">
                  {parseErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Please check your file format and try again. Make sure you selected the correct source application.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep("source")} className="cursor-pointer">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && parsedData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard label="Accounts" count={parsedData.accounts.length} />
              <SummaryCard label="Customers" count={parsedData.customers.length} />
              <SummaryCard label="Vendors" count={parsedData.vendors.length} />
              <SummaryCard label="Products" count={parsedData.products.length} />
              <SummaryCard label="Journal Entries" count={parsedData.journalEntries.length} />
            </div>

            {parseErrors.length > 0 && (
              <div className="border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> {parseErrors.length} warnings (non-critical)
                </p>
                <ul className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                  {parseErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {/* Preview tabs */}
            <Tabs defaultValue="accounts">
              <TabsList>
                {parsedData.accounts.length > 0 && <TabsTrigger value="accounts" className="cursor-pointer">Accounts</TabsTrigger>}
                {parsedData.customers.length > 0 && <TabsTrigger value="customers" className="cursor-pointer">Customers</TabsTrigger>}
                {parsedData.vendors.length > 0 && <TabsTrigger value="vendors" className="cursor-pointer">Vendors</TabsTrigger>}
                {parsedData.products.length > 0 && <TabsTrigger value="products" className="cursor-pointer">Products</TabsTrigger>}
              </TabsList>
              {parsedData.accounts.length > 0 && (
                <TabsContent value="accounts">
                  <PreviewTable
                    headers={["Code", "Name", "Type", "Balance"]}
                    rows={parsedData.accounts.slice(0, 10).map((a) => [a.code, a.name, a.type, `$${(a.balance ?? 0).toFixed(2)}`])}
                    total={parsedData.accounts.length}
                  />
                </TabsContent>
              )}
              {parsedData.customers.length > 0 && (
                <TabsContent value="customers">
                  <PreviewTable
                    headers={["Name", "Email", "Phone", "Address"]}
                    rows={parsedData.customers.slice(0, 10).map((c) => [c.name, c.email ?? "-", c.phone ?? "-", c.address ?? "-"])}
                    total={parsedData.customers.length}
                  />
                </TabsContent>
              )}
              {parsedData.vendors.length > 0 && (
                <TabsContent value="vendors">
                  <PreviewTable
                    headers={["Name", "Email", "Phone", "Address"]}
                    rows={parsedData.vendors.slice(0, 10).map((v) => [v.name, v.email ?? "-", v.phone ?? "-", v.address ?? "-"])}
                    total={parsedData.vendors.length}
                  />
                </TabsContent>
              )}
              {parsedData.products.length > 0 && (
                <TabsContent value="products">
                  <PreviewTable
                    headers={["Name", "SKU", "Type", "Unit Price"]}
                    rows={parsedData.products.slice(0, 10).map((p) => [p.name, p.sku ?? "-", p.type ?? "product", `$${(p.unitPrice ?? 0).toFixed(2)}`])}
                    total={parsedData.products.length}
                  />
                </TabsContent>
              )}
            </Tabs>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep("upload")} className="cursor-pointer">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={handleImport} className="cursor-pointer">
                Import All Data <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === "importing" && (
          <div className="text-center py-8 space-y-4">
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
            <p className="font-medium">Importing your data...</p>
            <p className="text-sm text-muted-foreground">This may take a moment for large datasets</p>
          </div>
        )}

        {/* Step 5: Complete */}
        {step === "complete" && importResult && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
              <p className="text-lg font-medium">Import Complete!</p>
              <p className="text-sm text-muted-foreground">
                Your {SOURCE_LABELS[source]} data has been imported successfully
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {importResult.accounts > 0 && (
                <ResultCard label="Accounts" count={importResult.accounts} />
              )}
              {importResult.customers > 0 && (
                <ResultCard label="Customers" count={importResult.customers} />
              )}
              {importResult.vendors > 0 && (
                <ResultCard label="Vendors" count={importResult.vendors} />
              )}
              {importResult.products > 0 && (
                <ResultCard label="Products" count={importResult.products} />
              )}
              {importResult.journalEntries > 0 && (
                <ResultCard label="Journal Entries (noted)" count={importResult.journalEntries} />
              )}
              {importResult.errors > 0 && (
                <div className="border border-yellow-300 dark:border-yellow-700 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-yellow-600">{importResult.errors}</p>
                  <p className="text-xs text-muted-foreground">Skipped (duplicates/errors)</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-center pt-2">
              <Button onClick={reset} className="cursor-pointer">
                Import Another File
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="border rounded-lg p-3 text-center">
      <p className="text-lg font-bold">{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ResultCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
      <p className="text-lg font-bold text-green-600 dark:text-green-400">{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function PreviewTable({ headers, rows, total }: { headers: string[]; rows: string[][]; total: number }) {
  return (
    <div className="space-y-2 mt-3">
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5 truncate max-w-[180px]">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 10 && (
        <p className="text-xs text-muted-foreground">Showing 10 of {total} records</p>
      )}
    </div>
  );
}
