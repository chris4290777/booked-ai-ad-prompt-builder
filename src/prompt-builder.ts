import { formats, products } from "./options";
import type { BuilderState } from "./types";

const expressionGuidance: Record<string, string> = {
  Happy: "Warm, friendly, approachable, positive, natural smile. Avoid exaggerated grin.",
  Confident: "Calm, capable, professional, trustworthy, slight smile, direct eye contact, relaxed posture.",
  Focused: "Concentrated, attentive, actively working, serious but professional.",
  Irritated: "Mildly frustrated or annoyed in a realistic business situation. Professional, not aggressive, not cartoonish.",
  Angry: "Clearly frustrated or upset, but still realistic and safe for a professional business ad. Not threatening, violent, or exaggerated.",
};

const styleDirections: Record<string, string> = {
  "Dark blue tech glow": "Dark navy background, electric blue highlights, glowing blue borders, white text, cyan accents, modern high-contrast tech style.",
  "Clean corporate blue": "Clean white and deep-blue business palette, restrained cyan accents, polished corporate layout, spacious and highly readable.",
  "Premium black and blue": "Premium black base with electric blue accents, sharp lighting, refined contrast, sophisticated business-tech feel.",
  "Light modern business": "Bright modern business setting, clean natural light, white and soft-blue palette, professional and approachable.",
  "Industry-specific realistic photo": "Realistic local business environment matched to the selected industry, natural lighting, credible people and workspace details.",
  "Emerald trust": "Deep green and teal trust palette, clean white type, subtle mint highlights, grounded local-business feel, calm and credible.",
  "Warm premium gold": "Premium black and warm gold palette. Use warm gold and champagne for CTA buttons, feature bubble borders, icon accents, highlighted words, divider lines, logo accent line, and subtle glow effects. Avoid cyan, electric blue, neon blue, and blue tech glows for this theme.",
  "Clean white and cyan": "Bright white base with cyan accents, clean glassy interface elements, crisp shadows, modern SaaS-like clarity, fresh and minimal.",
  "Charcoal and lime": "Charcoal base with controlled lime accents, high contrast white text, energetic but still professional, useful for bold service ads.",
  "Medical teal": "Soft white and medical teal palette, clean trustworthy healthcare feel, gentle contrast, fresh lighting, calm and professional.",
  "Local service orange": "Dark charcoal with controlled orange highlights and warm off-white accents, practical local-service energy, confident and action-oriented.",
  "Soft slate and sky": "Light slate and sky-blue palette, airy spacing, soft professional contrast, approachable modern business feel.",
};

const colorThemeApplication =
  "Apply the selected color theme consistently across the entire ad. The selected theme controls the background mood, CTA button color, feature bubble borders, icon accents, glow effects, panel/card borders, divider lines, highlighted words, UI mockup accents, and logo accent line. Do not fall back to cyan, electric blue, or dark blue tech styling unless that is part of the selected theme.";

const toneDirections: Record<string, string> = {
  Professional:
    "Use clear, credible, polished business language. Keep the message direct, practical, and easy to trust. Avoid slang, hype, and overly casual phrasing.",
  Friendly:
    "Use warm, approachable, conversational language. Make the ad feel helpful and human while still professional. Use simple phrasing that feels easy to act on.",
  Playful:
    "Use lighter, more energetic language with a small amount of personality. Keep it business-safe and readable. Avoid jokes that distract from the offer.",
  Premium:
    "Use refined, confident, high-end language. Keep the copy concise, calm, and polished. Avoid clutter, loud hype, bargain language, or overly busy wording.",
  Bold:
    "Use punchier, more assertive language with stronger headline energy. Keep it confident and direct without making exaggerated or guaranteed claims.",
  "Urgent but not pushy":
    "Use action-focused, time-aware language that encourages a next step without pressure. Avoid fear tactics, false scarcity, aggressive countdown language, or exaggerated urgency.",
};

const logoDirection =
  "Brand logo requirement: use the exact Booked AI Systems transparent PNG logo from this public asset URL: https://booked-ai-ad-prompt-builder.vercel.app/brand/booked-ai-logo-transparent-white.png. The final ad must use that exact image asset only. Do not type, recreate, redraw, approximate, or invent the Booked AI Systems logo with generated text. If the image model cannot place the exact PNG asset from the URL, leave the logo area blank instead of creating a substitute. Place the logo as a small brand signature, not a hero element: target 8% to 12% of the ad width, positioned in clean negative space such as the top-left or top-right brand corner. It must not compete with the headline, people, CTA, product mockup, phone, card, or main offer. Keep the PNG transparent with no box, badge, plaque, panel, rounded rectangle, border, or background behind it. Add only a subtle drop shadow and soft edge glow that follows the transparent alpha shape of the logo, not a rectangular glow. Make the logo feel integrated into the ad by matching the glow, shadow, scale, and placement to the layout grid. Match the logo white to the ad's typography white. Recolor exactly one logo text line, either \"Booked\" or \"AI Systems\", to the ad accent color. Keep the other text line white. Do not recolor the whole logo. Do not add any tagline, slogan, extra brand text, footer brand lockup, or duplicate brand name anywhere else. The logo must not cover, touch, or overlap any person's face, body, hands, phone, business card, or important object.";

function buildRequiredAssets(productAssetReferences: string[] = []) {
  const productAssets = productAssetReferences.length
    ? ` Product-specific required asset references: ${productAssetReferences.join(" ")}`
    : "";

  return `Use every required asset listed here. Do not omit a required asset. 1. Brand logo: https://booked-ai-ad-prompt-builder.vercel.app/brand/booked-ai-logo-transparent-white.png. Use this exact transparent PNG as the Booked AI Systems logo; do not generate a fake logo or substitute text. 2. Product references, when listed: use them as visual references for the physical product/object in the scene.${productAssets} If an asset cannot be placed exactly, leave clean space for that asset instead of inventing a replacement. The final ad should include both the brand logo and any selected product reference asset in a balanced layout.`;
}

function getActiveAssetReferences(state: BuilderState, productAssetReferences: string[] = []) {
  if (state.productId !== "nfc_social_station") {
    return productAssetReferences;
  }

  if (state.socialPlatform === "Both") {
    return productAssetReferences;
  }

  return productAssetReferences.filter((reference) => reference.toLowerCase().includes(state.socialPlatform.toLowerCase()));
}

function pickByText<T>(items: T[], seed: string) {
  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return items[total % items.length];
}

function sentenceList(items: string[], count: number) {
  return items.slice(0, count).join(" ");
}

export function buildPrompt(state: BuilderState) {
  const product = products.find((item) => item.id === state.productId) ?? products[0];
  const format = formats.find((item) => item.id === state.platformFormatId) ?? formats[0];
  const cta = state.cta === "Auto" ? pickByText(product.ctas, `${product.id}-${state.industry}`) : state.cta;
  const hook = pickByText(product.hooks, `${state.productId}-${state.industry}-${state.tone}`);
  const features = product.featureBubbles.slice(0, 6).join(" · ");
  const pain = sentenceList(product.painPoints, 2);
  const solution = sentenceList(product.solutionLines, 2);
  const visualStyle = styleDirections[state.visualStyle] ?? styleDirections["Dark blue tech glow"];
  const activeAssetReferences = getActiveAssetReferences(state, product.assetReferences);
  const requiredAssets = buildRequiredAssets(activeAssetReferences);
  const socialPlatformDirection =
    state.productId === "nfc_social_station"
      ? ` Selected social platform for the follow station: ${state.socialPlatform}. ${
          state.socialPlatform === "Both"
            ? "Show a multi-platform social follow setup using both Facebook and Instagram reference cards, or a clearly intentional two-card display."
            : `Use the ${state.socialPlatform} follow card reference only. Do not show the other platform's card.`
        }`
      : "";

  const sections = [
    {
      heading: "Hook",
      body: hook,
    },
    {
      heading: "Body Copy",
      body: `${pain} ${solution} Write the ad copy in this selected tone: ${state.tone}. ${toneDirections[state.tone]} Keep the copy clear, direct, modern, and not hype-heavy for a ${state.industry}. Use approved hedged language such as "helps reduce", "supports faster response", "helps capture more opportunities", and "helps customers take action".`,
    },
    {
      heading: "Tone Direction",
      body: `Selected tone: ${state.tone}. ${toneDirections[state.tone]} Apply this tone to the headline, supporting copy, CTA framing, feature bubble wording, and overall visual text hierarchy while preserving the approved product claims.`,
    },
    {
      heading: "CTA",
      body: cta,
    },
    {
      heading: "Required Assets",
      body: requiredAssets,
    },
    {
      heading: "Image Prompt",
      body: `${product.imagePromptLogic}${socialPlatformDirection} Industry context: ${state.industry}. Facial expression guidance: ${expressionGuidance[state.expression]}. Image source mode: ${state.imageSource}.`,
    },
    {
      heading: "Visual Direction",
      body: `${product.visualDirection} Selected color theme: ${state.visualStyle}. ${visualStyle} ${colorThemeApplication} Match the visual hierarchy to the selected tone: ${state.tone}. ${toneDirections[state.tone]} Follow the Required Assets section exactly. ${logoDirection} Add clean overlay space for one headline, one short supporting line, feature bubbles reading "${features}", and the Booked AI Systems brand name. Use high-contrast text that fits the selected color theme.`,
    },
    {
      heading: "Platform Specs",
      body: `${format.platform} ${format.name}. Aspect ratio ${format.aspectRatio}. Resolution ${format.resolution}. Keep text inside safe margins and make the main headline readable on mobile.`,
    },
    {
      heading: "Negative Constraints",
      body: "Avoid guaranteed revenue claims, guaranteed booking claims, fake statistics, exaggerated promises, overstuffed text, random fake logos, unreadable text, generic agency language, cluttered layouts, distorted hands, and accidental brand marks. Do not flatten the logo onto a solid rectangle, place it inside any box/badge/panel/container, invent a different logo, remove transparency, recolor the entire logo, make both logo text lines the same accent color, add any tagline/slogan beneath the logo, or duplicate the brand name elsewhere in the ad. Do not include unsupported claims or fabricated metrics.",
    },
  ];

  return {
    title: `${product.name} for ${state.industry}`,
    sections,
    fullText: sections.map((section) => `${section.heading}\n${section.body}`).join("\n\n"),
  };
}
