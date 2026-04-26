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
};

const logoDirection =
  "Use the attached Booked AI Systems transparent PNG logo asset as part of the finished ad design. Assume the logo PNG is attached with this prompt. Treat the logo as a subtle brand signature, not a hero element: it should support the ad, never compete with the headline, people, CTA, phone, card, or main offer. Integrate the logo so it feels intentionally designed into the layout, not pasted on top as an afterthought: align it to the ad grid, place it in clean negative space, balance it with the headline and CTA, and let the surrounding lighting/glow/shadow match the ad theme. The correct logo asset is the wide horizontal transparent PNG with the automation/gear/checkmark icon system on the left and the two-line text \"Booked\" and \"AI Systems\" on the right. Logo size must be restrained and professional: about 8% to 12% of the ad width, never a large badge, dominant headline element, or main visual focus. Match the logo's white text to the same white used in the ad typography so it belongs to the same design system. Keep the PNG background fully transparent. Do not put the logo inside any black box, white box, rounded rectangle, plaque, badge, button, border, panel, or container. Add only a tasteful drop shadow and soft glow that follows the transparent logo edges/alpha channel, like light behind the actual logo shapes, not a rectangular glow or boxed background. Preserve the logo proportions and transparent edges. Keep most logo text matched to the ad's typography white, but recolor exactly one of the two text lines, either \"Booked\" or \"AI Systems\", with one accent color from the selected ad theme such as electric blue, cyan, or the theme's strongest highlight color. Do not recolor the whole logo, and do not color both text lines. Do not add any tagline, slogan, small caption, extra brand text, footer brand lockup, or generated words under, beside, or elsewhere duplicating the logo. The logo must not cover, overlap, obscure, or touch any person's face, body, hands, phone, business card, or key product object. Do not generate, redraw, imitate, simplify, or replace the logo. Do not use fake brand text, a standalone B icon, or a placeholder logo.";

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

  const sections = [
    {
      heading: "Hook",
      body: hook,
    },
    {
      heading: "Body Copy",
      body: `${pain} ${solution} Keep the copy clear, direct, modern, and not hype-heavy for a ${state.industry}. Use approved hedged language such as "helps reduce", "supports faster response", "helps capture more opportunities", and "helps customers take action".`,
    },
    {
      heading: "CTA",
      body: cta,
    },
    {
      heading: "Logo Treatment",
      body: `${logoDirection} Required source asset: the attached Booked AI Systems transparent white PNG logo. Use that exact attached logo asset, and position it only where it can sit naturally in the design without covering people or important objects.`,
    },
    {
      heading: "Image Prompt",
      body: `${product.imagePromptLogic} Industry context: ${state.industry}. Facial expression guidance: ${expressionGuidance[state.expression]}. Image source mode: ${state.imageSource}.`,
    },
    {
      heading: "Visual Direction",
      body: `${product.visualDirection} ${visualStyle} ${logoDirection} Add clean overlay space for one headline, one short supporting line, feature bubbles reading "${features}", and the Booked AI Systems brand name. Use white text with strong contrast and cyan/electric-blue accents where appropriate.`,
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
