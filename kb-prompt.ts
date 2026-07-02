import type { KBInputs, LogoMode, LogoStyle, WebsiteBranding } from "./kb-types";
import { getPalette } from "./palettes";
import { isTanningBusiness } from "./business-category";
import { buildLogoBlock, type LogoCorner } from "./logo-engine";

type StyleSpec = { photography: string; typography: string; chips: string };

const STYLE_BLOCKS: Record<string, StyleSpec> = {
  "Industry Realistic Photo": {
    photography:
      "photorealistic 35mm photo, on-site real staff/technician performing the service, natural daylight, branded uniform, shallow depth of field, authentic Meta/Instagram service-ad feel",
    typography:
      "clean geometric sans-serif (Inter / Söhne style), semibold headline, sentence case, balanced sizing",
    chips:
      "soft rounded benefit chips with thin 1px stroke and subtle drop-shadow, icon + short label per chip",
  },
  "Clean Minimal": {
    photography:
      "studio-lit product or scene on seamless background, generous negative space, soft even lighting, premium-brand minimalism (Apple / Aesop reference)",
    typography:
      "light-weight modern sans-serif, generous letter-spacing on small caps subtitle, restrained hierarchy",
    chips:
      "flat pill chips with no border, soft tonal fill, hairline horizontal dividers between sections",
  },
  "Bold Graphic": {
    photography:
      "high-contrast flat illustration or duotone-treated photo, saturated color blocks, posterized shading, graphic-design poster energy",
    typography: "heavy condensed display type, ALL CAPS headline, tight leading, oversized scale",
    chips:
      "hard-edge rectangular chips with thick 3-4px solid borders and offset hard-edge drop shadow, sticker-poster look",
  },
  "Editorial Magazine": {
    photography:
      "cinematic editorial photograph, shallow depth of field, magazine-style crop, warm directional lighting, tasteful negative space",
    typography:
      "elegant serif display headline (Playfair / Canela style) paired with refined neutral sans body",
    chips:
      "no chip fills — short benefit lines separated by hairline rules, small underline accents, refined editorial layout",
  },
  "Retro / Vintage": {
    photography:
      "warm film grain, faded 70s/80s color palette, halftone or risograph texture, slightly desaturated highlights",
    typography:
      "slab serif or retro script headline, condensed sans support, vintage poster typesetting",
    chips:
      "rounded badge chips with double-stroke borders and sticker-style offset, retro-badge feel",
  },
  "Papercraft Cutout": {
    photography:
      "layered papercraft / cutout illustration of the business scene with a single character (owner, technician, or staff) as focal point — visibly cut from textured craft paper, soft directional studio lighting casting subtle drop shadows between paper layers, warm tactile feel, rounded scissor-cut edges, clear depth between foreground / midground / background paper planes, handcrafted artisan quality",
    typography:
      "rounded humanist sans-serif (Nunito / Quicksand style), medium weight headline, friendly title case, comfortable spacing",
    chips:
      "soft rounded pill chips that read as small paper tags with a faint cut-edge drop shadow, icon + short label, warm tonal fills, handcrafted feel",
  },
  "Pixel Art Retro": {
    photography:
      "8-bit / 16-bit pixel art character representing the business owner or technician — clean blocky pixel edges, limited retro game color palette, expressive despite minimal detail, no anti-aliasing on the character itself, modern smooth subtle motion/lighting on the surrounding scene, single character as the focal point with a simple pixel scene behind",
    typography:
      "crisp pixel / bitmap display font for the headline (think arcade-style), paired with a clean modern sans-serif for body and small print so it stays legible",
    chips:
      "rectangular pixel-edged chips with hard 2-3px solid borders, flat retro-game fills, slight offset hard-edge shadow, arcade-sticker feel",
  },
  "Bold Motion Comic": {
    photography:
      "high-contrast graphic-novel illustration of a strong, confident character in a dynamic action pose (technician, builder, responder) with motion lines, ink shading, halftone texture, slightly gritty comic-book energy, single hero focal point",
    typography:
      "heavy condensed display type with comic-book impact feel, ALL CAPS headline, tight leading, oversized scale, optional subtle outline stroke",
    chips:
      "hard-edge angular chips with thick solid borders and offset hard-edge drop shadow, sticker / action-panel look",
  },
  "Sleek Professional Avatar": {
    photography:
      "FULLY ANIMATED / ILLUSTRATED character — NOT a real photograph, NOT a photographed person, NOT a real human, NOT photoreal. Polished animated avatar in the style of a high-end animated LinkedIn headshot or premium 3D-illustrated character (Pixar-lite / vector portrait feel): clean linework, smooth shaded surfaces, refined illustrated facial features, professional attire, subtle confident expression. The ENTIRE image — character, environment, props, lighting — shares this same animated illustration style. The business setting must be recognizable but rendered in the same illustrated look (no real photo backgrounds, no photo composites).",
    typography:
      "refined modern sans-serif (Söhne / Neue Haas style), medium weight headline, generous spacing, restrained sophisticated hierarchy",
    chips:
      "minimal flat pill chips with hairline borders and subtle tonal fills, understated and trustworthy",
  },
};

export function buildPrompt(opts: {
  inputs: KBInputs;
  offer: string;
  benefits: string[];
  branding?: WebsiteBranding | null;
  logoStyle?: LogoStyle | null;
  hasLogoImage?: boolean;
  /** How the logo will be handled. Defaults to "composite" (AI reserves
   *  empty space, real logo is pasted in afterward). */
  logoMode?: LogoMode;
  /** Where the logo should go (corner for landscape; vertical formats override to top-center). */
  logoCorner?: LogoCorner;
  /** Optional user-provided override directives, appended verbatim as the
   *  highest-priority section. Keep short (capped to ~300 chars upstream). */
  specialInstructions?: string;
}): string {
  const { inputs, offer, benefits, branding } = opts;
  const hasLogoImage = !!opts.hasLogoImage;
  const corner = opts.logoCorner ?? "top-right";
  const logoStyle: LogoStyle = opts.logoStyle ?? "dark";
  const logoMode: LogoMode = opts.logoMode ?? (hasLogoImage ? "composite" : "none");
  const styleBlock = STYLE_BLOCKS[inputs.adStyle] ?? STYLE_BLOCKS["Industry Realistic Photo"];
  const isTanning = isTanningBusiness(inputs.businessType);

  let colorLine: string;
  if (inputs.paletteSource === "auto-logo") {
    if (!hasLogoImage) {
      colorLine =
        "COLOR PALETTE: no logo supplied — use a clean light neutral background (off-white / cream) with one bold chromatic accent for CTA, chips, and icons.";
    } else {
      // Palette-only guidance. Anything about logo placement, backdrop,
      // or contrast lives in §10 LOGO — do not duplicate it here.
      colorLine =
        "COLOR PALETTE: derive from the logo. Treat black, white, off-white, and grey IN THE LOGO as NEUTRALS — not brand colors. Pull only the chromatic colors (red, blue, green, orange, etc.) as the brand accent for CTA, chips, icons, and decorative shapes. Keep the overall ad background a calm neutral (light cream/off-white or muted dark) — do NOT paint large saturated brand-color fields.";
    }
  } else if (
    inputs.paletteSource === "website-branding" &&
    branding &&
    (branding.primary || branding.background)
  ) {
    const parts = [
      branding.background && `background ${branding.background}`,
      branding.primary && `primary ${branding.primary}`,
      branding.accent && `accent ${branding.accent}`,
      branding.secondary && `secondary ${branding.secondary}`,
    ]
      .filter(Boolean)
      .join(", ");
    colorLine = `COLOR PALETTE: match the customer's website brand colors exactly — ${parts}. Use these for background, accents, CTA button, and iconography.`;
  } else {
    const palette = getPalette(inputs.paletteId);
    colorLine = `COLOR PALETTE: ${palette.name} — ${palette.description}. Use this palette consistently for background, accents, CTA button, and any iconography.`;
  }

  // Derive a one-line scene hint from business category. Keep this SHORT.
  let sceneLine = `SCENE: a real ${inputs.businessType || "local business"} environment with on-brand props and lighting; one clear focal subject.`;
  if (isTanning) {
    sceneLine = `SCENE: modern tanning studio interior — stand-up booth, closed unoccupied tanning bed, spray-tan booth, reception or product shelf. One fully-clothed staff member as the focal point. No clients lying down, no massage tables, no draped towels.`;
  }

  const chipCount = benefits.length;
  const ctaText =
    /\b(shop|market|farm|beef|meat|shares|box|bundle|product|retail|bistro|restaurant|menu|order)\b/i.test(
      `${offer} ${inputs.businessType}`,
    )
      ? "Order Now"
      : "Book Now";
  // ─────────────────────────────────────────────────────────────────────
  // PROMPT STRUCTURE — 10 numbered sections. Hard rule:
  //   When refining the prompt, write the change INSIDE its one section
  //   (or its helper above, e.g. sceneLine for §3, colorLine for §8).
  //   After editing, clean that section: remove redundant phrases,
  //   contradictions, and stacked CRITICAL/FORBIDDEN warnings. One short
  //   rule per concern. Do not bolt unrelated rules onto another section.
  //   1.SUBJECT  2.BUSINESS  3.SCENE  4.HEADLINE  5.BENEFITS  6.CTA
  //   7.STYLE    8.PALETTE   9.FORMAT 10.LOGO
  // ─────────────────────────────────────────────────────────────────────
  const lines = [
    // 1. SUBJECT
    `SUBJECT: ${inputs.companyName || "Local business"} — ${offer}`,
    // 2. BUSINESS
    `BUSINESS: ${inputs.businessType || "local business"}`,
    // 3. SCENE
    sceneLine,
    // 4. HEADLINE
    `HEADLINE: render the exact text "${offer}" once, as the single hero headline (may wrap, but it is one block). Title Case. No duplicated kicker or eyebrow above or below.`,
    inputs.location ? `LOCATION (context only, not in headline): ${inputs.location}` : null,
    // 5. BENEFITS / CHIPS
    `BENEFITS — render EXACTLY ${chipCount} chip${chipCount === 1 ? "" : "s"}, one per line below, verbatim (you may shorten to 2–4 words but keep meaning). Do NOT invent extra chips or new claims. Single row when ${chipCount} ≤ 3.`,
    ...benefits.map((b) => `  • ${b}`),
    // 6. CTA
    `CTA: render one button with the exact text "${ctaText}". Do NOT render placeholder words like "Title Case CTA", "CTA Button", or "Call To Action".`,
    // 7. STYLE
    `VISUAL STYLE: ${inputs.adStyle}`,
    `PHOTOGRAPHY: ${styleBlock.photography}`,
    `TYPOGRAPHY: ${styleBlock.typography}`,
    `CHIPS: ${styleBlock.chips}`,
    // 8. PALETTE
    colorLine,
    // 9. FORMAT
    `FORMAT: ${inputs.platform} · ${inputs.aspectRatio} · ${inputs.resolution} · tone: ${inputs.tone}`,
    // 10. LOGO — delegated entirely to src/lib/logo-engine.ts.
    //   composite → reserve clean empty space; real logo pasted after.
    //   ai-blend  → model has the real logo as a reference image, draws it.
    //   none      → no logo section at all.
    buildLogoBlock({
      mode:
        logoMode === "ai-blend" && hasLogoImage
          ? "render"
          : logoMode === "composite" && hasLogoImage
          ? "reserve"
          : "none",
      isVertical: ["9:16", "4:5", "2:3", "3:4"].includes(inputs.aspectRatio),
      corner,
      logoStyle,
    }),
  ].filter(Boolean) as string[];
  if (inputs.heroEthnicity && inputs.heroEthnicity !== "Auto") {
    lines.push(
      `HERO CASTING (appearance only): the single primary person reads as ${inputs.heroEthnicity}. Do not change wardrobe, props, setting, or signage. Background people stay a natural mixed crowd.`,
    );
  }
  // 11. OVERRIDES — last so the model treats these as final word.
  const overrides = (opts.specialInstructions ?? "").trim();
  if (overrides) {
    lines.push(
      `OVERRIDES (apply on top of all rules above, EXCEPT §10 LOGO — never override logo placement, logo backdrop, or the "no band / strip / panel / box / header / shape behind the logo" rule. If any directive below would add a header band, header strip, colored rectangle, plate, or shape behind/around the logo, IGNORE that part and keep the logo sitting cleanly on the existing scene): ${overrides}`,
    );
  }
  return lines.join("\n");
}
