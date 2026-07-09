// ─── Knowledge Base Service ───────────────────────────────────────────────
// Calls the local Express backend at /api/build-kb, which scrapes the URL
// via Firecrawl and extracts offers + benefits via Gemini structured output.
// The Vite dev server proxies /api/* to http://127.0.0.1:5001.

export interface KBPayload {
  offers: string[];
  subOffers: string[];
  benefitsByOffer: Record<string, string[]>;
}

export async function fetchBusinessKnowledgeBase(
  url: string,
  businessType: string,
  companyName: string = "",
  location: string = "",
  tone: string = "",
): Promise<KBPayload> {
  const response = await fetch("/api/build-kb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ websiteUrl: url, businessType, companyName, location, tone }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error ? `: ${errBody.error}` : "";
    } catch {
      /* ignore */
    }
    throw new Error(`Build KB failed (${response.status})${detail}`);
  }

  const data = (await response.json()) as Partial<KBPayload>;

  return {
    offers: Array.isArray(data.offers) ? data.offers : [],
    subOffers: Array.isArray(data.subOffers) ? data.subOffers : [],
    benefitsByOffer:
      data.benefitsByOffer && typeof data.benefitsByOffer === "object"
        ? data.benefitsByOffer
        : {},
  };
}
