import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callAITool } from "./ai.server";
import { isFoodBusiness } from "./business-category";

const InputSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  location: z.string().trim().max(200).optional().default(""),
  businessType: z.string().trim().min(1).max(200),
  offer: z.string().trim().min(1).max(120),
  tone: z.string().trim().min(1).max(50),
  siteContent: z.string().trim().max(20000).optional().default(""),
});

export const generateBenefits = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const negative = /(unlike|other companies|competitors|fail|bad |avoid|worse|cheap )/i;
    // Edibility guardrail — ONLY for non-food businesses. Beauty / wellness
    // products that contain food-like ingredients (sugaring paste, sugar
    // scrubs, lip balm, soap) are often applied HOT or topically; claims
    // they're "safe to eat" can send someone to the hospital. For actual
    // food businesses (restaurant, bakery, deli, etc.) edibility language
    // is expected and must NOT be filtered.
    const isFood = isFoodBusiness(data.businessType);
    const edible = /\b(eat|eaten|eating|eatable|edible|ingest|ingestible|consume|consumable|swallow|food[- ]?(grade|safe|quality)|safe to eat|good enough to eat)\b/i;
    const clean = (arr: string[]) =>
      arr
        .map((b) => b.replace(/\s+/g, " ").trim().replace(/[.!]+$/, ""))
        .filter(
          (b) =>
            b.length >= 3 &&
            b.length <= 80 &&
            !negative.test(b) &&
            (isFood || !edible.test(b)),
        );

    const hasSite = data.siteContent.trim().length > 200;

    try {
      const ai = await callAITool<{ benefits: string[] }>({
        system: [
          "You write short, specific customer-benefit statements for local-business ads.",
          "Rules:",
          hasSite
            ? "- Ground EVERY benefit in the website content provided. Paraphrase real promises, features, or experiences the site actually mentions for this offer."
            : "- Each benefit MUST be specific to the exact offer provided — not generic platitudes.",
          "- Focus on the OUTCOME or EXPERIENCE the customer gets from THIS specific service.",
          "- 3 to 7 words. Title case or sentence case. No trailing punctuation.",
          "- NEVER use words: 'professional', 'support', 'service', 'quality', 'expert', 'trust', 'local' as filler.",
          "- NEVER mention competitors, negatives, or the company/location name.",
          "- NEVER repeat the offer name verbatim in the benefit.",
          isFood
            ? "- This IS a food/beverage business — edibility, taste, flavor, and freshness language is welcome and expected."
            : "- ABSOLUTE SAFETY RULE: this is NOT a food business. NEVER suggest the product is edible, eatable, safe to eat, food-grade, ingestible, or 'gentle enough to eat' — even when ingredients are food-like (sugar, honey, fruit, etc.). Many such products are applied HOT or topically and consuming them causes serious burns or injury. Describe gentleness in terms of skin feel, natural/non-toxic on skin, or sensitivity-friendly — never in terms of consumption. Forbidden words/phrases here: eat, edible, eatable, ingest, consume, swallow, food-grade, food-safe.",
          "- Return exactly 6 distinct benefits, each highlighting a different angle (skill, safety, results, convenience, atmosphere, value, confidence, etc.).",
        ].join("\n"),
        user: [
          `Business type: ${data.businessType}`,
          `Offer: ${data.offer}`,
          `Tone: ${data.tone}`,
          `Location: ${data.location}`,
          hasSite ? `\nWebsite content (use as the source of truth):\n${data.siteContent}` : "",
          `\nWrite 6 benefit statements specific to "${data.offer}".`,
        ].join("\n"),
        toolName: "return_benefits",
        toolDescription: "Return 6 specific benefit statements for the given offer.",
        schema: {
          type: "object",
          properties: {
            benefits: {
              type: "array",
              items: { type: "string" },
              minItems: 4,
              maxItems: 8,
            },
          },
          required: ["benefits"],
          additionalProperties: false,
        },
      });
      const benefits = clean(ai.benefits ?? []);
      if (benefits.length >= 4) return { benefits, grounded: hasSite };
    } catch {
      // fall through to local templates
    }

    const benefits = clean(buildLocalBenefits(data.businessType, data.offer, data.tone));
    return { benefits, grounded: false };
  });

function buildLocalBenefits(businessType: string, offer: string, tone: string): string[] {
  const context = `${businessType} ${offer}`.toLowerCase();
  const service = offer.trim().replace(/\s+/g, " ");

  if (/garage|door|overhead/.test(context)) {
    return [
      "Smooth reliable door operation",
      "Safe repairs by trained technicians",
      "Durable parts built to last",
      "Fast help for stuck doors",
      "Careful work around your property",
      "Clear service before work begins",
    ];
  }

  if (/plumb|hvac|heating|cooling|roof|electric|pest|clean|landscap|contract|repair|home/.test(context)) {
    return [
      `Expert ${service} service`,
      "Fast scheduling when timing matters",
      "Skilled local technicians",
      "Quality workmanship built to last",
      "Clear communication from start to finish",
      "Respectful care for your property",
    ];
  }

  if (/salon|spa|beauty|nail|hair|skin|med/.test(context)) {
    return [
      `Personalized ${service} experience`,
      "Experienced specialists you can trust",
      "Comfortable care from start to finish",
      "Polished results that feel natural",
      "Clean professional treatment environment",
      "Easy booking for busy schedules",
    ];
  }

  if (/auto|car|truck|tire|brake|mechanic|detailing/.test(context)) {
    return [
      `Reliable ${service} support`,
      "Skilled technicians for every visit",
      "Clear updates before work begins",
      "Quality parts and careful service",
      "Convenient scheduling that saves time",
      "Confident driving after service",
    ];
  }

  const urgent = tone === "Urgent" ? "Fast support when timing matters" : "Easy scheduling around your day";
  return [
    `Professional ${service} support`,
    urgent,
    "Friendly experts you can trust",
    "Clear communication from start to finish",
    "Quality results without the guesswork",
    "Local service focused on your needs",
  ];
}