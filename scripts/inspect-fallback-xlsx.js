// One-off inspector for the fallback services workbook.
// Prints sheet names, column headers, and the first few rows of each sheet
// so we know the actual structure before writing the converter.

import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const WORKBOOK = path.join(
  ROOT,
  "Business_Type_Table_Master12_Repaired_Benefits_QualityPass.xlsx",
);

const wb = xlsx.readFile(WORKBOOK);

console.log("=== Workbook:", WORKBOOK);
console.log("=== Sheet names:", wb.SheetNames);
console.log("");

for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  console.log(`--- Sheet: "${name}" (${rows.length} data rows) ---`);
  if (rows.length === 0) {
    console.log("(empty)\n");
    continue;
  }
  const headers = Object.keys(rows[0]);
  console.log("Columns:", headers);
  console.log("First 3 rows:");
  for (const row of rows.slice(0, 3)) {
    console.log("  ", JSON.stringify(row));
  }
  console.log("");
}
