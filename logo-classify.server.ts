import type { LogoStyle } from "./kb-types";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/**
 * Classify a logo as "dark" | "light" | "boxed" using a vision model.
 * Returns null on any failure so callers can fall back gracefully.
 */
export async function classifyLogoStyle(logoUrl: string): Promise<LogoStyle | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key || !logoUrl) return null;

  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      {
        role: "system",
        content: [
          "You classify a brand logo image into exactly one of three categories so an ad-generation pipeline knows how to place it on a background:",
          "- \"dark\"  : the logo's marks/letters are dark-colored on a transparent or light background. Needs a light backdrop to read.",
          "- \"light\" : the logo's marks/letters are light-colored on a transparent or dark background. Needs a dark backdrop to read.",
          "- \"boxed\" : the logo already includes its own opaque background plate / box / badge as part of the mark itself (e.g. white wordmark inside a solid colored rectangle).",
          "Pick the single best fit. Be decisive.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Classify this logo." },
          { type: "image_url", image_url: { url: logoUrl } },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "return_logo_style",
          description: "Return the logo style classification.",
          parameters: {
            type: "object",
            properties: {
              style: { type: "string", enum: ["dark", "light", "boxed"] },
            },
            required: ["style"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "return_logo_style" } },
  };

  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const argStr = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argStr) return null;
    const parsed = JSON.parse(argStr) as { style?: LogoStyle };
    if (parsed.style === "dark" || parsed.style === "light" || parsed.style === "boxed") {
      return parsed.style;
    }
    return null;
  } catch {
    return null;
  }
}