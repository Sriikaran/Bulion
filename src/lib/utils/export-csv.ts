/**
 * CSV Export Utility for Bullion Reports (RFC 4180 compliant)
 *
 * Ensures clean CSV string formatting with proper quote escaping.
 * Never includes database secrets, password hashes, or session tokens.
 */

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

/**
 * Format a value for safe CSV inclusion:
 * - Sanitizes CSV formula injection (=, @, +, -, \t, \r)
 * - Wrap with double quotes if contains commas, double quotes, or newlines
 * - Escape internal double quotes by doubling them
 */
export function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);

  // CSV Formula Injection Defense (OWASP):
  // Check if first character is a formula trigger: =, @, +, -, \t, \r
  const dangerousChars = ["=", "@", "+", "-", "\t", "\r"];
  if (dangerousChars.includes(str.charAt(0))) {
    // If it is a purely valid numeric quantity (e.g. "-10.5000" or "+5.00"), it's safe.
    // Otherwise, neutralize execution by prefixing a single quote (').
    const isPureNumber = /^[+-]?\d+(\.\d+)?$/.test(str.trim());
    if (!isPureNumber) {
      str = `'${str}`;
    }
  }

  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of objects into an RFC 4180-compliant CSV string.
 */
export function generateCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  const headerRow = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const dataRows = data.map((row) =>
    columns.map((c) => escapeCsvValue(c.accessor(row))).join(","),
  );
  return [headerRow, ...dataRows].join("\r\n");
}

/**
 * Triggers a browser download of a generated CSV string.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  if (typeof window === "undefined") return;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
