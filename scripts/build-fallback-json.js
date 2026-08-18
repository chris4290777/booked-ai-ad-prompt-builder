// Converts Business_Type_Table_Master12_Repaired_Benefits_QualityPass.xlsx
// into a static fallback-services.json that the server reads at boot.
//
// Output shape:
// {
//   businessTypes: [
//     {
//       category, businessType, aliases[], offers[], badOfferWords[], ctas[]
//     }, ...
//   ],
//   offerBenefits: {
//     "Category::Business Type::Offer": ["Benefit#1", "Benefit#2", "Benefit#3"],
//     ...
//   }
// }

import fs from "node:fs";
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
const OUT = path.join(ROOT, "fallback-services.json");

function splitList(value) {
  if (value == null) return [];
  return String(value)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function key(category, businessType, offer) {
  return `${(category ?? "").trim()}::${(businessType ?? "").trim()}::${(offer ?? "").trim()}`;
}

const wb = xlsx.readFile(WORKBOOK);

const btSheet = wb.Sheets["Business Types"];
const obSheet = wb.Sheets["Offer Benefits"];
if (!btSheet || !obSheet) {
  throw new Error('Workbook is missing required sheets ("Business Types" / "Offer Benefits").');
}

const btRows = xlsx.utils.sheet_to_json(btSheet, { defval: "", raw: false });
const obRows = xlsx.utils.sheet_to_json(obSheet, { defval: "", raw: false });

const businessTypes = btRows
  .map((row) => ({
    category: String(row["Category"] ?? "").trim(),
    businessType: String(row["Business Type"] ?? "").trim(),
    aliases: splitList(row["Common Aliases"]),
    offers: splitList(row["Offers"]),
    badOfferWords: splitList(row["Bad Offer Words"]).map((s) => s.toLowerCase()),
    ctas: splitList(row["Primary CTA Options"]),
  }))
  .filter((e) => e.businessType.length > 0);

const offerBenefits = {};
for (const row of obRows) {
  const k = key(row["Category"], row["Business Type"], row["Offers"]);
  const benefits = [row["Benefit#1"], row["Benefit#2"], row["Benefit#3"], row["Benefit#4"], row["Benefit#5"], row["Benefit#6"]]
    .map((b) => String(b ?? "").trim())
    .filter(Boolean);
  if (benefits.length > 0) offerBenefits[k] = benefits;
}

const payload = { businessTypes, offerBenefits };
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");

console.log(`Wrote ${OUT}`);
console.log(`  businessTypes: ${businessTypes.length}`);
console.log(`  offerBenefits keys: ${Object.keys(offerBenefits).length}`);
