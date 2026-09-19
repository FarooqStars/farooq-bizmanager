import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import {
  Upload, AlertCircle, CheckCircle2, FileText, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { parseCSVFile } from "./csv-utils.ts";

type ImportTarget = "products" | "customers";

type Props = {
  target: ImportTarget;
  onComplete: () => void;
};

type ProductRow = {
  name: string;
  sku?: string;
  description?: string;
  type?: string;
  unitprice?: number;
  unit?: string;
  lowstockthreshold?: number;
};

type CustomerRow = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

const TEMPLATES: Record<ImportTarget, { columns: string[]; required: string[]; example: string }> = {
  products: {
    columns: ["name", "sku", "description", "type", "unitprice", "unit", "lowstockthreshold"],
    required: ["name", "unitprice"],
    example: "Name,SKU,Description,Type,UnitPrice,Unit,LowStockThreshold\nWidget A,WID-001,A sample widget,product,29.99,pcs,10",
  },
  customers: {
    columns: ["name", "email", "phone", "address", "notes"],
    required: ["name"],
    example: "Name,Email,Phone,Address,Notes\nJohn Smith,[email protected],+1 555 0100,123 Main St,VIP customer",
  },
};

export default function ImportPanel({ target, onComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const createProduct = useMutation(api.products.createProduct);
  const createCustomer = useMutation(api.sales.createCustomer);

  const template = TEMPLATES[target];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("File must be under 5MB");
      return;
    }

    setFile(f);
    setResult(null);
    setErrors([]);

    const { data, errors: parseErrors } = await parseCSVFile<Record<string, unknown>>(f, {
      requiredColumns: template.required,
    });

    if (parseErrors.length > 0) {
      setErrors(parseErrors);
      setPreview([]);
      return;
    }

    // Validate rows
    const rowErrors: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      for (const req of template.required) {
        if (!row[req] || String(row[req]).trim() === "") {
          rowErrors.push(`Row ${i + 2}: Missing required field "${req}"`);
        }
      }
      if (target === "products") {
        const price = (row as ProductRow).unitprice;
        if (price !== undefined && price !== null && (typeof price !== "number" || price < 0)) {
          rowErrors.push(`Row ${i + 2}: Invalid unit price`);
        }
      }
    }

    if (rowErrors.length > 0) {
      setErrors(rowErrors.slice(0, 20));
      if (rowErrors.length > 20) {
        setErrors((prev) => [...prev, `...and ${rowErrors.length - 20} more errors`]);
      }
    }

    setPreview(data.slice(0, 5));
  };

  const handleImport = async () => {
    if (!file || errors.length > 0) return;

    setImporting(true);
    const { data } = await parseCSVFile<Record<string, unknown>>(file, {
      requiredColumns: template.required,
    });

    let imported = 0;
    let skipped = 0;

    try {
      for (const row of data) {
        try {
          if (target === "products") {
            const r = row as ProductRow;
            await createProduct({
              name: String(r.name),
              sku: r.sku ? String(r.sku) : undefined,
              description: r.description ? String(r.description) : undefined,
              type: r.type === "service" ? "service" : "product",
              unitPrice: Number(r.unitprice) || 0,
              unit: r.unit ? String(r.unit) : undefined,
              lowStockThreshold: r.lowstockthreshold ? Number(r.lowstockthreshold) : undefined,
            });
          } else {
            const r = row as CustomerRow;
            await createCustomer({
              name: String(r.name),
              email: r.email ? String(r.email) : undefined,
              phone: r.phone ? String(r.phone) : undefined,
              address: r.address ? String(r.address) : undefined,
              notes: r.notes ? String(r.notes) : undefined,
            });
          }
          imported++;
        } catch {
          skipped++;
        }
      }
      setResult({ imported, skipped });
      toast.success(`Imported ${imported} ${target}`);
      onComplete();
    } catch (err) {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([template.example], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${target}-template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Import {target === "products" ? "Products" : "Customers"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template info */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Required columns: <span className="font-medium">{template.required.join(", ")}</span></p>
          <p>Optional columns: {template.columns.filter((c) => !template.required.includes(c)).join(", ")}</p>
          <Button variant="ghost" size="sm" onClick={downloadTemplate} className="cursor-pointer px-0 text-primary">
            <FileText className="w-3.5 h-3.5 mr-1" />Download template CSV
          </Button>
        </div>

        {/* File input */}
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => inputRef.current?.click()} className="cursor-pointer">
            <Upload className="w-4 h-4 mr-2" />Choose File
          </Button>
          <span className="text-sm text-muted-foreground">{file?.name ?? "No file selected"}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />Validation Errors ({errors.length})
            </p>
            <ul className="text-xs text-destructive space-y-0.5 max-h-32 overflow-y-auto">
              {errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

        {/* Preview */}
        {preview.length > 0 && errors.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Preview (first 5 rows):</p>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    {Object.keys(preview[0]).map((key) => (
                      <th key={key} className="px-2 py-1.5 text-left font-medium">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-2 py-1.5 truncate max-w-[150px]">{String(val ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={handleImport} disabled={importing} className="cursor-pointer">
              {importing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
              ) : (
                `Import ${target === "products" ? "Products" : "Customers"}`
              )}
            </Button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Imported {result.imported} {target}
              {result.skipped > 0 && <Badge variant="secondary" className="ml-2">{result.skipped} skipped</Badge>}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
