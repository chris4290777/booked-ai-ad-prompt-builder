export type SavedCommunicationCombo = {
  id: string;
  name: string;
  offer: string;
  benefits: string[];
  cta: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "aipb-saved-communication-combos";

function safeParseCombos(raw: string | null): SavedCommunicationCombo[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((combo): combo is SavedCommunicationCombo =>
      combo &&
      typeof combo.id === "string" &&
      typeof combo.name === "string" &&
      typeof combo.offer === "string" &&
      Array.isArray(combo.benefits) &&
      typeof combo.cta === "string",
    );
  } catch {
    return [];
  }
}

export function loadSavedCommunicationCombos(): SavedCommunicationCombo[] {
  return safeParseCombos(localStorage.getItem(STORAGE_KEY));
}

export function persistSavedCommunicationCombos(combos: SavedCommunicationCombo[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(combos));
}

export function createSavedCommunicationCombo(input: {
  name: string;
  offer: string;
  benefits: string[];
  cta: string;
}): SavedCommunicationCombo {
  const now = new Date().toISOString();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    name: input.name,
    offer: input.offer,
    benefits: input.benefits,
    cta: input.cta,
    createdAt: now,
    updatedAt: now,
  };
}
