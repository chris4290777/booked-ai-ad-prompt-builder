export type Product = {
  id: string;
  name: string;
  positioning: string;
  hooks: string[];
  painPoints: string[];
  solutionLines: string[];
  featureBubbles: string[];
  ctas: string[];
  visualDirection: string;
  imagePromptLogic: string;
  assetReferences?: string[];
};

export type BuilderState = {
  mode: "ad" | "ad-manual" | "blog";
  productId: string;
  industry: string;
  tone: string;
  paletteId: string;
  platformFormatId: string;
  cta: string;
  expression: string;
  imageSource: "Generate new image" | "Upload own image";
  socialPlatform: "Instagram" | "Facebook" | "Both";
  websiteUrl?: string;
  companyName?: string;
  locationArea?: string;
  businessType?: string;
  adStyle?: string;
  animatedCharacterStyle?: string;
  specialInstructions?: string;
  refinedInstructions?: string;
  blogImagePurpose?: string;
  blogSectionText?: string;
  blogAudienceContext?: string;
  blogHeroLine?: string;
  blogSceneDirection?: string;
  blogIncludeText?: boolean;
  blogIncludeLogo?: boolean;
};

export type PlatformFormat = {
  id: string;
  platform: "Facebook" | "Instagram" | "LinkedIn" | "Threads" | "X";
  name: string;
  aspectRatio: string;
  resolution: string;
};
