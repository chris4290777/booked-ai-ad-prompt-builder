import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const InputSchema = z.object({
  prompt: z.string().min(10).max(8000),
  // Either a data: URL (preferred — guaranteed-readable bytes) or a public https URL.
  logoDataUrl: z.string().max(16_000_000).optional(),
  logoUrl: z.string().url().max(2000).optional(),
  // "composite" (default) → do NOT hand the logo to the image model; the
  // app composites the real logo onto the result afterward. "ai-blend"
  // → attach the logo so the model draws it into the scene.
  logoMode: z.enum(["composite", "ai-blend", "none"]).optional(),
});

export const generateAd = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY is not configured");

    const logoMode = data.logoMode ?? "composite";
    const attachLogoToModel = logoMode === "ai-blend";

    // Resolve the logo to a filename-less data URL so the model can never
    // read the original filename / extension and render it as logo text
    // (e.g. "Cloverdale Autobody.png").
    let logoForModel: string | undefined = data.logoDataUrl;
    if (attachLogoToModel && !logoForModel && data.logoUrl) {
      try {
        const r = await fetch(data.logoUrl);
        if (r.ok) {
          const buf = new Uint8Array(await r.arrayBuffer());
          const mime = r.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
          // base64 encode
          let bin = "";
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          const b64 = btoa(bin);
          logoForModel = `data:${mime};base64,${b64}`;
        } else {
          logoForModel = data.logoUrl;
        }
      } catch {
        logoForModel = data.logoUrl;
      }
    }

    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: data.prompt },
    ];
    if (attachLogoToModel && logoForModel) {
      userContent.push({ type: "image_url", image_url: { url: logoForModel } });
    }

    const body = {
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: userContent }],
      modalities: ["image", "text"],
    };

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new Error("Rate limit exceeded. Please try again in a moment.");
      }
      if (res.status === 402) {
        throw new Error(
          "AI credits exhausted. Add funds in Lovable workspace settings.",
        );
      }
      throw new Error(`Image gateway error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const imageDataUrl: string | undefined =
      json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageDataUrl) {
      throw new Error("Image generation returned no image");
    }
    return { imageDataUrl };
  });