# Copy of Ai Prompt Builder — AGENTS.md

## What this app does
Generates AI image-generation prompts for local business ads. The user enters a website URL and business type, clicks **Build KB**, and the app scrapes the site, extracts service offers and benefits via Gemini AI, and populates a Knowledge Base panel. The user picks one offer + up to 4 benefits, then clicks **Generate Prompt** to assemble a complete image-prompt they can copy.

---

## How to run locally (two processes required)

```bash
# Terminal 1 — Express backend (port 5001)
node server.js

# Terminal 2 — Vite frontend (port 5173)
npm run dev
```

Open **http://127.0.0.1:5173/**. Vite proxies all `/api/*` requests to `http://127.0.0.1:5001` (configured in `vite.config.ts`).

---

## File map

| File | Role |
|------|------|
| `server.js` | Express backend. One real route: `POST /api/build-kb`. Scrapes site via Firecrawl, extracts services via Gemini structured output, merges with CSV fallback DB, returns `{ offers, subOffers, benefitsByOffer }`. |
| `src/main.tsx` | Entire React app (~1100 lines). Two main components: `PalettePickerPanel` (slide-out palette chooser) and `App` (everything else). Left column = builder panel inputs. Right column = KB chip panel + prompt output. |
| `src/styles.css` | All styles. Layout: `.workspace` is a two-column CSS grid. Left = `aside.builder-panel`, right = `.right-column`. Responsive breakpoint at 900px collapses to single column. |
| `src/types.ts` | `BuilderState`, `Product`, `PlatformFormat` types. |
| `src/options.ts` | Static dropdown data: `products`, `formats`, `industries`, `tones`, `colorPresets`, `ctas`, `expressions`. |
| `src/prompt-builder.ts` | `buildPrompt(state, selectedOffer, selectedBenefits, autoAccentHex)` — assembles the final AI image prompt from all selected inputs. |
| `src/services/kbService.ts` | `fetchBusinessKnowledgeBase(url, businessType, companyName)` — POSTs to `/api/build-kb`, returns `KBPayload`. |
| `src/lib/logo-normalizer.ts` | Logo upload → normalize to PNG → extract dominant accent color. |
| `fallback-services.json` | Pre-built JSON database (259 business types, 2068 offer-benefit rows). Generated from the XLSX files. Used by server.js when AI extraction is unavailable or to fill missing benefits. |
| `InputPanel.tsx` | **NOT connected to the app.** Root-level draft/redesign using shadcn components. Ignore unless actively rebuilding the left panel. |

---

## Key data flow

```
User fills: websiteUrl + businessType + companyName
  → clicks "Build KB"
  → fetchBusinessKnowledgeBase() → POST /api/build-kb
  → server: Firecrawl scrapes site (3-tier fallback)
           → Gemini extracts service offers
           → merge with CSV fallback DB (fill-to-8 offers)
           → per-offer benefits (CSV canonical → AI → generic fallback)
  → returns { offers[], subOffers[], benefitsByOffer{} }
  → KB panel shows offer chips; user picks one offer
  → benefit chips appear; user picks up to 4 (BENEFIT_SELECTION_CAP)
  → buildPrompt() assembles final prompt
  → user copies prompt
```

---

## Left column (builder panel) structure

The `<aside className="builder-panel">` in `src/main.tsx` contains top-to-bottom:
1. Brand block (logo + app title)
2. KB inputs: Website URL, Business Type, Company Name, **Build KB** button, error message
3. Dropdowns: Product, Industry, Tone
4. Palette picker trigger (opens `PalettePickerPanel` slide-out)
5. Dropdowns: Format, CTA, Expression
6. **Generate Prompt** button
7. (No "Selected product" or logo asset blocks — those were removed)

---

## Right column structure

`.right-column` contains:
- `.kb-panel` — Knowledge Base: offer chips, sub-offer toggle, benefit chips per selected offer
- `.output-panel` — generated prompt display + copy button

---

## Server.js build-kb pipeline detail

1. **CSV match** — `findFallbackEntry(businessType)` with score floor 30. Prevents cross-category bleed.
2. **Firecrawl scrape** — 3-tier: full scrape → fallback → summary only.
3. **Gemini extraction** — structured JSON output: list of service names from site content.
4. **Merge** — AI chips first (up to 8 offers), CSV fills remainder. Overflow → `subOffers`.
5. **Benefits** — canonical CSV rows preferred; AI batch for gaps; guaranteed-fill pass uses nearest CSV offer or generic template. Supplement pass tops every offer to 6 benefits offline.

---

## Environment variables (.env)

```
FIRECRAWL_API_KEY=...
GEMINI_API_KEY=...
```

---

## Important patterns

- **`buildPrompt()`** in `src/prompt-builder.ts` is the single source of truth for prompt assembly. All prompt changes go here.
- **`colorPresets`** in `src/options.ts` defines all palette options including `auto-dark` / `auto-light` which use the extracted logo accent color.
- **Benefit selection cap** is `BENEFIT_SELECTION_CAP = 4` in `src/main.tsx`.
- **KB state** lives entirely in `App` component state: `kbOffers`, `kbSubOffers`, `kbBenefitsByOffer`, `kbSelectedOffer`, `selectedBenefitsByOffer`.
- The palette slide-out panel is rendered via `createPortal` into `document.body`.
