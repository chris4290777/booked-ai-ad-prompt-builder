// ─── AI Benefit Repair Script ─────────────────────────────────────────────
// One-time pass that detects duplicate canonical benefit triples within
// each business type in the "Offer Benefits" sheet of the master workbook,
// then calls Gemini to generate offer-specific replacements.
//
// HARD CONSTRAINTS (do not change):
// - Source workbook is read-only. Output goes to a SEPARATE *_AIRepaired.xlsx.
// - Two sheets ("Business Types", "Offer Benefits") preserved in order.
// - Business types stay in the exact same order in both sheets.
// - Row count, column order, and all non-benefit cell values are unchanged.
// - Only Benefit#1, Benefit#2, Benefit#3 cell values are updated, AND ONLY
//   for offers that belong to a duplicate-benefit collision group in their
//   business type. Already-unique rows are not touched.
//
// Resumability:
// - Progress is saved to .ai-repair-progress.json after each business type.
// - Partial output xlsx is also rewritten after each business type so the
//   user can interrupt anytime and inspect/use what's done.
// - Re-running the script picks up where it left off.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(
  ROOT,
  "Business_Type_Table_Master12_Repaired_Benefits_QualityPass.xlsx",
);
const OUTPUT = path.join(
  ROOT,
  "Business_Type_Table_Master12_Repaired_Benefits_QualityPass_AIRepaired.xlsx",
);
const CHECKPOINT = path.join(ROOT, ".ai-repair-progress.json");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

function isFallbackEligibleError(err) {
  if (!err) return false;
  const status = err.status ?? err?.error?.status;
  const code = err.code ?? err?.error?.code;
  const msg = (err.message || JSON.stringify(err) || "").toLowerCase();
  if (status === "UNAVAILABLE" || code === 503) return true;
  if (status === "NOT_FOUND" || code === 404) return true;
  if (status === "RESOURCE_EXHAUSTED" || code === 429) return true;
  return (
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("high demand") ||
    msg.includes("404") ||
    msg.includes("not_found") ||
    msg.includes("not found") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota")
  );
}

const benefitsSchema = {
  type: "object",
  properties: {
    offers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          offer: { type: "string" },
          benefits: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["offer", "benefits"],
      },
    },
  },
  required: ["offers"],
};

async function generateWithFallback(contents) {
  let lastErr;
  for (const model of MODEL_CHAIN) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: benefitsSchema,
          temperature: 0,
        },
      });
      return res;
    } catch (err) {
      lastErr = err;
      if (!isFallbackEligibleError(err)) throw err;
    }
  }
  throw lastErr;
}

// Sleep helper.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Load workbook + extract Offer Benefits rows (preserving order).
const wb = xlsx.readFile(SOURCE);
const obSheet = wb.Sheets["Offer Benefits"];
if (!obSheet) throw new Error('Source workbook has no "Offer Benefits" sheet.');

const obRows = xlsx.utils.sheet_to_json(obSheet, { defval: "", raw: false });
const HEADERS = ["Category", "Business Type", "Offers", "Benefit#1", "Benefit#2", "Benefit#3"];

// Group rows by business type while keeping each row's original index so we
// can write the AI output back into the exact same row positions.
const byBusinessType = new Map();
for (let i = 0; i < obRows.length; i++) {
  const row = obRows[i];
  const key = `${row["Category"]}::${row["Business Type"]}`;
  if (!byBusinessType.has(key)) byBusinessType.set(key, []);
  byBusinessType.get(key).push({ rowIndex: i, row });
}

// Identify business types that contain ANY duplicate benefit triple.
// (We only repair rows that belong to a collision group — leave already-
// unique offers untouched per the constraint.)
const affectedBusinessTypes = [];
for (const [btKey, items] of byBusinessType) {
  const sigCount = new Map();
  for (const { row } of items) {
    const sig = JSON.stringify([
      row["Benefit#1"] ?? "",
      row["Benefit#2"] ?? "",
      row["Benefit#3"] ?? "",
    ]);
    sigCount.set(sig, (sigCount.get(sig) || 0) + 1);
  }
  const duplicateSigs = new Set(
    [...sigCount.entries()].filter(([, c]) => c > 1).map(([sig]) => sig),
  );
  if (duplicateSigs.size === 0) continue;

  const rowsToRepair = items.filter(({ row }) =>
    duplicateSigs.has(
      JSON.stringify([
        row["Benefit#1"] ?? "",
        row["Benefit#2"] ?? "",
        row["Benefit#3"] ?? "",
      ]),
    ),
  );
  affectedBusinessTypes.push({ btKey, allItems: items, rowsToRepair });
}

console.log(
  `Detected ${affectedBusinessTypes.length} business types with duplicate benefit collisions.`,
);
console.log(`Source: ${SOURCE}`);
console.log(`Output: ${OUTPUT}`);
console.log(`Checkpoint: ${CHECKPOINT}`);
console.log("");

// Load checkpoint state (resume support).
const checkpoint = fs.existsSync(CHECKPOINT)
  ? JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"))
  : { completedBTs: [] };
const completed = new Set(checkpoint.completedBTs);

function saveCheckpoint() {
  checkpoint.completedBTs = [...completed];
  fs.writeFileSync(CHECKPOINT, JSON.stringify(checkpoint, null, 2));
}

function writePartialOutput() {
  // Rebuild "Offer Benefits" sheet from the (partially) updated obRows array.
  // Column order locked to HEADERS so layout stays identical.
  const newSheet = xlsx.utils.json_to_sheet(obRows, { header: HEADERS });
  wb.Sheets["Offer Benefits"] = newSheet;
  xlsx.writeFile(wb, OUTPUT);
}

function normalize(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function repairBusinessType({ btKey, allItems, rowsToRepair }) {
  const [category, businessType] = btKey.split("::");
  const dupOffers = rowsToRepair.map(({ row }) => row["Offers"]);
  const otherOffers = allItems
    .filter((it) => !rowsToRepair.includes(it))
    .map(({ row }) => row["Offers"]);

  const instruction = `You write short, specific ad-style benefit statements for a local business.

Business: ${businessType} (${category})

For EACH offer below, return EXACTLY 3 short benefit statements. Hard rules:
- Each benefit must be specific to THIS offer (not generic to the business overall).
- 3-5 words each. Title Case. No trailing punctuation.
- No filler words: "professional", "expert", "service", "quality", "trust", "support".
- No marketing slogans, calls to action, location phrases, or guarantees.
- Mention the offer's specific noun in the benefit when natural so each set reads distinctly.
- Across all offers in this batch, the 3-benefit set MUST be unique per offer — do not repeat the same phrase between offers.

Offers to write benefits for:
${dupOffers.map((o, i) => `${i + 1}. ${o}`).join("\n")}
${
  otherOffers.length > 0
    ? `\nNote: this business also offers ${otherOffers.join(", ")} — keep your output focused only on the numbered list above.`
    : ""
}

Return ONE entry per offer in the same order.`;

  const res = await generateWithFallback(instruction);
  const raw = res.text ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("LLM returned non-JSON output");
  }

  // Build a normalized-key map of offer → benefits from the LLM response.
  const byOffer = new Map();
  if (Array.isArray(parsed.offers)) {
    for (const e of parsed.offers) {
      if (e && typeof e.offer === "string" && Array.isArray(e.benefits)) {
        byOffer.set(normalize(e.offer), e.benefits.map((b) => String(b).trim()));
      }
    }
  }

  // Apply each LLM result back into the obRows array at the SAME row index.
  // If the LLM didn't return a usable triple for a row, leave the existing
  // (duplicate) values untouched — better than nuking with empty strings.
  let appliedCount = 0;
  for (let i = 0; i < rowsToRepair.length; i++) {
    const { rowIndex, row } = rowsToRepair[i];
    const offerText = row["Offers"];
    const fromName = byOffer.get(normalize(offerText));
    // Try positional fallback if name lookup missed (LLM may have shifted casing).
    const positional =
      Array.isArray(parsed.offers) && parsed.offers[i]
        ? parsed.offers[i].benefits
        : null;
    const benefits = (fromName && fromName.length >= 3 ? fromName : positional)
      ?.filter((b) => b && b.length > 0)
      .slice(0, 3);
    if (!benefits || benefits.length < 3) continue;
    obRows[rowIndex]["Benefit#1"] = benefits[0];
    obRows[rowIndex]["Benefit#2"] = benefits[1];
    obRows[rowIndex]["Benefit#3"] = benefits[2];
    appliedCount++;
  }
  return appliedCount;
}

// ─── Main loop ─────────────────────────────────────────────────────────────
let processed = 0;
let totalApplied = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30_000;
const BETWEEN_CALLS_MS = 1_200;

for (const target of affectedBusinessTypes) {
  processed++;
  if (completed.has(target.btKey)) {
    console.log(`[${processed}/${affectedBusinessTypes.length}] ✓ skip (already done): ${target.btKey}`);
    continue;
  }

  let attempt = 0;
  let success = false;
  while (attempt < MAX_RETRIES && !success) {
    attempt++;
    try {
      const applied = await repairBusinessType(target);
      totalApplied += applied;
      completed.add(target.btKey);
      saveCheckpoint();
      writePartialOutput();
      console.log(
        `[${processed}/${affectedBusinessTypes.length}] ✓ ${target.btKey} (${applied}/${target.rowsToRepair.length} rows updated)`,
      );
      success = true;
      await sleep(BETWEEN_CALLS_MS);
    } catch (err) {
      const msg = err?.message || String(err);
      if (isFallbackEligibleError(err)) {
        console.warn(
          `[${processed}/${affectedBusinessTypes.length}] ⏸  quota/unavailable on ${target.btKey} (attempt ${attempt}/${MAX_RETRIES}): pausing ${RETRY_DELAY_MS / 1000}s`,
        );
        await sleep(RETRY_DELAY_MS);
      } else {
        console.error(
          `[${processed}/${affectedBusinessTypes.length}] ✗ ${target.btKey} hard error: ${msg.slice(0, 200)}`,
        );
        break;
      }
    }
  }
}

console.log("");
console.log(`Done. Total rows updated: ${totalApplied}`);
console.log(`Output written to: ${OUTPUT}`);
console.log(`Checkpoint: ${CHECKPOINT} (delete to re-run from scratch)`);
