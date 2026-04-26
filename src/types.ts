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
};

export type BuilderState = {
  productId: string;
  industry: string;
  tone: string;
  visualStyle: string;
  platformFormatId: string;
  cta: string;
  expression: string;
  imageSource: "Generate new image" | "Upload own image";
};

export type PlatformFormat = {
  id: string;
  platform: "Facebook" | "Instagram";
  name: string;
  aspectRatio: string;
  resolution: string;
};
