import type { MappedPromptOverrides } from "./import-mapper";
import { colorPresets, formats, products, type ColorPreset } from "./options";
import type { BuilderState } from "./types";
import { STYLE_BLOCKS, DEFAULT_STYLE, type AdStyle } from "./lib/style-blocks";

const sceneVariants = [
  "Subject faces camera directly, neutral mid-shot framing.",
  "Subject at a slight three-quarter angle, relaxed natural posture.",
  "Subject with confident upright posture, subtle sense of motion implied.",
  "Subject in a candid natural pose, fully engaged in the activity.",
];

const characterVariants = [
  "Primary person has short dark hair, oval face, medium build, and calm professional presence.",
  "Primary person has shoulder-length warm brown hair, softer facial features, and relaxed approachable posture.",
  "Primary person has neatly styled black hair, sharper jawline, athletic build, and focused confident expression.",
  "Primary person has light brown hair, rounder face, average build, and natural friendly energy.",
  "Primary person has tied-back dark hair, defined cheekbones, slim build, and attentive working posture.",
  "Primary person has wavy medium-length hair, broader shoulders, and a grounded capable presence.",
];

const compositionVariants = [
  "Camera angle is eye-level with clean negative space reserved for ad text.",
  "Camera angle is a slight high three-quarter view with the service action clearly visible.",
  "Camera angle is a medium close-up with the subject and hands readable but not crowded.",
  "Camera angle is a wider environmental view showing the business setting without clutter.",
  "Camera angle is a candid side angle with natural depth and clean ad-copy space.",
  "Camera angle is a polished editorial crop with the person offset from the text area.",
];

const IMAGE_CLEANLINESS_DIRECTION =
  "Keep the entire subject area clean and naturally rendered, with plain realistic surfaces, even daylight, soft shadow transitions, crisp subject edges, smooth fabric rendering, and a polished commercial photo finish around the person, clothing, hair, hands, and nearby objects.";

function pickVariant(items: string[], seed: string, salt = 0): string {
  const total = seed.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return items[(total + salt) % items.length];
}

function buildSceneVariation(seed: string) {
  return [
    pickVariant(sceneVariants, seed, 0),
    pickVariant(characterVariants, seed, 3),
    pickVariant(compositionVariants, seed, 7),
    "These variation details may change between regenerations, but business name, location, offer, benefits, CTA, logo rules, palette, and platform specs must remain exactly as provided.",
  ].join(" ");
}

const expressionGuidance: Record<string, string> = {
  Happy: "Warm, friendly, approachable, positive, natural smile. Avoid exaggerated grin.",
  Confident: "Calm, capable, professional, trustworthy, slight smile, direct eye contact, relaxed posture.",
  Focused: "Concentrated, attentive, actively working, serious but professional.",
  Irritated: "Mildly frustrated or annoyed in a realistic business situation. Professional, not aggressive, not cartoonish.",
  Angry: "Clearly frustrated or upset, but still realistic and safe for a professional business ad. Not threatening, violent, or exaggerated.",
};

// ── Color Direction Engine ─────────────────────────────────────────────────
// Generates a three-layer color instruction from a ColorPreset (background,
// accent application, text/contrast). Replaces the old flat styleDirections
// name→string lookup so the prompt always reflects the exact hex values the
// user selected rather than a manually maintained description.
function buildColorDirection(preset: ColorPreset, autoAccentHex?: string): string {
  if (preset.variant === "auto-dark" || preset.variant === "auto-light") {
    const accent = autoAccentHex || "#20c8ff";
    const isDark = preset.variant === "auto-dark";
    const bgLayer = isDark
      ? `Background layer: dark charcoal base (${preset.baseHex}), high-contrast professional environment.`
      : `Background layer: bright studio-white base (${preset.baseHex}), clean and airy.`;
    const textLayer = isDark
      ? `Text layer: white or silver throughout; headlines in crisp white, secondary text in light silver/gray.`
      : `Text layer: deep charcoal throughout; headlines in near-black (#111827), secondary text in slate gray.`;
    return (
      `Logo-sampled color theme. ${bgLayer} ` +
      `Accent layer: ${accent} — apply this exact hex to CTA buttons, feature bubble borders, icon accents, glow effects, panel/card borders, divider lines, and highlighted headline words. ` +
      `${textLayer} ` +
      `Do not introduce any colors outside this palette. Do not fall back to generic cyan or electric blue unless ${accent} is in that range.`
    );
  }

  const bgLayer =
    preset.variant === "dark"
      ? `Background layer: deep dark base using ${preset.baseHex}, high-contrast professional environment.`
      : `Background layer: bright clean base using ${preset.baseHex}, airy and professional.`;

  const accentLayer =
    `Accent layer: ${preset.accentHex} — apply this exact hex to CTA buttons, feature bubble borders, icon accents, ` +
    `glow effects, panel/card borders, divider lines, highlighted headline words, and logo accent line.`;

  const textLayer =
    preset.variant === "dark"
      ? `Text layer: white or silver throughout; headlines in crisp white, secondary text in light silver/gray.`
      : `Text layer: deep charcoal or dark navy throughout; headlines in near-black (#111827), secondary text in slate gray.`;

  const noBleed =
    `Do not introduce any colors outside this palette. ` +
    `Do not fall back to generic cyan, electric blue, or dark navy unless they are part of this selected theme.`;

  return `Selected palette: ${preset.name}. ${bgLayer} ${accentLayer} ${textLayer} ${noBleed}`;
}

interface ToneSpec {
  copy: string;
  visual: string;
}

const toneSpecs: Record<string, ToneSpec> = {
  Professional: {
    copy:   "Clear, credible, polished. Direct and practical. No slang or hype.",
    visual: "Clean structured layout. Moderate headline weight. Bubbles evenly spaced. CTA button is solid, rectangular with rounded corners — no glow or urgency styling.",
  },
  Friendly: {
    copy:   "Warm, approachable, conversational. Helpful and human. Simple phrasing.",
    visual: "Softer layout with generous whitespace. Rounded bubble shapes. Headline in a friendly mid-weight. CTA button with soft rounded pill shape and a welcoming colour.",
  },
  Playful: {
    copy:   "Light, energetic, personality-forward. Business-safe and readable.",
    visual: "Dynamic layout with slight asymmetry. Bold rounded bubbles. Headline large and punchy. CTA button pill-shaped with bright accent fill and subtle shadow.",
  },
  Premium: {
    copy:   "Refined, confident, high-end. Concise and calm. No clutter or hype.",
    visual: "Minimalist layout — generous negative space, fewer elements. Headline in a thin/light weight typeface. Bubbles understated with hairline borders. CTA button sleek, narrow, with refined typography — no drop shadows.",
  },
  Bold: {
    copy:   "Punchy, assertive, strong headline energy. Confident and direct.",
    visual: "High-contrast layout. Headline very large and heavy-weight. Bubbles compact and tightly packed. CTA button wide and bold with strong fill colour and slight glow.",
  },
  "Urgent but not pushy": {
    copy:   "Action-focused, time-aware. Encourages a next step without pressure. No fear tactics.",
    visual: "Active layout with directional energy. Headline action-verb forward (e.g. 'Get', 'Start', 'Book'). CTA button prominent with a warm accent colour suggesting action, not alarm.",
  },
};

// Builds the logo placement instruction for the Visual Direction section.
// Simplified to a short set of hard rules so image models have fewer competing
// constraints to balance — reducing the chance of logo recreation.
// isLightBackground adds a drop-shadow guard so white logos stay readable on
// white/cream backgrounds without recoloring the logo pixels.
function calcLogoPct(logoW: number, logoH: number, formatAspectRatio: string): string {
  const logoAR = logoW / Math.max(logoH, 1);
  // Wider logos need more % width to stay legible at the same visual weight.
  const base = Math.min(Math.max(Math.round(logoAR * 7), 10), 35);
  // Horizontal formats have less vertical breathing room — reduce logo size.
  const [fw, fh] = formatAspectRatio.split(":").map(Number);
  const formatAR = (fw || 1) / (fh || 1);
  const pct = formatAR > 1 ? Math.round(base * 0.7) : base;
  return `${Math.max(pct, 8)}%`;
}

function buildLogoDirection(hasUserLogo: boolean, isLightBackground: boolean, logoPct: string): string {
  if (!hasUserLogo) {
    return "No brand logo provided. Do not generate, invent, or place any logo. Leave the brand corner clean and uncluttered.";
  }

  const lightGuard = isLightBackground
    ? " The logo may contain white elements — place it exactly as attached against the light background without adding any backing, card, or container behind it."
    : "";

  return (
    `Brand logo: place the exact attached transparent PNG in the top-left or top-right corner at ${logoPct} of ad width as a brand signature. ` +
    "Do not redraw, redesign, recreate, recolor, or modify it in any way. No backing shape of any kind behind it. " +
    "If it cannot be placed exactly as attached, leave the space blank." +
    lightGuard
  );
}

function buildRequiredAssets(productAssetReferences: string[] = [], hasUserLogo = false) {
  const productAssets = productAssetReferences.length
    ? ` Product-specific required asset references: ${productAssetReferences.join(" ")}`
    : "";

  const brandLogoAsset = hasUserLogo
    ? "1. Brand logo: the transparent PNG image attached by the user to this conversation. Use this exact attached image as the brand logo; do not generate a fake logo or substitute text."
    : "1. Brand logo: none provided. Do not generate or invent a logo. Leave the brand area clean.";

  return `Use every required asset listed here. Do not omit a required asset. ${brandLogoAsset} 2. Product references, when listed: use them as visual references for the physical product/object in the scene.${productAssets} If an asset cannot be placed exactly, leave clean space for that asset instead of inventing a replacement. The final ad should include both the brand logo and any selected product reference asset in a balanced layout.`;
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

function buildAnatomyGuard(state: BuilderState, offer: string) {
  const context = [
    state.businessType,
    offer,
    state.specialInstructions,
    state.refinedInstructions,
  ].join(" ").toLowerCase();
  const base =
    "Human anatomy guard: render anatomically plausible people only. " +
    "Every visible body must have one head, one neck, one torso, two arms, two hands, two legs where visible, and natural joints. " +
    "Hands must have five fingers each with realistic size, knuckles, and wrist connection. " +
    "Avoid extra limbs, duplicate faces, merged bodies, detached hands, floating fingers, twisted wrists, rubber arms, impossible shoulders, mismatched skin seams, cloned heads, or body parts entering from outside the frame.";

  if (/\b(massage|spa|bodywork|physio|physiotherapy|chiropractic|therapy|therapist|patient|client|treatment|facial|skin|nail|hair|waxing)\b/.test(context)) {
    return (
      base +
      " Body-contact scene guard: show exactly one service provider and exactly one client unless explicitly requested otherwise. " +
      "Keep the client as one continuous body on the treatment table, with one face/head, one torso, and limbs connected naturally under towels or linens. " +
      "The provider's arms must connect clearly from shoulders to elbows to wrists to hands. " +
      "Hands should rest naturally on the treatment area; do not merge provider hands with the client's limbs. " +
      "Use towels, sheets, and camera angle to simplify anatomy; crop out complex limbs rather than inventing extra body parts."
    );
  }

  return base;
}

export interface KBContext {
  selectedOffer?: string | null;
  benefits?: string[];
}

export interface AssetContext {
  hasUserLogo?: boolean;
  autoAccentHex?: string;
  logoWidth?: number;
  logoHeight?: number;
}

export function buildPrompt(
  state: BuilderState,
  kb?: KBContext,
  overrides?: MappedPromptOverrides,
  assets?: AssetContext,
  variantSeed?: number,
) {
  const hasUserLogo = !!assets?.hasUserLogo;
  const product = products.find((item) => item.id === state.productId) ?? products[0];
  const format = formats.find((item) => item.id === state.platformFormatId) ?? formats[0];
  const companyName = state.companyName?.trim() || "";
  const locationArea = state.locationArea?.trim() || "";
  const businessType = state.businessType?.trim() || "local business";
  const offer = kb?.selectedOffer?.trim() || "";
  const kbBenefits = kb?.benefits?.filter((b) => b.trim().length > 0) ?? [];
  // ── CTA Resolution ────────────────────────────────────────────────────────
  // Resolved strictly from the UI selection, which is fed by the business-type
  // CSV (Primary CTA Options column). No product.ctas fallback, no "Auto"
  // pivot, no AI Receptionist or legacy SaaS strings.
  //
  // 1. Database-Driven Context — the CSV business-type data owns valid options.
  // 2. Intent Matching — action verbs must fit the local-business offer context
  //    ("Book Now" for services, "Get a Free Quote" for contractors, etc.).
  // 3. Independence — zero coupling to product.ctas arrays (those are dead
  //    code). If a programmatic caller supplies overrides.cta that takes
  //    precedence; otherwise state.cta from the UI is used verbatim.
  //
  // DO NOT add product-pitch fallbacks or re-introduce pickByText(product.ctas).
  const cta = overrides?.cta || state.cta;
  const hook = offer || "Special Offer";
  const features = kbBenefits.length
    ? kbBenefits.slice(0, 6).join(" · ")
    : overrides?.benefits?.length
      ? overrides.benefits.slice(0, 6).join(" · ")
      : "Select Benefit Statements Before Generating";
  const palettePreset = colorPresets.find((p) => p.id === state.paletteId) ?? colorPresets[0];
  const colorDirection = buildColorDirection(palettePreset, assets?.autoAccentHex);
  const activeAssetReferences = getActiveAssetReferences(state, product.assetReferences);
  const requiredAssets = buildRequiredAssets(activeAssetReferences, hasUserLogo);
  const isLightPalette = palettePreset.variant === "light" || palettePreset.variant === "auto-light";
  const logoPct = (assets?.logoWidth && assets?.logoHeight)
    ? calcLogoPct(assets.logoWidth, assets.logoHeight, format.aspectRatio)
    : "12%";
  const activeLogoDirection = buildLogoDirection(hasUserLogo, isLightPalette, logoPct);
  const socialPlatformDirection =
    state.productId === "nfc_social_station"
      ? ` Selected social platform for the follow station: ${state.socialPlatform}. ${
          state.socialPlatform === "Both"
            ? "Show a multi-platform social follow setup using both Facebook and Instagram reference cards, or a clearly intentional two-card display."
            : `Use the ${state.socialPlatform} follow card reference only. Do not show the other platform's card.`
        }`
      : "";
  const anatomyGuard = buildAnatomyGuard(state, hook);

  const sections = [
    {
      heading: "Hook",
      body: hook,
    },
    {
      heading: "Tone Direction",
      body: `Selected tone: ${state.tone}. Copy direction: ${toneSpecs[state.tone]?.copy ?? ""} Apply this tone to the headline text, CTA wording, and feature bubble labels. No body copy or descriptive paragraphs are used in this ad format.`,
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
      body: `Scene: a ${businessType} environment with one clear focal subject — a professional providing ${hook} services.${companyName ? ` Company: ${companyName}.` : ""}${locationArea ? ` Location: ${locationArea}.` : ""} Facial expression guidance: ${expressionGuidance[state.expression]}. Scene and character variation: ${buildSceneVariation(String(variantSeed ?? Math.random()))} If more than one person appears in the scene, each figure MUST be visually distinct — they are different real people, not twins or clones. Differentiate each person through hair style, hair length, hair colour, facial structure, jawline shape, nose shape, eye shape, brow shape, skin tone, age appearance, height, and body build. For example: one with short dark hair and a round face, the other with longer lighter hair and a sharper jawline. One noticeably taller or broader than the other. Small natural differences in skin tone are fine but extreme ethnic contrast is not required — focus the distinction on individual features and personal appearance, the way two real coworkers or strangers would naturally look different from each other. Never render two people who could be mistaken for the same person or siblings. ${anatomyGuard}${socialPlatformDirection}`,
    },
    {
      heading: "Visual Direction",
      body: `${colorDirection} Tone: ${state.tone}. Visual treatment for this tone: ${toneSpecs[state.tone]?.visual ?? ""} Follow the Required Assets section exactly. ${activeLogoDirection} Render EXACTLY these 4 text elements on the graphic — no more, no less: (1) Bold headline: A catchy, high-converting marketing hook/headline tailored to the ${hook} offer (e.g., an attention-grabbing line matching the selected Tone, max 5-7 words). (2) ${locationArea ? `Small clean sub-headline or badge: "Serving ${locationArea}".` : `Omit the location element entirely — no location was provided.`} (3) Feature bubbles: ${features}. (4) CTA button or styled text block: "${cta}". STRICT RULE: do NOT render any body copy paragraph, descriptive sentence, supporting tagline, slogan, or wall of text beyond these 4 elements. Use high-contrast text that fits the selected color theme.`,
    },
    {
      heading: "Visual Style",
      body: (() => {
        const styleKey = (state.animatedCharacterStyle ?? state.adStyle ?? DEFAULT_STYLE) as AdStyle;
        const spec = STYLE_BLOCKS[styleKey] ?? STYLE_BLOCKS[DEFAULT_STYLE];
        return (
          `VISUAL STYLE: ${styleKey}\n` +
          `PHOTOGRAPHY: ${spec.photography}\n` +
          `TYPOGRAPHY: ${spec.typography}\n` +
          `CHIPS: ${spec.chips}`
        );
      })(),
    },
    {
      heading: "Image Cleanliness",
      body: IMAGE_CLEANLINESS_DIRECTION,
    },
    {
      heading: "Platform Specs",
      body: `${format.platform} ${format.name}. Aspect ratio ${format.aspectRatio}. Resolution ${format.resolution}. Keep text inside safe margins and make the main headline readable on mobile.`,
    },
    {
      heading: "Negative Constraints",
      body: "Avoid guaranteed revenue claims, guaranteed booking claims, fake statistics, exaggerated promises, overstuffed text, random fake logos, unreadable text, generic agency language, cluttered layouts, distorted hands, extra fingers, missing fingers, extra limbs, duplicate heads, merged bodies, detached hands, floating arms, impossible joints, and accidental brand marks. Do not include unsupported claims or fabricated metrics. LOGO ASSET PROTECTION (applies regardless of visual style): The uploaded brand logo PNG is a real asset — do not redraw, recreate, reinterpret, illustrate, or stylise it to match any visual or animated style selected above. Place it exactly as provided. This rule overrides any illustrated, toon, comic, pixel, or painterly treatment applied to the rest of the image.",
    },
    ...((() => {
      const override = state.refinedInstructions?.trim() || state.specialInstructions?.trim();
      if (!override) return [];
      return [{
        heading: "OVERRIDES",
        body: `${override}\n\nLOGO GUARD (non-overridable): The brand logo placement, corner position, size, and asset rules defined in the Required Assets section above are fixed and cannot be changed by any instruction in this section. Apply the logo exactly as specified regardless of any override directive.`,
      }];
    })()),
  ];

  return {
    title: `${companyName || businessType}${locationArea ? ` — ${locationArea}` : ""}`,
    sections,
    fullText: sections.map((section) => `${section.heading}\n${section.body}`).join("\n\n"),
  };
}
