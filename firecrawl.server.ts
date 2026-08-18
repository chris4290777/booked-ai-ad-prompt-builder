const FIRECRAWL_API = "https://api.firecrawl.dev";

export type ScrapeResult = {
  ok: boolean;
  markdown?: string;
  summary?: string;
  title?: string;
  branding?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    textPrimary?: string;
  };
  logoUrl?: string;
  error?: string;
};

export async function scrapeSite(url: string): Promise<ScrapeResult> {
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) return { ok: false, error: "FIRECRAWL_API_KEY missing" };

  const attempts: Array<Record<string, unknown>> = [
    // Full attempt: branding + summary + main-content extraction
    { url, formats: ["markdown", "summary", "branding"], onlyMainContent: true },
    // Fallback 1: drop branding (which triggers JS actions on some sites)
    { url, formats: ["markdown", "summary"], onlyMainContent: true },
    // Fallback 2: raw markdown only, no main-content heuristics
    { url, formats: ["markdown"], onlyMainContent: false },
  ];

  let lastErr = "unknown";
  for (const body of attempts) {
    try {
      const res = await fetch(`${FIRECRAWL_API}/v2/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fcKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        lastErr = `Firecrawl ${res.status}`;
        // Retry on 5xx / scrape-action errors; bail on auth/quota
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          return { ok: false, error: `${lastErr}: ${txt.slice(0, 160)}` };
        }
        continue;
      }

      const json: any = await res.json();
    const doc = json?.data ?? json;
    const markdown: string | undefined = doc?.markdown;
    const summary: string | undefined = doc?.summary;
    const title: string | undefined = doc?.metadata?.title;
    const b = doc?.branding ?? null;
    const branding = b
      ? {
          primary: b?.colors?.primary,
          secondary: b?.colors?.secondary,
          accent: b?.colors?.accent,
          background: b?.colors?.background,
          textPrimary: b?.colors?.textPrimary,
        }
      : undefined;
    const logoUrl: string | undefined =
      // Only trust explicit branding logo fields. Do NOT fall back to
      // og:image — that often pulls a hero/social-preview photo and
      // downstream the model treats it as the brand mark, producing
      // wildly wrong logos (e.g. a Toyota square for a yacht dealer).
      b?.images?.logo || b?.logo || undefined;
      if (!markdown && !summary) {
        lastErr = "No readable content";
        continue;
      }
      return { ok: true, markdown, summary, title, branding, logoUrl };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Scrape failed";
    }
  }
  return { ok: false, error: lastErr };
}