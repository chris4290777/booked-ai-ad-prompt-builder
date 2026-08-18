import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { scrapeSite } from "./firecrawl.server";
import { callAITool } from "./ai.server";
import { findFallbackEntry } from "./fallback-services";
import { classifyLogoStyle } from "./logo-classify.server";

const InputSchema = z.object({
  websiteUrl: z.string().trim().min(1).max(500),
  companyName: z.string().trim().min(1).max(200),
  location: z.string().trim().max(200).optional().default(""),
  businessType: z.string().trim().min(1).max(200),
});

function looksGeneric(text: string, ctx: { company: string; location: string; type: string }) {
  const t = text.trim().toLowerCase();
  if (!t || t.length < 3 || t.length > 70) return true;
  const company = ctx.company.toLowerCase();
  const loc = ctx.location.toLowerCase();
  const bt = ctx.type.toLowerCase();
  if (company && t.includes(company)) return true;
  if (loc && t.includes(loc)) return true;
  // pure category words
  if (bt && (t === bt || t === bt.replace(/s$/, "") || t === bt + "s")) return true;
  // SEO phrases like "best plumber surrey"
  if (/\b(best|top|cheap|near me|in [a-z]+)\b/.test(t)) return true;
  // Single generic words
  if (/^(services|solutions|company|business|professional|experts|specialists)$/.test(t)) return true;
  return false;
}

export const researchBusiness = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const ctx = {
      company: data.companyName,
      location: data.location ?? "",
      type: data.businessType,
    };

    let unreadable = false;
    let warning: string | null = null;
    let realChips: string[] = [];

    const csvMatch = findFallbackEntry(data.businessType);
    // 30 = a single meaningful shared word (e.g. "drywall") qualifies as a
    // useful library match. 60+ stays the strong/exact tier.
    const hasCsvMatch = !!csvMatch.entry && csvMatch.score >= 30;
    const hasWebsite = data.websiteUrl.trim().length > 0;

    // Always run Firecrawl when a website is provided — we need branding,
    // logoUrl, and siteContent for downstream steps regardless of CSV match.
    const scrape = hasWebsite
      ? await scrapeSite(data.websiteUrl)
      : { ok: false, error: "no website provided" } as Awaited<ReturnType<typeof scrapeSite>>;

    const scrapeReadable = scrape.ok && (scrape.markdown || scrape.summary);

    if (hasWebsite && !scrapeReadable) {
      unreadable = true;
      if (!hasCsvMatch) {
        const reason = (scrape.error ?? "unknown").split(":")[0].slice(0, 60);
        warning = `Couldn't read the website (${reason}). Showing suggested services from our library.`;
      }
    }

    // Run AI extraction when:
    //   - we have readable site content, AND
    //   - either no CSV match (long tail) OR we want to enhance CSV defaults
    //     with site-specific services.
    if (scrapeReadable) {
      const content = (scrape.summary ? `SUMMARY: ${scrape.summary}\n\n` : "") +
        `MARKDOWN:\n${(scrape.markdown ?? "").slice(0, 12000)}`;

      try {
        const extracted = await callAITool<{ services: string[] }>({
          system: [
            "You extract specific service offerings from a local business website.",
            "Rules:",
            "- Each item MUST be a concrete, specific service the business performs (e.g. 'Drain Cleaning', 'Gel Nails', 'Brake Service').",
            "- NEVER return generic category words ('Plumbing', 'Beauty'), brand or company names, location names, or SEO phrases ('Best Plumber Surrey').",
            "- 2-5 words each. Title Case. No trailing punctuation.",
            "- Return 6-10 items. If the site does not clearly describe enough specific services, return fewer (or none).",
          ].join("\n"),
          user: `Business: ${data.companyName}\nType: ${data.businessType}\nLocation: ${data.location}\n\nWebsite content:\n${content}`,
          toolName: "return_services",
          toolDescription: "Return the list of specific services offered by the business.",
          schema: {
            type: "object",
            properties: {
              services: {
                type: "array",
                items: { type: "string" },
                minItems: 0,
                maxItems: 12,
              },
            },
            required: ["services"],
            additionalProperties: false,
          },
        });
        const seen = new Set<string>();
        for (const s of extracted.services ?? []) {
          const cleaned = s.replace(/\s+/g, " ").trim();
          if (!cleaned) continue;
          if (looksGeneric(cleaned, ctx)) continue;
          const key = cleaned.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          realChips.push(cleaned);
        }
      } catch (e) {
        warning = e instanceof Error ? e.message : "AI extraction failed";
      }
    }

    const chips: { text: string; suggested: boolean }[] = realChips.map((t) => ({
      text: t,
      suggested: false,
    }));

    // Merge CSV offers in. If we have a strong CSV match, use it as the base
    // (these are clean, library-quality offers). AI-extracted site-specific
    // chips appear FIRST and CSV chips fill in to 8 total.
    const csvOffers = hasCsvMatch ? csvMatch.entry!.services : [];
    const needsFill = chips.length < 8 && csvOffers.length > 0;
    if (needsFill) {
      const existing = new Set(chips.map((c) => c.text.toLowerCase()));
      for (const s of csvOffers) {
        if (existing.has(s.toLowerCase())) continue;
        chips.push({ text: s, suggested: true });
        if (chips.length >= 8) break;
      }
      // Only warn about "limited services" when we actually fell back from
      // a real site read (not when CSV is the primary source by design).
      if (
        !hasCsvMatch &&
        !unreadable &&
        chips.some((c) => c.suggested) &&
        !warning
      ) {
        warning = "Found limited services on the site — added suggestions from our library.";
      }
    }

    if (chips.length === 0 && !hasCsvMatch && !hasWebsite && !warning) {
      warning = "Add a website URL or pick a more common business type for better suggestions.";
    }

    const logoUrl = scrape.logoUrl ?? null;
    const logoStyle = logoUrl ? await classifyLogoStyle(logoUrl) : null;

    return {
      chips,
      unreadable,
      warning,
      branding: scrape.branding ?? null,
      logoUrl,
      logoStyle,
      siteContent: scrape.ok
        ? ((scrape.summary ? `SUMMARY: ${scrape.summary}\n\n` : "") +
            `MARKDOWN:\n${(scrape.markdown ?? "").slice(0, 12000)}`).slice(0, 14000)
        : null,
    };
  });