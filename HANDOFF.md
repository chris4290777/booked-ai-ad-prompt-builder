# Handoff: Copy of Ai Prompt Builder

**Updated:** 2026-07-08  
**Project path:** `/Users/christopherpike/Documents/Codex/2026-04-25/Copy of Ai Prompt Builder`  
**Git branch:** `web-deployment`  
**GitHub remote:** `https://github.com/chris4290777/booked-ai-ad-prompt-builder.git`  
**Vercel project:** `booked-ai-ad-prompt-builder`

## What This App Does

Generates AI image-generation prompts for local business ads.

Core workflow:

1. User enters Website URL, Company Name, Location Area, and Business Type.
2. User clicks **Build KB**.
3. Backend scrapes the site with Firecrawl and extracts/merges offers and benefits using Gemini plus `fallback-services.json`.
4. User selects one offer and 3+ benefits.
5. User uploads a logo and chooses dark/light logo background mode.
6. User chooses look/feel, tone, CTA, format, expression, and optional special instructions.
7. User clicks **Generate Prompt** or **Copy Prompt**.

## How To Run Locally

Two terminals are required.

Terminal 1, backend:

```bash
cd "/Users/christopherpike/Documents/Codex/2026-04-25/Copy of Ai Prompt Builder"
node server.js
```

Backend should be available at:

```text
http://127.0.0.1:5001
```

Terminal 2, frontend:

```bash
cd "/Users/christopherpike/Documents/Codex/2026-04-25/Copy of Ai Prompt Builder"
npm run dev
```

Open the Vite URL shown in Terminal, usually:

```text
http://127.0.0.1:5173/
```

If `5173` is busy, Vite will use `5174`, `5175`, etc.

## Deployment

This app is hosted through Vercel.

Local changes do not update the live site until pushed/deployed.

Normal flow:

```text
Local code changes -> GitHub push -> Vercel deploy -> live site
```

Relevant Vercel config:

- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`
- API function: `api/[...path].js`
- Required included file: `fallback-services.json`

## Required Environment Variables

Local `.env` must include:

```text
FIRECRAWL_API_KEY=...
GEMINI_API_KEY=...
```

Secrets are server-side only.

## Key Files

| File | Purpose |
| --- | --- |
| `server.js` | Express backend, `/api/build-kb`, `/api/refine-instruction`, `/api/health`. |
| `src/main.tsx` | Main React app and UI state. |
| `src/prompt-builder.ts` | Single source of truth for final prompt assembly. |
| `src/services/kbService.ts` | Frontend request wrapper for Build KB. |
| `src/options.ts` | Static dropdown data. |
| `src/styles.css` | App styling. |
| `fallback-services.json` | Required fallback KB database. |
| `InputPanel.tsx` | Disconnected draft/redesign. Ignore unless rebuilding left panel. |

## Recent Important Fixes

### Stale Business / Toyota Data

- Removed hardcoded Toyota/Richmond default business info.
- Bumped workspace storage key to `aipb-workspace-v3` to avoid older saved prompt state.
- Copy Prompt now rebuilds from current state or copies the current generated prompt intentionally.
- Prompt output starts blank after refresh instead of showing stale generated content.

### Build KB Wiring

- Frontend now sends `locationArea` and `tone` to `/api/build-kb`.
- Local-only 10-minute Build KB cache added in `server.js` for identical testing requests.
- Cache is disabled in production/Vercel.

### Generate/Copy Validation

Generate and Copy now require:

- Website URL
- Company Name
- Location Area
- Business Type
- KB built
- One offer selected
- 3+ benefits selected
- Logo uploaded
- Logo background mode chosen

If requirements are missing, the app directs the user to the relevant panel.

Current behavior:

- Buttons look inactive when requirements are missing.
- Red message appears only after user clicks Generate/Copy while requirements are missing.

### Prompt Fallback Leak

- Removed fallback to AI Receptionist feature bubbles when no KB benefits are selected.
- This prevents old personal-business data like “Answers Calls” / “Works 24/7” leaking into prompts.

### Prompt Variation

Repeated **Generate Prompt** now varies:

- scene framing
- character details
- camera/composition

It should not vary:

- business name
- location
- selected offer
- selected benefits
- CTA
- palette/logo rules
- platform specs

### Anatomy Guard

`src/prompt-builder.ts` now adds a human anatomy guard to prompts.

Extra body-contact guard applies for massage/spa/therapy/bodywork/beauty-style scenes.

### Expanded Prompt Heading

Removed product label from expanded prompt title. It now shows business/location instead of:

```text
AI Receptionist for ...
```

### Local Test Fill

A local-only **Fill Test Business** button was added for testing:

```text
https://beautymoodspa.com/
Beauty Mood Spa
Langley
Massage Spa
```

It appears only on `127.0.0.1` / `localhost`.

Before final push, user may prefer removing this test helper entirely to avoid confusion.

## Current Local App State Notes

User saw stale Special Instructions in browser local storage:

```text
Depict a female main character wearing a Toyota name tag ...
```

This is browser state, not necessarily code. Clear Special Instructions in the app before testing.

## Current Git Status Notes

As of this handoff, working tree has local changes and untracked files.

Known modified tracked files include:

- `server.js`
- `src/main.tsx`
- `src/prompt-builder.ts`
- `src/services/kbService.ts`
- `src/styles.css`

Also shown:

- `D public/brand/booked-ai-logo-transparent-white.png`

Do not revert/delete user changes casually. Inspect before committing.

Untracked files include reference scripts, XLSX data files, backups, thumbnails, favicon, and `AGENTS.md`.

## User Preference

User prefers:

- Slow, step-by-step instructions when operating tools/sites.
- Start from platform/site/tool, then root menu, then drill down one step at a time.
- Ask for screenshots instead of asking the user to interpret technical output.
- Minimal progress narration unless a decision or blocker appears.

## Suggested Next Step

If continuing Prompt Builder work in a fresh thread:

1. Read `AGENTS.md`.
2. Read this `HANDOFF.md`.
3. Check `git status --short`.
4. Confirm current dev URL and local server ports.
5. Clear stale browser Special Instructions before testing prompts.
6. Before deploy, decide whether to remove the local **Fill Test Business** helper.

