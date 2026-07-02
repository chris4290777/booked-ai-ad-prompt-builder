// ─── Import Mapper ───────────────────────────────────────────────────────────
// Maps pasted JSON business data into prompt-ready fields.
// All fields are optional — missing fields fall back to empty string or safe defaults.
// This file does NOT modify prompt-builder.ts or any rendering logic.

export interface ImportedBusinessData {
  businessName?: string;
  offer?: string;
  hook?: string;
  benefits?: string[];
  painPoints?: string[];
  solutionLines?: string[];
  cta?: string;
}

export interface MappedPromptOverrides {
  businessName: string;
  offer: string;
  hook: string;
  benefits: string[];
  painPoints: string[];
  solutionLines: string[];
  cta: string;
}

export function parseImportedData(raw: string): { data: MappedPromptOverrides | null; error: string | null } {
  if (!raw.trim()) return { data: null, error: null };

  try {
    const parsed: ImportedBusinessData = JSON.parse(raw);

    const data: MappedPromptOverrides = {
      businessName: parsed.businessName ?? "",
      offer:        parsed.offer        ?? "",
      hook:         parsed.hook         ?? "",
      benefits:     Array.isArray(parsed.benefits)     ? parsed.benefits     : [],
      painPoints:   Array.isArray(parsed.painPoints)   ? parsed.painPoints   : [],
      solutionLines:Array.isArray(parsed.solutionLines)? parsed.solutionLines: [],
      cta:          parsed.cta          ?? "",
    };

    return { data, error: null };
  } catch {
    return { data: null, error: "Invalid JSON — check your formatting and try again." };
  }
}
