import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import FirecrawlApp from "@mendable/firecrawl-js";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 5001;
const HOST = process.env.HOST || "127.0.0.1";

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── Fallback services database (built from XLSX → JSON) ──────────────────
const FALLBACK_PATH = path.join(__dirname, "fallback-services.json");
const FALLBACK = JSON.parse(fs.readFileSync(FALLBACK_PATH, "utf8"));
console.log(
  `Loaded fallback database: ${FALLBACK.businessTypes.length} business types, ${
    Object.keys(FALLBACK.offerBenefits).length
  } pre-baked offer-benefit rows.`,
);

const STOPWORDS = new Set([
  "and", "or", "the", "a", "an", "of", "for", "to", "in", "on", "at", "&",
  "co", "company", "service", "services", "shop", "store", "biz", "business",
  "local", "your",
]);

// Light English stemmer — collapses photographer/photography → photograph,
// caterer/catering → cater, etc.  Critical for businessType matching.
function stem(word) {
  if (word.length <= 4) return word;
  // Specific -graphy collapse so photography ↔ photographer share a root.
  if (word.endsWith("graphy")) return word.slice(0, -1); // photography → photograph
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ied")) return word.slice(0, -3) + "y";
  if (word.endsWith("ying")) return word.slice(0, -4) + "y";
  if (word.endsWith("ing")) return word.slice(0, -3);
  if (word.endsWith("ers")) return word.slice(0, -3);
  if (word.endsWith("er")) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function tokenize(input) {
  return String(input ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w) && w.length > 1)
    .map(stem);
}

// Token-frequency table built once at boot. Tokens that appear in many
// distinct business-type entries are "generic context" words (event,
// wedding, mobile, ...). A single-token overlap on a generic token must
// NOT win the match — that's exactly how catering bled into photography.
const TOKEN_DOC_FREQ = (() => {
  const freq = new Map();
  for (const entry of FALLBACK.businessTypes) {
    const seen = new Set();
    for (const cand of [entry.businessType, ...entry.aliases]) {
      for (const t of tokenize(cand)) {
        if (seen.has(t)) continue;
        seen.add(t);
        freq.set(t, (freq.get(t) || 0) + 1);
      }
    }
  }
  return freq;
})();
const GENERIC_TOKEN_THRESHOLD = 8; // appears in 8+ business types → generic

function isGenericToken(t) {
  return (TOKEN_DOC_FREQ.get(t) ?? 0) >= GENERIC_TOKEN_THRESHOLD;
}

function scoreEntry(query, entry) {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return 0;

  const qLower = String(query).trim().toLowerCase();
  const candidates = [entry.businessType, ...entry.aliases];

  let best = 0;
  for (const candidate of candidates) {
    const cLower = String(candidate).trim().toLowerCase();
    if (qLower === cLower) return 200; // exact match wins outright

    const cTokens = new Set(tokenize(candidate));
    if (cTokens.size === 0) continue;

    let overlap = 0;
    const shared = [];
    for (const t of qTokens) {
      if (cTokens.has(t)) {
        overlap++;
        shared.push(t);
      }
    }
    if (overlap === 0) continue;

    // Reject single-token overlap that only matches via a generic context
    // word (event, wedding, mobile, ...). This is the bleed vector.
    if (overlap === 1 && shared.every(isGenericToken)) {
      best = Math.max(best, 8);
      continue;
    }

    // Specialty-modifier penalty: each unmatched candidate token that is
    // RARE (i.e. a niche modifier like "pet", "kosher", "newborn") deducts
    // points. This breaks ties between specialty entries and broader
    // category entries — generic candidates win when the query is generic.
    let specialtyPenalty = 0;
    for (const t of cTokens) {
      if (qTokens.has(t)) continue;
      const freq = TOKEN_DOC_FREQ.get(t) ?? 1;
      if (freq < 15) specialtyPenalty += 10;
    }

    const coverage = overlap / cTokens.size;
    const recall = overlap / qTokens.size;
    const s = Math.round(coverage * 60 + recall * 30 + overlap * 5) - specialtyPenalty;
    if (s > best) best = s;
  }
  return best;
}

function findFallbackEntry(businessType) {
  let best = { entry: null, score: 0 };
  for (const entry of FALLBACK.businessTypes) {
    const s = scoreEntry(businessType, entry);
    if (s > best.score) best = { entry, score: s };
  }
  return best;
}

function canonicalBenefits(entry, offer) {
  if (!entry) return null;
  const k = `${entry.category}::${entry.businessType}::${offer}`;
  const hit = FALLBACK.offerBenefits[k];
  return hit && hit.length > 0 ? hit.slice(0, 4) : null;
}

// Within a single business-type's offer set, find the nearest CSV offer to
// an arbitrary (AI-extracted, edited, or sub-offer) query string. Uses
// per-business-type IDF so rare-word overlaps outrank generic-word overlaps.
// e.g. "Male Headshots" → "Headshots" (rare "headshot") beats "Wedding
// Photography" (overlap on the generic "photograph").
function nearestCsvOfferByIDF(query, csvOffers) {
  if (!query || !Array.isArray(csvOffers) || csvOffers.length === 0) return null;
  const freq = new Map();
  for (const off of csvOffers) {
    for (const t of new Set(tokenize(off))) {
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const off of csvOffers) {
    const cTokens = new Set(tokenize(off));
    if (cTokens.size === 0) continue;
    let score = 0;
    for (const t of qTokens) {
      if (cTokens.has(t)) {
        const f = freq.get(t) || 1;
        score += 1 / f;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = off;
    }
  }
  return best;
}

// Absolute last-resort benefits when neither the canonical lookup, the AI
// batch, nor the nearest-CSV fuzzy match could supply benefits. Generic
// enough that the prompt still reads cleanly; structural fallback only.
const GENERIC_BENEFITS_FALLBACK = [
  "Built For Local Customers",
  "Trusted In Your Area",
  "Service You Can Rely On",
];

const KB_CACHE_TTL_MS = 10 * 60 * 1000;
const kbCacheEnabled = process.env.NODE_ENV !== "production" && !process.env.VERCEL;
const kbCache = new Map();

function kbCacheKey({ websiteUrl, businessType, companyName, location, tone }) {
  return JSON.stringify({
    websiteUrl: String(websiteUrl || "").trim(),
    businessType: String(businessType || "").trim(),
    companyName: String(companyName || "").trim(),
    location: String(location || "").trim(),
    tone: String(tone || "").trim(),
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readKbCache(key) {
  if (!kbCacheEnabled) return null;
  const hit = kbCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > KB_CACHE_TTL_MS) {
    kbCache.delete(key);
    return null;
  }
  return cloneJson(hit.payload);
}

function writeKbCache(key, payload) {
  if (!kbCacheEnabled) return;
  kbCache.set(key, { createdAt: Date.now(), payload: cloneJson(payload) });
}

// ─── Model fallback chain (Gemini) ────────────────────────────────────────
const MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

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

async function generateWithFallback({ contents, config }) {
  let lastErr;
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const response = await ai.models.generateContent({ model, contents, config });
      if (model !== MODEL_FALLBACK_CHAIN[0]) {
        console.warn(`Primary model overloaded — served via fallback: ${model}`);
      }
      return response;
    } catch (err) {
      lastErr = err;
      if (!isFallbackEligibleError(err)) throw err;
      const code = err.code ?? err?.error?.code;
      const status = err.status ?? err?.error?.status ?? "";
      console.warn(`Model ${model} unusable (${code ?? status}), trying next fallback…`);
    }
  }
  throw lastErr;
}

// ─── Firecrawl 3-tier scrape (ports Lovable's firecrawl.server.ts) ────────
async function scrapeSite(url) {
  const attempts = [
    { url, formats: ["markdown", "summary"], onlyMainContent: true, waitFor: 3000, timeout: 30000 },
    { url, formats: ["markdown", "summary"], onlyMainContent: false, waitFor: 3000, timeout: 30000 },
    { url, formats: ["markdown"], onlyMainContent: false, waitFor: 2000, timeout: 30000 },
  ];

  let lastErr = "unknown";
  for (const opts of attempts) {
    try {
      const { url: _u, ...rest } = opts;
      const doc = await firecrawl.scrapeUrl(opts.url, rest);
      const data = doc?.data ?? doc;
      const markdown = data?.markdown ?? "";
      const summary = data?.summary ?? "";
      if (markdown || summary) return { ok: true, markdown, summary };
      lastErr = "No readable content";
    } catch (e) {
      const status = e?.statusCode ?? e?.status;
      const msg = e?.message || String(e);
      if (status === 401 || status === 402 || status === 403) {
        return { ok: false, error: `Firecrawl ${status}: ${msg.slice(0, 160)}` };
      }
      lastErr = msg;
    }
  }
  return { ok: false, error: lastErr };
}

// ─── looksGeneric filter (ports Lovable's research.functions.ts) ─────────
function looksGeneric(text, ctx) {
  const t = String(text).trim().toLowerCase();
  if (!t || t.length < 3 || t.length > 70) return true;
  const company = (ctx.company || "").toLowerCase();
  const loc = (ctx.location || "").toLowerCase();
  const bt = (ctx.type || "").toLowerCase();
  if (company && t.includes(company)) return true;
  if (loc && t.includes(loc)) return true;
  if (bt && (t === bt || t === bt.replace(/s$/, "") || t === bt + "s")) return true;
  if (/\b(best|top|cheap|near me|in [a-z]+)\b/.test(t)) return true;
  if (/^(services|solutions|company|business|professional|experts|specialists)$/.test(t)) return true;
  return false;
}

function matchesBadWords(text, badWords) {
  if (!badWords || badWords.length === 0) return false;
  const t = text.toLowerCase();
  return badWords.some((bad) => t === bad || t.includes(bad));
}

function titleCase(s) {
  return String(s)
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// ─── AI extraction (ports research.functions.ts AI call) ──────────────────
const servicesSchema = {
  type: "object",
  properties: {
    services: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["services"],
};

async function extractServicesFromContent({ siteContent, ctx }) {
  const system = [
    "You extract specific service offerings from a local business website.",
    "Rules:",
    "- Each item MUST be a concrete, specific service the business performs (e.g. 'Drain Cleaning', 'Gel Nails', 'Brake Service').",
    "- NEVER return generic category words ('Plumbing', 'Beauty'), brand or company names, location names, or SEO phrases ('Best Plumber Surrey').",
    "- 2-5 words each. Title Case. No trailing punctuation.",
    "- Return 6-10 items. If the site does not clearly describe enough specific services, return fewer (or none).",
  ].join("\n");

  const user = `Business: ${ctx.company}\nType: ${ctx.type}\nLocation: ${ctx.location}\n\nWebsite content:\n${siteContent}`;

  const response = await generateWithFallback({
    contents: `${system}\n\n${user}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: servicesSchema,
      temperature: 0,
    },
  });

  const raw = response.text ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(parsed.services) ? parsed.services : [];
}

// ─── Per-offer benefits (ports benefits.functions.ts) ─────────────────────
const benefitsSchema = {
  type: "object",
  properties: {
    benefitsByOffer: {
      type: "array",
      items: {
        type: "object",
        properties: {
          offer: { type: "string" },
          benefits: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 8 },
        },
        required: ["offer", "benefits"],
      },
    },
  },
  required: ["benefitsByOffer"],
};

// ─── Benefit helpers (ported from benefits.functions.ts) ──────────────────
function isFoodBusiness(businessType) {
  return /\b(restaurant|cafe|bakery|deli|food|catering|bistro|pizza|burger|sushi|coffee|bar|pub|brewery|winery|ice.?cream|candy|donut|taco|dining|eatery|kitchen|grill|bbq|barbecue)\b/i.test(
    businessType || "",
  );
}

function cleanBenefits(arr, isFood) {
  const negative = /(unlike|other companies|competitors|fail|bad |avoid|worse|cheap )/i;
  const edible =
    /\b(eat|eaten|eating|eatable|edible|ingest|ingestible|consume|consumable|swallow|food[- ]?(grade|safe|quality)|safe to eat|good enough to eat)\b/i;
  return arr
    .map((b) => String(b).replace(/\s+/g, " ").trim().replace(/[.!]+$/, ""))
    .filter(
      (b) =>
        b.length >= 3 &&
        b.length <= 80 &&
        !negative.test(b) &&
        (isFood || !edible.test(b)),
    );
}

function buildLocalBenefits(businessType, offer, tone) {
  const context = `${businessType} ${offer}`.toLowerCase();
  const service = String(offer).trim().replace(/\s+/g, " ");
  if (/garage|door|overhead/.test(context)) {
    return [
      "Stops Doors Getting Stuck Fast",
      "Installs Durable Long-Lasting Parts",
      "Repairs Damage Same Day",
      "Protects Home From Forced Entry",
      "Saves Money On Future Repairs",
      "Restores Smooth Reliable Operation",
    ];
  }
  if (/carpet|floor|tile|grout|upholstery/.test(context)) {
    return [
      "Removes Tough Deep-Set Stains",
      "Lifts High-Traffic Grime Fast",
      "Restores Original Colour Brilliance",
      "Kills Bacteria And Allergens",
      "Protects Fibres From Future Damage",
      "Dries Quickly After Treatment",
    ];
  }
  if (/plumb|hvac|heating|cooling|roof|electric|pest|clean|landscap|contract|repair|home/.test(context)) {
    return [
      `Restores ${service} Fast`,
      "Arrives On Time Every Visit",
      "Fixes Root Causes Not Symptoms",
      "Protects Your Property Long-Term",
      "Cuts Costs On Future Repairs",
      "Clears Problems In One Visit",
    ];
  }
  if (/salon|spa|beauty|nail|hair|skin|med/.test(context)) {
    return [
      `Transforms Your ${service} Results`,
      "Delivers Natural-Looking Outcomes",
      "Boosts Confidence After Every Visit",
      "Refreshes Skin In One Session",
      "Removes Stress And Tension Fast",
      "Saves Time With Efficient Booking",
    ];
  }
  if (/auto|car|truck|tire|brake|mechanic|detail/.test(context)) {
    return [
      `Restores ${service} Performance`,
      "Extends Vehicle Life Significantly",
      "Prevents Costly Breakdowns Ahead",
      "Saves Time With Fast Turnaround",
      "Protects Your Investment Long-Term",
      "Diagnoses Issues Other Shops Miss",
    ];
  }
  const urgent = (tone || "Friendly") === "Urgent" ? "Fixes Problems Same Day" : "Books Fast Around Your Schedule";
  return [
    `Delivers ${service} Results Fast`,
    urgent,
    "Removes Guesswork From The Process",
    "Boosts Outcomes With Every Visit",
    "Saves Time And Effort Upfront",
    "Transforms Results In One Session",
  ];
}

async function aiBenefitsForOffers({ offers, siteContent, ctx }) {
  if (offers.length === 0) return {};

  const hasSite = siteContent.trim().length > 200;
  const isFood = isFoodBusiness(ctx.type);
  const system = [
    "You write punchy, outcome-focused benefit statements for local-business ads.",
    "Rules:",
    hasSite
      ? "- Ground EVERY benefit in the website content provided. Paraphrase real outcomes, results, or experiences the site mentions for the offer."
      : "- Each benefit MUST reflect a specific, concrete outcome the customer gets from THIS exact offer — not generic platitudes.",
    "- EVERY benefit MUST open with a strong, distinct action verb (e.g., Removes, Eliminates, Restores, Revives, Saves, Cuts, Seals, Strips, Protects, Boosts, Extends, Prevents, Cleans, Transforms, Lifts, Locks, Repairs, Kills, Softens, Refreshes).",
    "- 3 to 5 words only. Strict Title Case. No trailing punctuation.",
    "- NEVER use filler or buzzwords: 'professional', 'expert', 'service', 'quality', 'trust', 'local', 'support', 'reliable', 'dedicated', 'proven', 'comprehensive', 'solution', 'efficient', 'effective', 'affordable', 'experienced', 'skilled', 'tailored', 'personalized'.",
    "- NEVER mention competitors, negatives, or the company/location name.",
    "- NEVER repeat the offer name verbatim in the benefit.",
    isFood
      ? "- This IS a food/beverage business — edibility, taste, flavor, and freshness language is welcome and expected."
      : "- SAFETY RULE: this is NOT a food business. NEVER suggest the product is edible, safe to eat, or food-grade — even when ingredients are food-like. Forbidden: eat, edible, ingest, consume, swallow, food-grade, food-safe.",
    "- Return exactly 6 distinct benefits per offer, each covering a DIFFERENT angle (e.g., results, speed, safety, convenience, longevity, cost savings, comfort, confidence). No two benefits may make the same point.",
    "- Return ONE benefitsByOffer entry per offer, in the same order as the input list.",
  ].join("\n");

  const user = [
    `Business type: ${ctx.type}`,
    `Tone: ${ctx.tone || "Friendly"}`,
    `Location: ${ctx.location}`,
    hasSite ? `\nWebsite content (use as source of truth):\n${siteContent}` : "",
    `\nWrite 6 benefit statements for EACH of these offers:`,
    ...offers.map((o, i) => `${i + 1}. ${o}`),
  ].join("\n");

  try {
    const response = await generateWithFallback({
      contents: `${system}\n\n${user}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: benefitsSchema,
        temperature: 0,
      },
    });
    const raw = response.text ?? "{}";
    const parsed = JSON.parse(raw);

    // Build a normalized-key map so slight Gemini variations
    // ("Male Headshots " ↔ "male headshots") still find the offer.
    const normalize = (s) => String(s).trim().toLowerCase().replace(/\s+/g, " ");
    const byNormalized = {};
    if (Array.isArray(parsed.benefitsByOffer)) {
      for (const entry of parsed.benefitsByOffer) {
        if (entry && typeof entry.offer === "string" && Array.isArray(entry.benefits)) {
          byNormalized[normalize(entry.offer)] = cleanBenefits(entry.benefits, isFood).slice(0, 6);
        }
      }
    }

    // Index by the exact offer strings we asked about, so callers can
    // look up by their own canonical chip text.
    const out = {};
    for (const offer of offers) {
      const hit = byNormalized[normalize(offer)];
      if (hit && hit.length >= 4) {
        out[offer] = hit;
      } else {
        // AI returned too few — fall back to category-matched local templates
        const fallback = cleanBenefits(buildLocalBenefits(ctx.type, offer, ctx.tone), isFood).slice(0, 6);
        if (fallback.length >= 4) out[offer] = fallback;
      }
    }
    return out;
  } catch (err) {
    console.warn("aiBenefitsForOffers failed:", err?.message || err);
    // On total AI failure build local templates for every offer
    const out = {};
    const isFood2 = isFoodBusiness(ctx.type);
    for (const offer of offers) {
      const fallback = cleanBenefits(buildLocalBenefits(ctx.type, offer, ctx.tone), isFood2).slice(0, 6);
      if (fallback.length >= 4) out[offer] = fallback;
    }
    return out;
  }
}

// ─── Express app ──────────────────────────────────────────────────────────
const app = express();

const localOriginPattern = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/;
const configuredOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (process.env.VERCEL_URL) {
  configuredOrigins.add(`https://${process.env.VERCEL_URL}`);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (configuredOrigins.has(origin) || localOriginPattern.test(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
}));
app.use(express.json({ limit: "2mb" }));

app.post("/api/build-kb", async (req, res) => {
  try {
    const { websiteUrl, businessType, companyName, location, tone } = req.body ?? {};

    if (!businessType || typeof businessType !== "string") {
      return res.status(400).json({ error: "businessType is required" });
    }

    const ctx = {
      company: companyName || "",
      location: location || "",
      type: businessType,
      tone: tone || "Friendly",
    };
    const cacheKey = kbCacheKey({ websiteUrl, businessType, companyName, location, tone: ctx.tone });
    const cachedPayload = readKbCache(cacheKey);
    if (cachedPayload) {
      cachedPayload.meta = { ...(cachedPayload.meta || {}), cacheHit: true };
      return res.json(cachedPayload);
    }

    // 1. CSV library match (gated on score floor — weak matches must NOT
    //    bleed cross-category offers into the dashboard).
    const CSV_SCORE_FLOOR = 30;
    const csvMatch = findFallbackEntry(businessType);
    const hasCsvMatch = !!csvMatch.entry && csvMatch.score >= CSV_SCORE_FLOOR;
    const csvEntry = hasCsvMatch ? csvMatch.entry : null;
    const badWords = csvEntry?.badOfferWords ?? [];
    if (csvMatch.entry && !hasCsvMatch) {
      console.warn(
        `CSV match for "${businessType}" rejected — best candidate "${csvMatch.entry.businessType}" scored ${csvMatch.score} (< ${CSV_SCORE_FLOOR}). Skipping CSV merge.`,
      );
    }

    // 2. Firecrawl scrape (3-tier).
    const hasWebsite = !!websiteUrl && websiteUrl.trim().length > 0;
    let scrape = { ok: false, error: "no website provided", markdown: "", summary: "" };
    if (hasWebsite) scrape = await scrapeSite(websiteUrl);
    const scrapeReadable = Boolean(scrape.ok && (scrape.markdown || scrape.summary));

    const siteContent = scrapeReadable
      ? (scrape.summary ? `SUMMARY: ${scrape.summary}\n\n` : "") +
        `MARKDOWN:\n${(scrape.markdown ?? "").slice(0, 12000)}`
      : "";

    // 3. AI extraction (only when we have readable content).
    let aiChips = [];
    if (scrapeReadable) {
      try {
        const services = await extractServicesFromContent({ siteContent, ctx });
        const seen = new Set();
        for (const s of services) {
          const cleaned = titleCase(String(s).replace(/\s+/g, " ").trim());
          if (!cleaned) continue;
          if (looksGeneric(cleaned, ctx)) continue;
          if (matchesBadWords(cleaned, badWords)) continue;
          const k = cleaned.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          aiChips.push(cleaned);
        }
      } catch (err) {
        console.warn("AI extraction failed:", err?.message || err);
      }
    }

    // 4. Merge with CSV offers (fill-to-8). AI-extracted chips come first.
    const offers = [];
    const seen = new Set();
    for (const c of aiChips) {
      const k = c.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        offers.push(c);
      }
      if (offers.length >= 8) break;
    }
    const csvOffers = csvEntry?.offers ?? [];
    const remaining = [];
    for (const s of csvOffers) {
      const cleaned = titleCase(s);
      const k = cleaned.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      if (offers.length < 8) {
        offers.push(cleaned);
      } else {
        remaining.push(cleaned);
      }
    }
    const subOffers = remaining.slice(0, 12);

    // 5. Per-offer benefits — prefer canonical CSV mapping, fall back to AI.
    const benefitsByOffer = {};
    const offersNeedingAi = [];
    for (const offer of offers) {
      const canonical = canonicalBenefits(csvEntry, offer);
      if (canonical) {
        benefitsByOffer[offer] = canonical;
      } else {
        offersNeedingAi.push(offer);
      }
    }
    if (offersNeedingAi.length > 0) {
      const aiBen = await aiBenefitsForOffers({
        offers: offersNeedingAi,
        siteContent,
        ctx,
      });
      for (const offer of offersNeedingAi) {
        if (aiBen[offer]) benefitsByOffer[offer] = aiBen[offer].slice(0, 6);
      }
    }

    // Guaranteed-fill pass: every offer (and every sub-offer) MUST land in
    // benefitsByOffer with at least one usable benefit. Falls back through:
    //   (a) nearest CSV offer's canonical benefits within the same business
    //       type — e.g. "Male Headshots" → "Headshots" canonical row,
    //   (b) ANY canonical benefits from this business type (coarser net),
    //   (c) a structural generic template (truly last resort).
    // No Gemini calls in this pass — works fully offline against the CSV.
    function ensureBenefitsFor(list) {
      for (const offer of list) {
        if (benefitsByOffer[offer] && benefitsByOffer[offer].length > 0) continue;
        if (csvEntry && Array.isArray(csvEntry.offers) && csvEntry.offers.length > 0) {
          const nearest = nearestCsvOfferByIDF(offer, csvEntry.offers);
          if (nearest) {
            const fb = canonicalBenefits(csvEntry, nearest);
            if (fb && fb.length > 0) {
              benefitsByOffer[offer] = fb;
              continue;
            }
          }
          for (const csvOff of csvEntry.offers) {
            const any = canonicalBenefits(csvEntry, csvOff);
            if (any && any.length > 0) {
              benefitsByOffer[offer] = any;
              break;
            }
          }
          if (benefitsByOffer[offer]) continue;
        }
        benefitsByOffer[offer] = [...GENERIC_BENEFITS_FALLBACK];
      }
    }
    ensureBenefitsFor(offers);
    ensureBenefitsFor(subOffers);

    // Supplement pass — top every offer up to 6 benefits using category-matched
    // local templates. Canonical XLSX rows carry 3; AI batches may return 4–5.
    // Runs offline, zero extra API calls.
    const isFood = isFoodBusiness(ctx.type);
    for (const offer of [...offers, ...subOffers]) {
      const current = benefitsByOffer[offer];
      if (!current || current.length >= 6) continue;
      const existing = new Set(current.map((b) => b.toLowerCase().trim()));
      const extras = cleanBenefits(buildLocalBenefits(ctx.type, offer, ctx.tone), isFood)
        .filter((b) => !existing.has(b.toLowerCase().trim()))
        .slice(0, 6 - current.length);
      if (extras.length > 0) benefitsByOffer[offer] = [...current, ...extras];
    }

    const payload = {
      offers,
      subOffers,
      benefitsByOffer,
      meta: {
        scrapeReadable,
        scrapeError: scrape.ok ? null : scrape.error,
        csvMatch: hasCsvMatch
          ? { businessType: csvEntry.businessType, category: csvEntry.category, score: csvMatch.score }
          : null,
        aiChipCount: aiChips.length,
        csvChipCount: offers.length - aiChips.length,
        cacheHit: false,
      },
    };
    writeKbCache(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    console.error("build-kb error:", err);
    return res.status(500).json({ error: err?.message || "Unknown server error" });
  }
});

const refineSchema = {
  type: "object",
  properties: { refined: { type: "string" } },
  required: ["refined"],
};

app.post("/api/refine-instruction", async (req, res) => {
  const { rawText } = req.body ?? {};
  if (!rawText?.trim()) return res.status(400).json({ error: "rawText is required" });

  const system = [
    "You are a prompt engineer for AI image generation.",
    "Rewrite the user correction as a single concise directive in imperative voice.",
    "Rules:",
    "- Max 2 sentences, under 240 characters total.",
    "- If the user says 'no X' or 'don't X', state what to use instead — never leave a void.",
    "- Be specific and visual: name exact objects, materials, colors, positions, lighting.",
    "- Correct spelling, grammar, punctuation, and sentence capitalization.",
    "- Do not touch brand, offer, benefits, or logo instructions.",
    "- Plain text only. No quotes, no labels, no markdown.",
  ].join("\n");

  const contents = `${system}\n\nRewrite this correction: """${rawText.trim()}"""`;

  try {
    const response = await generateWithFallback({
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: refineSchema,
        temperature: 0.25,
      },
    });

    let refined = rawText.trim();
    try {
      const parsed = JSON.parse(response.text ?? "{}");
      if (parsed.refined) {
        refined = String(parsed.refined)
          .replace(/^["']|["']$/g, "")
          .trim()
          .slice(0, 300);
      }
    } catch { /* fall through to raw text */ }

    return res.json({ refined });
  } catch (err) {
    console.error("refine-instruction error:", err?.message);
    const status = err?.status ?? err?.error?.status;
    if (status === "RESOURCE_EXHAUSTED" || err?.code === 429) {
      return res.status(429).json({ error: "Rate limit exceeded — try again in a moment." });
    }
    return res.status(500).json({ error: "Refinement failed — your raw text will be used." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(PORT, HOST, () => {
    console.log(`KB backend listening on http://${HOST}:${PORT}`);
  });
}

export default app;
