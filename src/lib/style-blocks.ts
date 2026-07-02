export type AdStyle =
  | "Industry Realistic Photo"
  | "Clean Minimal"
  | "Bold Graphic"
  | "Editorial Magazine"
  | "Retro / Vintage"
  | "Papercraft Cutout"
  | "Pixel Art Retro"
  | "Bold Motion Comic"
  | "Sleek Professional Avatar"
  | "Soft Toon Portrait";

export interface StyleSpec {
  subtitle: string;
  photography: string;
  typography: string;
  chips: string;
}

export const STYLE_BLOCKS: Record<AdStyle, StyleSpec> = {
  "Industry Realistic Photo": {
    subtitle: "Photoreal, on-site, natural light",
    photography:
      "35mm photorealistic shot of real staff on-site, natural daylight, branded uniform, shallow DOF, Instagram-ad authenticity",
    typography:
      "Clean geometric sans (Inter/Söhne), semibold headline, sentence case, balanced sizing",
    chips:
      "Soft rounded benefit chips with thin 1px stroke and subtle drop-shadow",
  },
  "Clean Minimal": {
    subtitle: "Studio, negative space, light type",
    photography:
      "Studio-lit product/scene on seamless background, generous negative space, soft even light, Apple/Aesop minimalism",
    typography:
      "Light-weight modern sans, generous letter-spacing on small caps, restrained hierarchy",
    chips: "Flat pill chips with no border, soft tonal fill, hairline dividers",
  },
  "Bold Graphic": {
    subtitle: "High energy, bold type, hard-edge chips",
    photography:
      "Vivid full-color high-energy photograph; bold dynamic composition with strong directional light; graphic-poster layout energy applied to the overall ad design — keep the photo full-color and scene-authentic, not duotone or desaturated",
    typography:
      "Heavy condensed display type, bold oversized headline in title case, tight leading, large impactful scale",
    chips:
      "Hard-edge rectangles with thick 3–4px solid borders and offset hard shadow, sticker-poster look",
  },
  "Editorial Magazine": {
    subtitle: "Cinematic photo + serif headline",
    photography:
      "Cinematic editorial photograph, shallow DOF, magazine crop, warm directional light, tasteful negative space",
    typography:
      "Elegant serif display headline (Playfair/Canela) paired with refined neutral sans body",
    chips:
      "No chip fills — short benefit lines separated by hairline rules, small underlines, refined layout",
  },
  "Retro / Vintage": {
    subtitle: "Warm grain, slab/script, sticker chips",
    photography:
      "Warm film grain, faded 70s/80s palette, halftone/risograph texture, slightly desaturated highlights",
    typography:
      "Slab serif or retro script headline, condensed sans support, vintage poster typesetting",
    chips: "Rounded badge chips with double-stroke borders and sticker-style offset",
  },
  "Papercraft Cutout": {
    subtitle: "Layered paper scene, textured craft",
    photography:
      "Layered papercraft scene with one paper-cut character as focal point, textured craft paper, soft studio lighting, rounded scissor-cut edges, clear depth between planes",
    typography:
      "Rounded humanist sans (Nunito/Quicksand), medium weight, friendly title case",
    chips:
      "Soft rounded pill chips as small paper tags with faint cut-edge shadow, warm tonal fills",
  },
  "Pixel Art Retro": {
    subtitle: "8-bit/16-bit character, arcade palette",
    photography:
      "8-bit/16-bit pixel art character as focal point, clean blocky edges, limited retro palette, no anti-aliasing on character, modern smooth lighting on surrounding scene",
    typography:
      "Crisp pixel/bitmap display font for headline (arcade-style), clean modern sans for body",
    chips:
      "Rectangular pixel-edged chips with hard 2–3px borders, flat retro-game fills, arcade-sticker shadow",
  },
  "Bold Motion Comic": {
    subtitle: "Graphic novel, ink shading, motion lines",
    photography:
      "High-contrast graphic-novel illustration of a confident character in dynamic action pose, motion lines, ink shading, halftone texture, gritty comic energy",
    typography:
      "Heavy condensed display type with comic-book impact, ALL CAPS, tight leading, oversized, optional outline stroke",
    chips:
      "Hard-edge angular chips with thick solid borders and offset hard shadow, action-panel look",
  },
  "Sleek Professional Avatar": {
    subtitle: "Animated/illustrated avatar, Pixar-lite",
    photography:
      "Fully animated/illustrated character — NOT photoreal. Polished animated avatar (Pixar-lite / vector portrait), smooth shaded surfaces, professional attire. Entire image shares this illustrated look, no photo composites",
    typography:
      "Refined modern sans (Söhne/Neue Haas), medium weight, generous spacing, restrained sophisticated hierarchy",
    chips:
      "Minimal flat pill chips with hairline borders and subtle tonal fills, understated and trustworthy",
  },
  "Soft Toon Portrait": {
    subtitle: "Warm, approachable, expressive",
    photography:
      "Polished soft-toon character illustration — NOT photoreal, NOT flat vector, NOT children's cartoon. Warm approachable facial features, expressive believable eyes, soft painterly shading, smooth colour transitions, subtle dimensional modelling, clean refined edges, gentle cinematic lighting. Character adapts to business context: appropriate clothing, tools, and environment. Background rendered with softened illustrated treatment; subject remains clear focal point. Avoid heavy ink outlines, halftone, clay/plasticine look, caricature proportions, or imitation of any named studio or franchise.",
    typography:
      "Friendly rounded sans (Nunito/Quicksand), medium-bold weight, warm approachable hierarchy, generous spacing",
    chips:
      "Soft rounded pill chips with warm tonal fills and gentle drop-shadow, friendly and approachable",
  },
};

export const DEFAULT_STYLE: AdStyle = "Industry Realistic Photo";

// These four styles are surfaced as Animated Character Style cards, not in the Visual Style dropdown.
const ANIMATED_STYLE_IDS: AdStyle[] = [
  "Sleek Professional Avatar",
  "Bold Motion Comic",
  "Pixel Art Retro",
  "Papercraft Cutout",
  "Soft Toon Portrait",
];

export const AD_STYLES: { value: AdStyle; subtitle: string }[] = (
  Object.entries(STYLE_BLOCKS) as [AdStyle, StyleSpec][]
)
  .filter(([value]) => !ANIMATED_STYLE_IDS.includes(value as AdStyle))
  .map(([value, spec]) => ({ value, subtitle: spec.subtitle }));

export interface AnimatedCharStyle {
  id: AdStyle;
  label: string;
  description: string;
  thumbnail: string;
}

export const ANIMATED_CHARACTER_STYLES: AnimatedCharStyle[] = [
  {
    id: "Soft Toon Portrait",
    label: "Soft Toon Portrait",
    description: "Warm, approachable, expressive",
    thumbnail: "/thumbnails/soft-toon.png",
  },
  {
    id: "Pixel Art Retro",
    label: "Pixel Art Retro",
    description: "8-bit blocky, arcade aesthetic",
    thumbnail: "/thumbnails/pixel-art.png",
  },
  {
    id: "Bold Motion Comic",
    label: "Bold Motion Comic",
    description: "Graphic-novel hero, energetic",
    thumbnail: "/thumbnails/comic.png",
  },
  {
    id: "Sleek Professional Avatar",
    label: "Pro Avatar",
    description: "Polished animated headshot",
    thumbnail: "/thumbnails/avatar.png",
  },
];
