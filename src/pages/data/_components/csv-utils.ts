import Papa from "papaparse";

/**
 * Download data as a CSV file. Handles BOM for Excel compatibility
 * and proper escaping of special characters.
 */
export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(data, { quotes: true, header: true });
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse a CSV file and return rows as typed objects.
 * Returns { data, errors } where errors contain row-level issues.
 */
export function parseCSVFile<T>(
  file: File,
  options?: {
    requiredColumns?: string[];
    transformHeader?: (header: string) => string;
  }
): Promise<{ data: T[]; errors: string[]; headers: string[] }> {
  return new Promise((resolve) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transformHeader: options?.transformHeader ?? ((h) => h.trim().toLowerCase()),
      complete: (results) => {
        const errors: string[] = [];

        // Check parse errors
        if (results.errors.length > 0) {
          for (const err of results.errors) {
            errors.push(`Row ${(err.row ?? 0) + 2}: ${err.message}`);
          }
        }

        // Check required columns
        const headers = results.meta.fields ?? [];
        if (options?.requiredColumns) {
          const missing = options.requiredColumns.filter((col) => !headers.includes(col));
          if (missing.length > 0) {
            errors.unshift(`Missing required columns: ${missing.join(", ")}`);
          }
        }

        resolve({ data: results.data, errors, headers });
      },
      error: (error) => {
        resolve({ data: [], errors: [error.message], headers: [] });
      },
    });
  });
}
