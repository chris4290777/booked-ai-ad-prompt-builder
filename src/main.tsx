import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Check, ChevronDown, Clipboard, Moon, Palette, RefreshCw, Sun, X } from "lucide-react";
import "./styles.css";
import {
  aspectRatios,
  colorPresets,
  ctas,
  expressions,
  formats,
  industries,
  products,
  quickCommunicationTypes,
  tones,
  type ColorPreset,
} from "./options";
import { buildPrompt } from "./prompt-builder";
import type { BuilderState } from "./types";
import { fetchBusinessKnowledgeBase } from "./services/kbService";
import {
  createSavedCommunicationCombo,
  loadSavedCommunicationCombos,
  persistSavedCommunicationCombos,
  type SavedCommunicationCombo,
} from "./services/savedComboService";
import { AD_STYLES, ANIMATED_CHARACTER_STYLES, DEFAULT_STYLE } from "./lib/style-blocks";
import {
  normalizeLogoToPng,
  downloadNormalizedLogo,
  extractDominantAccent,
  type NormalizedLogo,
} from "./lib/logo-normalizer";

const initialState: BuilderState = {
  productId: "ai_receptionist",
  industry: "General Local Business",
  tone: "Professional",
  paletteId: "dark-blue-tech",
  platformFormatId: "ig-feed-portrait-ads",
  cta: "Learn More",
  expression: "Confident",
  imageSource: "Generate new image",
  socialPlatform: "Instagram",
  adStyle: DEFAULT_STYLE,
  websiteUrl: "",
  companyName: "",
  locationArea: "",
  businessType: "",
};

const devTestBusinessInfo: Pick<BuilderState, "websiteUrl" | "companyName" | "locationArea" | "businessType"> = {
  websiteUrl: "https://www.bookedaisystems.com/",
  companyName: "Booked Ai Systems",
  locationArea: "",
  businessType: "Digital Marketing",
};

function StyleSelect({
  value,
  onChange,
  animatedOverride,
}: {
  value: string;
  onChange: (value: string) => void;
  animatedOverride?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = AD_STYLES.find((s) => s.value === value) ?? AD_STYLES[0];
  const animLabel = animatedOverride
    ? ANIMATED_CHARACTER_STYLES.find((s) => s.id === animatedOverride)?.label ?? animatedOverride
    : undefined;

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="style-select" ref={ref}>
      <div className="style-select-label-row">
        <span className="style-select-label">Visual Style</span>
        <span className="style-select-hint">Select from the dropdown, or choose an Animated Character style below.</span>
      </div>
      <button
        type="button"
        className={`style-select-trigger${open ? " open" : ""}${animatedOverride ? " anim-override" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="style-select-trigger-text">
          {animatedOverride ? (
            <>
              <span className="style-select-trigger-name">Animated Character Chosen</span>
              <span className="style-select-trigger-sub">{animLabel}</span>
            </>
          ) : (
            <>
              <span className="style-select-trigger-name">{selected.value}</span>
              <span className="style-select-trigger-sub">{selected.subtitle}</span>
            </>
          )}
        </span>
        <ChevronDown size={15} className="style-select-chevron" />
      </button>
      {open && (
        <ul className="style-select-dropdown" role="listbox">
          {AD_STYLES.map((style) => (
            <li
              key={style.value}
              role="option"
              aria-selected={!animatedOverride && style.value === value}
              className={`style-select-option${!animatedOverride && style.value === value ? " active" : ""}`}
              onMouseDown={() => {
                onChange(style.value);
                setOpen(false);
              }}
            >
              <div className="style-select-option-text">
                <span className="style-select-option-name">{style.value}</span>
                <span className="style-select-option-sub">{style.subtitle}</span>
              </div>
              {!animatedOverride && style.value === value && <Check size={16} className="style-select-check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnimatedCharacterCards({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <div className="anim-char-section">
      <button
        type="button"
        className="anim-char-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>Animated Character Style</span>
        <ChevronDown size={16} className={`anim-char-chevron${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className="anim-char-grid">
          {ANIMATED_CHARACTER_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              className={`anim-char-card${value === style.id ? " active" : ""}`}
              onClick={() => { if (value !== style.id) onChange(style.id); }}
              title={style.label}
            >
              <div className="anim-char-thumb">
                <img
                  src={style.thumbnail}
                  alt={style.label}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              <span className="anim-char-name">{style.label}</span>
              <span className="anim-char-desc">{style.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SI_MAX = 300;
const WORKSPACE_KEY = "aipb-workspace-v3";
const LOGO_SIZE_LIMIT = 400_000; // ~300 KB raw; skip persistence above this
const WEBSITE_COMMUNICATION_TYPE_ID = "website";
const SAVED_COMBO_ID_PREFIX = "saved:";

const PANEL_ORDER = [
  { id: "business-info",        step: 1, title: "Business Information", next: "offer-benefits" },
  { id: "offer-benefits",       step: 2, title: "Offer & Benefits",     next: "brand-logo" },
  { id: "brand-logo",           step: 3, title: "Brand Logo",           next: "look-and-feel" },
  { id: "look-and-feel",        step: 4, title: "Look & Feel",          next: "ad-settings" },
  { id: "ad-settings",          step: 5, title: "Ad Settings",          next: "special-instructions" },
  { id: "special-instructions", step: 6, title: "Special Instructions", next: null },
] as const;

type PromptOutput = ReturnType<typeof buildPrompt>;
type QuickCommunicationOverride = {
  offer?: string;
  benefits?: string[];
};

function loadInitialBuilderState(): BuilderState {
  try {
    const ws = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}");
    if (ws.state) return { ...initialState, ...ws.state, specialInstructions: "", refinedInstructions: "" };
  } catch {}
  return initialState;
}

type PanelId = typeof PANEL_ORDER[number]["id"];

const LEFT_PANELS: PanelId[] = ["business-info", "brand-logo", "look-and-feel", "ad-settings", "special-instructions"];

function WFBadge({ children }: { children: React.ReactNode }) {
  return <span className="wf-badge">{children}</span>;
}

function WorkflowPanel({
  id,
  activePanelId,
  onActivate,
  onDone,
  summary,
  children,
  setPanelRef,
  hasIncomingAttention,
  doneError,
  isDone,
}: {
  id: PanelId;
  activePanelId: string;
  onActivate: () => void;
  onDone: () => void;
  summary: React.ReactNode;
  children: React.ReactNode;
  setPanelRef: (el: HTMLDivElement | null) => void;
  hasIncomingAttention?: boolean;
  doneError?: string | null;
  isDone?: boolean;
}) {
  const panel = PANEL_ORDER.find((p) => p.id === id)!;
  const isActive = activePanelId === id;

  return (
    <div
      className={`workflow-panel${isActive ? " active" : ""}${hasIncomingAttention && isActive ? " wf-incoming-attention" : ""}`}
      ref={setPanelRef}
    >
      <div
        className="workflow-panel-header"
        onClick={!isActive ? onActivate : undefined}
        role={!isActive ? "button" : undefined}
        tabIndex={!isActive ? 0 : undefined}
        onKeyDown={!isActive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); } } : undefined}
        aria-expanded={isActive}
      >
        <span className="workflow-step">{panel.step}</span>
        <span className="workflow-title">{panel.title}</span>
        {isActive
          ? <button type="button" className="workflow-done-btn" onClick={onDone}>Done</button>
          : (
            <>
              <span className={`wf-status-badge${isDone ? " wf-status-complete" : " wf-status-incomplete"}`}>
                {isDone ? "✓ Complete" : "Incomplete"}
              </span>
              <ChevronDown size={14} className="workflow-chevron" />
            </>
          )
        }
      </div>
      {!isActive && (
        <div
          className="workflow-summary"
          onClick={onActivate}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); } }}
        >
          {summary}
        </div>
      )}
      {isActive && doneError && (
        <p className="workflow-done-error">{doneError}</p>
      )}
      {isActive && (
        <div className="workflow-content">
          {children}
        </div>
      )}
    </div>
  );
}

function SpecialInstructions({
  rawText,
  refinedText,
  onRawChange,
  onRefined,
  embedded = false,
}: {
  rawText: string;
  refinedText: string;
  onRawChange: (v: string) => void;
  onRefined: (v: string) => void;
  embedded?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function handleRefine() {
    if (!rawText.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/refine-instruction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        setError("Backend needs a restart — run: node server.js in your backend terminal.");
        return;
      }
      const data = await res.json();
      if (data.refined) {
        onRefined(data.refined);
      } else {
        setError(data.error ?? "Refinement failed — raw text will be used.");
      }
    } catch {
      setError("Cannot reach backend — make sure node server.js is running on port 5001.");
    } finally {
      setLoading(false);
    }
  }

  const body = (
    <div className="si-body">
      <p className="si-hint">Describe a specific correction for the generated image. Click "Refine" to let AI rewrite it into a precise prompt directive.</p>
      <textarea
        className="si-textarea"
        maxLength={SI_MAX}
        value={rawText}
        onChange={(e) => { onRawChange(e.target.value); onRefined(""); }}
        placeholder="e.g. Make the background an outdoor parking lot. Remove the coffee cup from the subject's hand."
        rows={3}
      />
      <div className="si-footer">
        <span className="si-count">{rawText.length}/{SI_MAX}</span>
        <button
          type="button"
          className="si-refine-btn"
          onClick={handleRefine}
          disabled={!rawText.trim() || loading}
        >
          {loading ? "Refining…" : "Refine with AI →"}
        </button>
      </div>
      {refinedText && (
        <div className="si-refined">
          <span className="si-refined-label">Refined directive (used in prompt):</span>
          <p className="si-refined-text">{refinedText}</p>
        </div>
      )}
      {error && <p className="si-error">{error}</p>}
    </div>
  );

  if (embedded) return body;

  return (
    <section className="builder-section si-section">
      <button
        type="button"
        className="anim-char-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>Special Instructions</span>
        <ChevronDown size={16} className={`anim-char-chevron${open ? " open" : ""}`} />
      </button>
      {open && body}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function PaletteCard({
  preset,
  selected,
  onClick,
  userLogo,
  resolvedBase,
  resolvedAccent,
  contrastHex,
}: {
  preset: ColorPreset;
  selected: boolean;
  onClick: () => void;
  userLogo: NormalizedLogo | null;
  resolvedBase: string;
  resolvedAccent: string;
  contrastHex: string;
}) {
  const isLight = preset.variant === "light" || preset.variant === "auto-light";
  return (
    <button
      aria-pressed={selected}
      className={["palette-card", selected ? "active" : ""].filter(Boolean).join(" ")}
      onClick={onClick}
      type="button"
    >
      {/* Contrast header — background is the theme's own base color */}
      <div className="palette-card-header" style={{ backgroundColor: resolvedBase }}>
        {userLogo ? (
          <img
            alt=""
            aria-hidden="true"
            className={`palette-card-logo${isLight ? " on-light" : ""}`}
            src={userLogo.dataUrl}
          />
        ) : (
          <span className={`palette-card-placeholder${isLight ? " dark-text" : ""}`}>
            Upload Logo to Preview Contrast
          </span>
        )}
      </div>
      {/* Footer — name + 3-swatch strip */}
      <div className="palette-card-footer">
        <span className="palette-card-name">{preset.name}</span>
        <div className="palette-swatch-strip">
          <span className="palette-swatch" style={{ backgroundColor: resolvedBase || "#222" }} title="Base Mood" />
          <span className="palette-swatch" style={{ backgroundColor: resolvedAccent || "#888" }} title="UI Accent" />
          <span className="palette-swatch" style={{ backgroundColor: contrastHex }} title="Contrast Text" />
        </div>
      </div>
    </button>
  );
}

function PalettePicker({
  value,
  onChange,
  userLogo,
  autoAccentHex,
  modeFilter,
}: {
  value: string;
  onChange: (id: string) => void;
  userLogo: NormalizedLogo | null;
  autoAccentHex: string;
  modeFilter?: "dark" | "light" | null;
}) {
  const [open, setOpen] = useState(false);

  const selected = colorPresets.find((p) => p.id === value) ?? colorPresets[0];
  const allDark  = colorPresets.filter((p) => p.variant === "dark");
  const allLight = colorPresets.filter((p) => p.variant === "light");
  const allAuto  = colorPresets.filter((p) => p.variant === "auto-dark" || p.variant === "auto-light");

  const darkPresets  = modeFilter === "light" ? [] : allDark;
  const lightPresets = modeFilter === "dark"  ? [] : allLight;
  const autoPresets  = modeFilter === "dark"
    ? allAuto.filter((p) => p.variant === "auto-dark")
    : modeFilter === "light"
      ? allAuto.filter((p) => p.variant === "auto-light")
      : allAuto;

  function getAccent(preset: ColorPreset) {
    return preset.variant === "auto-dark" || preset.variant === "auto-light"
      ? autoAccentHex
      : preset.accentHex;
  }
  function getContrast(preset: ColorPreset) {
    return preset.variant === "light" || preset.variant === "auto-light" ? "#111827" : "#ffffff";
  }

  function choosePalette(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="theme-picker">
      <span className="compact-label">Ad Color Palette</span>

      {/* Compact trigger — sits in the form, never moves */}
      <button
        aria-expanded={open}
        className={open ? "theme-trigger active" : "theme-trigger"}
        onClick={() => setOpen((c) => !c)}
        type="button"
      >
        <span className="palette-chips" aria-hidden="true">
          <span style={{ backgroundColor: selected.baseHex || "#111" }} />
          <span style={{ backgroundColor: getAccent(selected) || "#444" }} />
        </span>
        <strong>{selected.name}</strong>
        <ChevronDown className={`palette-chevron${open ? " open" : ""}`} size={16} />
      </button>

      {/* Backdrop + panel rendered into document.body via portal — escapes any overflow:hidden ancestor */}
      {createPortal(
        <>
          {open && (
            <div
              aria-hidden="true"
              className="palette-backdrop"
              onClick={() => setOpen(false)}
            />
          )}
          <div
            aria-label="Ad Color Palette"
            aria-modal={open}
            className={`palette-panel${open ? " open" : ""}`}
            role="dialog"
          >
        {/* Panel header */}
        <div className="palette-panel-header">
          <span className="palette-panel-title">Ad Color Palette</span>
          <button
            aria-label="Close palette picker"
            className="palette-panel-close"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable panel body */}
        <div className="palette-panel-body">
          {/* Twin "From Logo" hero cards — side-by-side at top */}
          <div className="palette-auto-row">
            {autoPresets.map((preset) => (
              <PaletteCard
                key={preset.id}
                preset={preset}
                selected={value === preset.id}
                onClick={() => choosePalette(preset.id)}
                userLogo={userLogo}
                resolvedBase={preset.baseHex}
                resolvedAccent={autoAccentHex}
                contrastHex={getContrast(preset)}
              />
            ))}
          </div>

          {/* Matrix: single column when filtered, twin-column otherwise */}
          {(darkPresets.length > 0 || lightPresets.length > 0) && (
            <>
              <div className={`palette-matrix-headers${modeFilter ? " single" : ""}`}>
                {darkPresets.length > 0 && <span>Dark</span>}
                {lightPresets.length > 0 && <span>Light</span>}
              </div>
              <div className={`palette-matrix${modeFilter ? " single-col" : ""}`}>
                {modeFilter ? (
                  (modeFilter === "dark" ? darkPresets : lightPresets).map((preset) => (
                    <PaletteCard
                      key={preset.id}
                      preset={preset}
                      selected={value === preset.id}
                      onClick={() => choosePalette(preset.id)}
                      userLogo={userLogo}
                      resolvedBase={preset.baseHex}
                      resolvedAccent={getAccent(preset)}
                      contrastHex={getContrast(preset)}
                    />
                  ))
                ) : (
                  Array.from({ length: Math.max(darkPresets.length, lightPresets.length) }).map((_, i) => (
                    <React.Fragment key={i}>
                      {darkPresets[i] ? (
                        <PaletteCard
                          preset={darkPresets[i]}
                          selected={value === darkPresets[i].id}
                          onClick={() => choosePalette(darkPresets[i].id)}
                          userLogo={userLogo}
                          resolvedBase={darkPresets[i].baseHex}
                          resolvedAccent={getAccent(darkPresets[i])}
                          contrastHex={getContrast(darkPresets[i])}
                        />
                      ) : <div />}
                      {lightPresets[i] ? (
                        <PaletteCard
                          preset={lightPresets[i]}
                          selected={value === lightPresets[i].id}
                          onClick={() => choosePalette(lightPresets[i].id)}
                          userLogo={userLogo}
                          resolvedBase={lightPresets[i].baseHex}
                          resolvedAccent={getAccent(lightPresets[i])}
                          contrastHex={getContrast(lightPresets[i])}
                        />
                      ) : <div />}
                    </React.Fragment>
                  ))
                )}
              </div>
            </>
          )}
        </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function App() {
  const [themeMode, setThemeMode] = useState<"dark" | "light">("light");
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  // ── Workspace persistence helpers ──────────────────────
  const panelRefs = React.useRef<Partial<Record<string, HTMLDivElement | null>>>({});

  const [activePanelId, setActivePanelId] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").activePanelId ?? "business-info"; } catch { return "business-info"; }
  });

  const [donePanels, setDonePanels] = useState<Set<string>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").donePanels ?? [];
      return new Set(raw as string[]);
    } catch { return new Set(); }
  });

  // ── Next-action animation state ──────────────────────────
  const [buildKbPulsing, setBuildKbPulsing] = useState(false);
  const [buildKbUrgent, setBuildKbUrgent] = useState(false);
  const [panel2IncomingAttention, setPanel2IncomingAttention] = useState(false);
  const [incomingAttentionPanelId, setIncomingAttentionPanelId] = useState<string | null>(null);

  // ── Done button validation errors ────────────────────────
  const [panel1DoneError, setPanel1DoneError] = useState<string | null>(null);
  const [panel2DoneError, setPanel2DoneError] = useState<string | null>(null);
  const [panel3DoneError, setPanel3DoneError] = useState<string | null>(null);
  const [panel6DoneError, setPanel6DoneError] = useState<string | null>(null);

  const [logoWasUploaded, setLogoWasUploaded] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").logoWasUploaded ?? false; } catch { return false; }
  });

  function advancePanel(currentId: string) {
    const entry = PANEL_ORDER.find((p) => p.id === currentId);
    if (entry?.next) {
      setActivePanelId(entry.next);
    }
  }

  function openPanel(id: string) {
    setActivePanelId(id);
    setIncomingAttentionPanelId(null);
  }

  useEffect(() => {
    const el = panelRefs.current[activePanelId];
    if (el) {
      const timer = setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      return () => clearTimeout(timer);
    }
  }, [activePanelId]);

  const [state, setState] = useState<BuilderState>(() => {
    return loadInitialBuilderState();
  });
  const [generated, setGenerated] = useState<PromptOutput | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenDone, setRegenDone] = useState(false);
  const [generationNonce, setGenerationNonce] = useState(0);
  const [promptOpen, setPromptOpen] = useState(false);
  // ─── Knowledge Base state ─────────────────────────────────────────────────
  const [kbOffers, setKbOffers] = useState<string[]>([]);
  const [kbSubOffers, setKbSubOffers] = useState<string[]>([]);
  const [showSubOffers, setShowSubOffers] = useState(false);
  const [kbBenefitsByOffer, setKbBenefitsByOffer] = useState<Record<string, string[]>>({});
  const [kbSelectedOffer, setKbSelectedOffer] = useState<string | null>(() => {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").kbSelectedOffer ?? null; } catch { return null; }
  });
  const [kbLoading, setKbLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState<string | null>(null);
  const [editingBenefit, setEditingBenefit] = useState<string | null>(null);
  const [editingPresetOffer, setEditingPresetOffer] = useState(false);
  const [editingPresetBenefit, setEditingPresetBenefit] = useState<string | null>(null);
  const [editingCta, setEditingCta] = useState(false);
  const [ctaDraft, setCtaDraft] = useState("");
  const [chipDraft, setChipDraft] = useState("");
  const [quickCommunicationTypeId, setQuickCommunicationTypeId] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").quickCommunicationTypeId ?? WEBSITE_COMMUNICATION_TYPE_ID; } catch { return WEBSITE_COMMUNICATION_TYPE_ID; }
  });
  const [quickCommunicationOverrides, setQuickCommunicationOverrides] = useState<Record<string, QuickCommunicationOverride>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").quickCommunicationOverrides;
      return raw && typeof raw === "object" ? raw : {};
    } catch { return {}; }
  });
  const [savedCombos, setSavedCombos] = useState<SavedCommunicationCombo[]>(() => {
    try { return loadSavedCommunicationCombos(); } catch { return []; }
  });
  const [savedComboNotice, setSavedComboNotice] = useState<string | null>(null);
  // Per-offer benefit selection (max 4). Keyed by offer name. Order is
  // insertion-agnostic — final prompt order is derived from the source
  // benefits array, not the selection order.
  const [selectedBenefitsByOffer, setSelectedBenefitsByOffer] = useState<
    Record<string, Set<string>>
  >(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").selectedBenefitsByOffer ?? {};
      return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, new Set(v as string[])]));
    } catch { return {}; }
  });
  const [selectedManualBenefitsByType, setSelectedManualBenefitsByType] = useState<
    Record<string, Set<string>>
  >(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").selectedManualBenefitsByType ?? {};
      return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, new Set(v as string[])]));
    } catch { return {}; }
  });
  const [openBenefitMenu, setOpenBenefitMenu] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const BENEFIT_SELECTION_CAP = 4;

  // Close the row "⋯" menu on outside click.
  useEffect(() => {
    if (!openBenefitMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".kb-chip-menu, .kb-chip-menu-trigger")) {
        setOpenBenefitMenu(null);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openBenefitMenu]);

  function selectedBenefitsSet(offer: string | null): Set<string> {
    if (!offer) return new Set();
    return selectedBenefitsByOffer[offer] ?? new Set();
  }

  const activeSavedComboId = quickCommunicationTypeId.startsWith(SAVED_COMBO_ID_PREFIX)
    ? quickCommunicationTypeId.slice(SAVED_COMBO_ID_PREFIX.length)
    : null;
  const activeSavedCombo = activeSavedComboId
    ? savedCombos.find((combo) => combo.id === activeSavedComboId) ?? null
    : null;
  const activeCommunicationType = useMemo(
    () => quickCommunicationTypes.find((type) => type.id === quickCommunicationTypeId) ?? quickCommunicationTypes[0],
    [quickCommunicationTypeId],
  );
  const usingSavedCombo = !!activeSavedCombo;
  const usingWebsiteOffer = quickCommunicationTypeId === WEBSITE_COMMUNICATION_TYPE_ID;
  const activeManualOverride = quickCommunicationOverrides[quickCommunicationTypeId] ?? {};
  const baseManualOffer = usingSavedCombo ? activeSavedCombo.offer : activeCommunicationType.offer;
  const baseManualBenefits = usingSavedCombo ? activeSavedCombo.benefits : activeCommunicationType.benefits;
  const activeManualOffer = activeManualOverride.offer ?? baseManualOffer;
  const activeManualBenefits = activeManualOverride.benefits ?? baseManualBenefits;
  const selectedManualBenefitsSet = selectedManualBenefitsByType[quickCommunicationTypeId] ?? new Set(activeManualBenefits);
  const activeOffer = usingWebsiteOffer ? kbSelectedOffer : activeManualOffer;
  const activeBenefits = usingWebsiteOffer
    ? activeOffer
      ? (kbBenefitsByOffer[activeOffer] ?? []).filter((benefit) => selectedBenefitsSet(activeOffer).has(benefit))
      : []
    : activeManualBenefits.filter((benefit) => selectedManualBenefitsSet.has(benefit));
  const activeBenefitCount = activeBenefits.length;
  const hasBuiltKnowledgeBase = kbOffers.length > 0 && Object.keys(kbBenefitsByOffer).length > 0;

  function toggleBenefit(benefit: string) {
    if (!usingWebsiteOffer || !kbSelectedOffer) return;
    setGenerateError(null);
    setSelectedBenefitsByOffer((prev) => {
      const current = new Set(prev[kbSelectedOffer] ?? []);
      if (current.has(benefit)) {
        current.delete(benefit);
      } else {
        if (current.size >= BENEFIT_SELECTION_CAP) return prev;
        current.add(benefit);
      }
      return { ...prev, [kbSelectedOffer]: current };
    });
  }

  function toggleManualBenefit(benefit: string) {
    if (usingWebsiteOffer) return;
    setGenerateError(null);
    setSelectedManualBenefitsByType((prev) => {
      const current = new Set(prev[quickCommunicationTypeId] ?? activeManualBenefits);
      if (current.has(benefit)) {
        current.delete(benefit);
      } else {
        if (current.size >= BENEFIT_SELECTION_CAP) return prev;
        current.add(benefit);
      }
      return { ...prev, [quickCommunicationTypeId]: current };
    });
  }

  // When the selected offer changes, hide any stale menu and clear errors.
  useEffect(() => {
    setOpenBenefitMenu(null);
    setGenerateError(null);
  }, [kbSelectedOffer]);

  useEffect(() => {
    if (!hasBuiltKnowledgeBase && quickCommunicationTypeId !== WEBSITE_COMMUNICATION_TYPE_ID) {
      setQuickCommunicationTypeId(WEBSITE_COMMUNICATION_TYPE_ID);
    }
  }, [hasBuiltKnowledgeBase, quickCommunicationTypeId]);

  useEffect(() => {
    setEditingPresetOffer(false);
    setEditingPresetBenefit(null);
    setOpenBenefitMenu(null);
  }, [quickCommunicationTypeId]);

  // Clear Panel 2 incoming attention as soon as user selects an offer.
  useEffect(() => {
    if (kbSelectedOffer) setPanel2IncomingAttention(false);
  }, [kbSelectedOffer]);

  // Auto-clear Build KB urgent state after 10 seconds.
  useEffect(() => {
    if (!buildKbUrgent) return;
    const t = setTimeout(() => setBuildKbUrgent(false), 10000);
    return () => clearTimeout(t);
  }, [buildKbUrgent]);

  // Auto-clear WorkflowPanel incoming attention after 4 seconds.
  useEffect(() => {
    if (!incomingAttentionPanelId) return;
    const timer = setTimeout(() => setIncomingAttentionPanelId(null), 4000);
    return () => clearTimeout(timer);
  }, [incomingAttentionPanelId]);

  // Auto-dismiss Done validation errors after 3 seconds.
  useEffect(() => {
    if (!panel1DoneError) return;
    const t = setTimeout(() => setPanel1DoneError(null), 3000);
    return () => clearTimeout(t);
  }, [panel1DoneError]);

  useEffect(() => {
    if (!panel2DoneError) return;
    const t = setTimeout(() => setPanel2DoneError(null), 3000);
    return () => clearTimeout(t);
  }, [panel2DoneError]);

  useEffect(() => {
    if (!panel3DoneError) return;
    const t = setTimeout(() => setPanel3DoneError(null), 3000);
    return () => clearTimeout(t);
  }, [panel3DoneError]);

  useEffect(() => {
    if (!panel6DoneError) return;
    const t = setTimeout(() => setPanel6DoneError(null), 3000);
    return () => clearTimeout(t);
  }, [panel6DoneError]);
  // ─── User-uploaded brand logo ─────────────────────────────────────────────
  const [userLogo, setUserLogo] = useState<NormalizedLogo | null>(() => {
    try {
      const ws = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}");
      if (ws.logoDataUrl) return { dataUrl: ws.logoDataUrl, filename: ws.logoFilename ?? "logo.png", width: ws.logoWidth ?? 0, height: ws.logoHeight ?? 0 };
    } catch {}
    return null;
  });
  const [userLogoError, setUserLogoError] = useState<string | null>(null);
  const [userLogoBusy, setUserLogoBusy] = useState(false);
  const [autoAccentHex, setAutoAccentHex] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").autoAccentHex ?? "#20c8ff"; } catch { return "#20c8ff"; }
  });
  const [logoMode, setLogoMode] = useState<"dark" | "light" | null>(() => {
    try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "{}").logoMode ?? null; } catch { return null; }
  });

  useEffect(() => {
    setGenerated(null);
    setCopied(false);
    setRegenDone(false);
  }, [state, kbSelectedOffer, selectedBenefitsByOffer, selectedManualBenefitsByType, userLogo, autoAccentHex, logoMode, quickCommunicationTypeId, quickCommunicationOverrides]);

  // ─── Comprehensive workspace save ────────────────────────────────────────
  useEffect(() => {
    const benefitsByOfferArray = Object.fromEntries(
      Object.entries(selectedBenefitsByOffer).map(([k, v]) => [k, Array.from(v)])
    );
    const selectedManualBenefitsArray = Object.fromEntries(
      Object.entries(selectedManualBenefitsByType).map(([k, v]) => [k, Array.from(v)])
    );
    const logoDataUrl = userLogo && userLogo.dataUrl.length <= LOGO_SIZE_LIMIT ? userLogo.dataUrl : null;
    const { specialInstructions, refinedInstructions, ...persistedState } = state;
    const snapshot = {
      state: persistedState,
      kbSelectedOffer,
      selectedBenefitsByOffer: benefitsByOfferArray,
      selectedManualBenefitsByType: selectedManualBenefitsArray,
      activePanelId,
      logoDataUrl,
      logoFilename: userLogo?.filename ?? null,
      logoWidth: userLogo?.width ?? null,
      logoHeight: userLogo?.height ?? null,
      logoWasUploaded: logoWasUploaded || !!userLogo,
      autoAccentHex,
      logoMode,
      themeMode,
      donePanels: Array.from(donePanels),
      quickCommunicationTypeId,
      quickCommunicationOverrides,
    };
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(snapshot)); } catch { /* quota exceeded */ }
  }, [state, kbSelectedOffer, selectedBenefitsByOffer, selectedManualBenefitsByType, activePanelId, userLogo, autoAccentHex, logoMode, logoWasUploaded, themeMode, donePanels, quickCommunicationTypeId, quickCommunicationOverrides]);

  // Extract dominant accent color for auto-palette cards.
  useEffect(() => {
    if (!userLogo) return;
    extractDominantAccent(userLogo).then((hex) => {
      setAutoAccentHex(hex ?? "#20c8ff");
    }).catch(() => {});
  }, [userLogo]);

  // When mode is chosen, immediately apply the logo-matched auto palette.
  useEffect(() => {
    if (!logoMode) return;
    update("paletteId", logoMode === "dark" ? "auto-dark" : "auto-light");
  }, [logoMode]);

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setUserLogoError("Logo file must be under 8MB.");
      return;
    }
    setUserLogoBusy(true);
    setUserLogoError(null);
    try {
      const normalized = await normalizeLogoToPng(file);
      setUserLogo(normalized);
      setLogoWasUploaded(true);
    } catch (err) {
      setUserLogo(null);
      setUserLogoError(err instanceof Error ? err.message : "Logo conversion failed.");
    } finally {
      setUserLogoBusy(false);
    }
  }

  function clearUserLogo() {
    setUserLogo(null);
    setUserLogoError(null);
    setLogoMode(null);
    setLogoWasUploaded(false);
  }

  function deleteOffer(offer: string) {
    const isSub = kbSubOffers.includes(offer) && !kbOffers.includes(offer);
    if (isSub) {
      setKbSubOffers((prev) => prev.filter((o) => o !== offer));
    } else {
      setKbOffers((prev) => prev.filter((o) => o !== offer));
      setKbBenefitsByOffer((prev) => {
        const next = { ...prev };
        delete next[offer];
        return next;
      });
      setSelectedBenefitsByOffer((prev) => {
        if (!(offer in prev)) return prev;
        const next = { ...prev };
        delete next[offer];
        return next;
      });
    }
    if (kbSelectedOffer === offer) setKbSelectedOffer(null);
  }

  function deleteBenefit(benefit: string) {
    if (!kbSelectedOffer) return;
    setKbBenefitsByOffer((prev) => ({
      ...prev,
      [kbSelectedOffer]: (prev[kbSelectedOffer] ?? []).filter((b) => b !== benefit),
    }));
    setSelectedBenefitsByOffer((prev) => {
      const current = prev[kbSelectedOffer];
      if (!current || !current.has(benefit)) return prev;
      const next = new Set(current);
      next.delete(benefit);
      return { ...prev, [kbSelectedOffer]: next };
    });
  }

  function startEditOffer(offer: string) {
    setEditingOffer(offer);
    setEditingBenefit(null);
    setEditingPresetOffer(false);
    setEditingPresetBenefit(null);
    setChipDraft(offer);
  }

  function startEditBenefit(benefit: string) {
    setEditingBenefit(benefit);
    setEditingOffer(null);
    setEditingPresetOffer(false);
    setEditingPresetBenefit(null);
    setChipDraft(benefit);
  }

  function startEditPresetOffer() {
    if (usingWebsiteOffer || !activeManualOffer) return;
    setEditingPresetOffer(true);
    setEditingOffer(null);
    setEditingBenefit(null);
    setEditingPresetBenefit(null);
    setChipDraft(activeManualOffer);
  }

  function startEditPresetBenefit(benefit: string) {
    if (usingWebsiteOffer) return;
    setEditingPresetBenefit(benefit);
    setEditingPresetOffer(false);
    setEditingOffer(null);
    setEditingBenefit(null);
    setChipDraft(benefit);
  }

  function startEditCta() {
    setEditingCta(true);
    setCtaDraft(state.cta);
  }

  function commitEditOffer(original: string) {
    const next = chipDraft.trim();
    setEditingOffer(null);
    if (!next || next === original) return;
    const isSub = kbSubOffers.includes(original) && !kbOffers.includes(original);
    if (isSub) {
      setKbSubOffers((prev) => prev.map((o) => (o === original ? next : o)));
    } else {
      setKbOffers((prev) => prev.map((o) => (o === original ? next : o)));
      setKbBenefitsByOffer((prev) => {
        const updated = { ...prev };
        if (original in updated) {
          updated[next] = updated[original];
          delete updated[original];
        }
        return updated;
      });
      setSelectedBenefitsByOffer((prev) => {
        if (!(original in prev)) return prev;
        const updated = { ...prev };
        updated[next] = updated[original];
        delete updated[original];
        return updated;
      });
    }
    if (kbSelectedOffer === original) setKbSelectedOffer(next);
  }

  function commitEditBenefit(original: string) {
    const next = chipDraft.trim();
    setEditingBenefit(null);
    if (!kbSelectedOffer || !next || next === original) return;
    setKbBenefitsByOffer((prev) => ({
      ...prev,
      [kbSelectedOffer]: (prev[kbSelectedOffer] ?? []).map((b) => (b === original ? next : b)),
    }));
    setSelectedBenefitsByOffer((prev) => {
      const current = prev[kbSelectedOffer];
      if (!current || !current.has(original)) return prev;
      const updated = new Set(current);
      updated.delete(original);
      updated.add(next);
      return { ...prev, [kbSelectedOffer]: updated };
    });
  }

  function commitEditPresetOffer() {
    const next = chipDraft.trim();
    setEditingPresetOffer(false);
    if (usingWebsiteOffer || !next || next === activeManualOffer) return;
    setQuickCommunicationOverrides((prev) => ({
      ...prev,
      [quickCommunicationTypeId]: {
        ...prev[quickCommunicationTypeId],
        offer: next,
        benefits: activeManualBenefits,
      },
    }));
  }

  function commitEditPresetBenefit(original: string) {
    const next = chipDraft.trim();
    setEditingPresetBenefit(null);
    if (usingWebsiteOffer || !next || next === original) return;
    const nextBenefits = activeManualBenefits.map((benefit) => (benefit === original ? next : benefit));
    setSelectedManualBenefitsByType((prev) => {
      const current = prev[quickCommunicationTypeId];
      if (!current) return prev;
      const updated = new Set(current);
      if (updated.delete(original)) updated.add(next);
      return { ...prev, [quickCommunicationTypeId]: updated };
    });
    setQuickCommunicationOverrides((prev) => ({
      ...prev,
      [quickCommunicationTypeId]: {
        ...prev[quickCommunicationTypeId],
        offer: activeManualOffer ?? baseManualOffer ?? "",
        benefits: nextBenefits,
      },
    }));
  }

  function commitEditCta() {
    const next = ctaDraft.trim();
    setEditingCta(false);
    if (!next || next === state.cta) return;
    update("cta", next);
  }

  function replaceSavedCombos(nextCombos: SavedCommunicationCombo[]) {
    setSavedCombos(nextCombos);
    persistSavedCommunicationCombos(nextCombos);
  }

  function handleSaveCurrentCombo() {
    if (!activeOffer || activeBenefitCount < 1) {
      setPanel2DoneError("Select one offer and at least 1 benefit before saving.");
      return;
    }
    const defaultName = `${activeOffer} Combo`;
    const name = window.prompt("Name this saved combo", defaultName)?.trim();
    if (!name) return;
    const combo = createSavedCommunicationCombo({
      name,
      offer: activeOffer,
      benefits: activeBenefits.slice(0, BENEFIT_SELECTION_CAP),
      cta: state.cta,
    });
    replaceSavedCombos([combo, ...savedCombos]);
    setQuickCommunicationTypeId(`${SAVED_COMBO_ID_PREFIX}${combo.id}`);
    setSavedComboNotice("Saved combo added.");
    setPanel2DoneError(null);
    window.setTimeout(() => setSavedComboNotice(null), 2200);
  }

  function handleDeleteActiveSavedCombo() {
    if (!activeSavedCombo) return;
    const shouldDelete = window.confirm(`Delete saved combo "${activeSavedCombo.name}"?`);
    if (!shouldDelete) return;
    replaceSavedCombos(savedCombos.filter((combo) => combo.id !== activeSavedCombo.id));
    setQuickCommunicationOverrides((prev) => {
      const next = { ...prev };
      delete next[`${SAVED_COMBO_ID_PREFIX}${activeSavedCombo.id}`];
      return next;
    });
    setSelectedManualBenefitsByType((prev) => {
      const next = { ...prev };
      delete next[`${SAVED_COMBO_ID_PREFIX}${activeSavedCombo.id}`];
      return next;
    });
    setQuickCommunicationTypeId(WEBSITE_COMMUNICATION_TYPE_ID);
    setSavedComboNotice("Saved combo deleted.");
    window.setTimeout(() => setSavedComboNotice(null), 2200);
  }

  function markDone(id: string) {
    setDonePanels(prev => { const n = new Set(prev); n.add(id); return n; });
  }

  function handlePanel2Done() {
    if (!activeOffer) { setPanel2DoneError("Select an offer first."); return; }
    if (activeBenefitCount < 1) { setPanel2DoneError("Select at least 1 benefit to continue."); return; }
    setPanel2DoneError(null);
    if (LEFT_PANELS.every(id => donePanels.has(id))) {
      setActivePanelId("");
    } else {
      const nextPanel = LEFT_PANELS.find(id => !donePanels.has(id));
      if (nextPanel) {
        setIncomingAttentionPanelId(nextPanel);
        openPanel(nextPanel);
      }
    }
  }

  async function handleBuildKB() {
    if (!state.websiteUrl?.trim()) {
      setKbError("Enter a Website URL first.");
      return;
    }
    setBuildKbPulsing(false);
    setBuildKbUrgent(false);
    setKbLoading(true);
    setKbError(null);
    try {
      const result = await fetchBusinessKnowledgeBase(
        state.websiteUrl,
        state.businessType ?? "",
        state.companyName ?? "",
        state.locationArea ?? "",
        state.tone ?? "",
      );
      setKbOffers(result.offers);
      setKbSubOffers(result.subOffers ?? []);
      setKbBenefitsByOffer(
        Object.fromEntries(
          Object.entries(result.benefitsByOffer).map(([offer, benefits]) => [
            offer,
            Array.from(new Set(benefits)),
          ])
        )
      );
      setKbSelectedOffer(null);
      setShowSubOffers(false);
      setSelectedBenefitsByOffer({});
      setQuickCommunicationTypeId(WEBSITE_COMMUNICATION_TYPE_ID);
      setGenerateError(null);
      markDone("business-info");
      setActivePanelId("offer-benefits");
      setPanel2IncomingAttention(true);
    } catch (err) {
      setKbError(err instanceof Error ? err.message : "Build KB failed.");
    } finally {
      setKbLoading(false);
    }
  }

  const selectedFormat = useMemo(
    () => formats.find((format) => format.id === state.platformFormatId) ?? formats[0],
    [state.platformFormatId],
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === state.productId) ?? products[0],
    [state.productId],
  );

  const visibleAssetReferences = useMemo(() => {
    const references = selectedProduct.assetReferences ?? [];
    if (selectedProduct.id !== "nfc_social_station") {
      return references;
    }

    if (state.socialPlatform === "Both") {
      return references;
    }

    return references.filter((reference) => reference.toLowerCase().includes(state.socialPlatform.toLowerCase()));
  }, [selectedProduct, state.socialPlatform]);

  function update<K extends keyof BuilderState>(key: K, value: BuilderState[K]) {
    if (key === "websiteUrl" || key === "businessType") {
      resetKnowledgeBase();
    }
    setCopied(false);
    setRegenDone(false);
    setState((current) => ({ ...current, [key]: value }));
  }

  function fillDevTestBusinessInfo() {
    resetKnowledgeBase();
    setBuildKbPulsing(true);
    setBuildKbUrgent(false);
    setState((current) => ({ ...current, ...devTestBusinessInfo }));
  }

  function resetKnowledgeBase() {
    setKbOffers([]);
    setKbSubOffers([]);
    setShowSubOffers(false);
    setKbBenefitsByOffer({});
    setKbSelectedOffer(null);
    setSelectedBenefitsByOffer({});
    setOpenBenefitMenu(null);
    setPanel2IncomingAttention(false);
    setPanel2DoneError(null);
    setEditingPresetOffer(false);
    setEditingPresetBenefit(null);
    setGenerateError(null);
    setQuickCommunicationTypeId(WEBSITE_COMMUNICATION_TYPE_ID);
  }

  function buildCurrentPrompt(requireSelectedBenefit = false, variantSeed = generationNonce) {
    if (requireSelectedBenefit && !activeOffer) {
      setGenerateError("Select one offer and at least 1 benefit before generating.");
      setPanel2DoneError("Select one offer and at least 1 benefit before generating.");
      setActivePanelId("offer-benefits");
      return null;
    }
    if (requireSelectedBenefit && activeBenefitCount < 1) {
      setGenerateError("Select at least 1 benefit before generating.");
      setPanel2DoneError("Select at least 1 benefit before generating.");
      setActivePanelId("offer-benefits");
      return null;
    }

    return buildPrompt(
      state,
      {
        selectedOffer: activeOffer,
        benefits: activeBenefits,
      },
      undefined,
      { hasUserLogo: !!userLogo, autoAccentHex, logoWidth: userLogo?.width, logoHeight: userLogo?.height },
      variantSeed,
    );
  }

  function validatePromptRequirements(action: "generating" | "copying") {
    if (!state.websiteUrl?.trim() || !state.companyName?.trim() || !state.locationArea?.trim() || !state.businessType?.trim()) {
      setGenerateError("Complete all Business Information fields, then click Build KB before generating.");
      setPanel1DoneError("Complete all fields, then click Build KB.");
      setActivePanelId("business-info");
      return false;
    }
    if (!hasBuiltKnowledgeBase) {
      setGenerateError("Build KB first before generating.");
      setPanel1DoneError("Build KB first before continuing.");
      setActivePanelId("business-info");
      return false;
    }
    if (!activeOffer) {
      setGenerateError(`Select one offer and at least 1 benefit before ${action}.`);
      setPanel2DoneError(`Select one offer and at least 1 benefit before ${action}.`);
      setActivePanelId("offer-benefits");
      return false;
    }
    if (activeBenefitCount < 1) {
      setGenerateError(`Select at least 1 benefit before ${action}.`);
      setPanel2DoneError(`Select at least 1 benefit before ${action}.`);
      setActivePanelId("offer-benefits");
      return false;
    }
    if (!userLogo) {
      setGenerateError("Upload a logo before generating.");
      setPanel3DoneError("Upload a logo before generating.");
      setActivePanelId("brand-logo");
      return false;
    }
    if (!logoMode) {
      setGenerateError("Choose Dark Background or Light Background for the logo before generating.");
      setPanel3DoneError("Choose Dark Background or Light Background.");
      setActivePanelId("brand-logo");
      return false;
    }
    return true;
  }

  function generate(variantSeed = generationNonce) {
    const prompt = buildCurrentPrompt(true, variantSeed);
    if (!prompt) return;
    setGenerateError(null);
    setGenerated(prompt);
    setCopied(false);
  }

  async function handleGenerate() {
    if (!validatePromptRequirements("generating")) return;
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 2000));
    const nextNonce = generationNonce + 1;
    setGenerationNonce(nextNonce);
    generate(nextNonce);
    setIsGenerating(false);
    setRegenDone(true);
    window.setTimeout(() => setRegenDone(false), 2000);
  }

  async function copyPrompt() {
    if (!validatePromptRequirements("copying")) return;
    const prompt = generated ?? buildCurrentPrompt(true, generationNonce);
    if (!prompt) return;
    setGenerateError(null);
    setGenerated(prompt);
    await navigator.clipboard.writeText(prompt.fullText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function assetUrl(assetReference: string) {
    return assetReference.match(/https?:\/\/\S+/)?.[0] ?? "";
  }

  // ── Derived animation flags ──────────────────────────────
  const benefitsNeedAttention =
    activePanelId === "offer-benefits" &&
    usingWebsiteOffer &&
    !!kbSelectedOffer &&
    selectedBenefitsSet(kbSelectedOffer).size === 0 &&
    (kbBenefitsByOffer[kbSelectedOffer]?.length ?? 0) > 0;

  const doneButtonShouldPulse =
    activePanelId === "offer-benefits" &&
    !!activeOffer &&
    activeBenefitCount >= 1;

  const canGeneratePrompt =
    !!state.websiteUrl?.trim() &&
    !!state.companyName?.trim() &&
    !!state.locationArea?.trim() &&
    !!state.businessType?.trim() &&
    hasBuiltKnowledgeBase &&
    !!activeOffer &&
    activeBenefitCount >= 1 &&
    !!userLogo &&
    !!logoMode;

  const allLeftDone = LEFT_PANELS.every(id => donePanels.has(id));
  const regenReady = doneButtonShouldPulse && allLeftDone;
  // LOCAL TEST HELPER ONLY.
  // Keep this wired for local QA, but never expose it on Vercel/public deployments.
  const showLocalOnlyFillTestBusinessButton = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

  const nextIncompleteLeftPanel = LEFT_PANELS.find(id => !donePanels.has(id));
  const nextPanelTitle = nextIncompleteLeftPanel
    ? PANEL_ORDER.find(p => p.id === nextIncompleteLeftPanel)?.title
    : null;

  return (
    <main className="app-shell" data-theme={themeMode}>
      <section className="workspace">
        <aside className="builder-panel">
          <div className="brand-block">
            <div className="brand-mark">B</div>
            <div>
              <p>Booked AI Systems</p>
              <h1>Copy Ad Prompt Builder Version 2</h1>
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setThemeMode((m) => m === "dark" ? "light" : "dark")}
              aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {themeMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          <div className="spotlight-panel-wrap">
          <WorkflowPanel
            id="business-info"
            activePanelId={activePanelId}
            onActivate={() => openPanel("business-info")}
            onDone={() => {
              if (kbOffers.length === 0) { setPanel1DoneError("Build KB first before continuing."); return; }
              markDone("business-info");
              setBuildKbPulsing(false); setPanel2IncomingAttention(true); advancePanel("business-info");
            }}
            setPanelRef={(el) => { panelRefs.current["business-info"] = el; }}
            hasIncomingAttention={incomingAttentionPanelId === "business-info"}
            doneError={panel1DoneError}
            isDone={donePanels.has("business-info")}
            summary={
              (() => {
                const parts = [state.companyName, state.businessType, state.locationArea].filter(Boolean);
                return parts.length
                  ? <span className="wf-summary-text">{parts.join(" · ")}</span>
                  : <span className="wf-summary-empty">No information entered</span>;
              })()
            }
          >
            <div className="form-grid">
            <label className="field">
              <span>Website URL</span>
              <input
                type="text"
                value={state.websiteUrl ?? ""}
                onChange={(e) => update("websiteUrl", e.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <label className="field">
              <span>Company Name</span>
              <input
                type="text"
                value={state.companyName ?? ""}
                onChange={(e) => update("companyName", e.target.value)}
                placeholder="e.g. Affinity Dance Studio"
              />
            </label>
            <label className="field">
              <span>Location Area</span>
              <input
                type="text"
                value={state.locationArea ?? ""}
                onChange={(e) => update("locationArea", e.target.value)}
                placeholder="e.g. Surrey, BC"
              />
            </label>
            <label className="field">
              <span>Business Type</span>
              <input
                type="text"
                value={state.businessType ?? ""}
                onChange={(e) => {
                  update("businessType", e.target.value);
                  if (e.target.value.trim()) {
                    setBuildKbPulsing(true);
                  } else {
                    setBuildKbPulsing(false);
                  }
                }}
                placeholder="e.g. Dance Studio"
              />
            </label>
            </div>
            {showLocalOnlyFillTestBusinessButton && (
              <button
                className="dev-fill-button"
                onClick={fillDevTestBusinessInfo}
                type="button"
              >
                Fill Test Business
              </button>
            )}
            {buildKbUrgent && (
              <p className="build-kb-urgent-callout">
                ⚡ This is required to generate your ad prompt — fill in your details and click Build KB to continue.
              </p>
            )}
            <button
              className={`build-kb-button${buildKbUrgent ? " kb-btn-urgent" : buildKbPulsing && !kbLoading ? " kb-btn-pulsing" : ""}`}
              onClick={handleBuildKB}
              type="button"
              disabled={kbLoading}
            >
              {kbLoading ? <span className="btn-spinner" /> : "Build KB"}
            </button>
            <p className="build-kb-subtext">Clicking this will reset current offers and benefits</p>
            {kbError && <p className="kb-error">{kbError}</p>}
          </WorkflowPanel>
          </div>

          <WorkflowPanel
            id="brand-logo"
            activePanelId={activePanelId}
            onActivate={() => openPanel("brand-logo")}
            onDone={() => {
              if (!userLogo) { setPanel3DoneError("Upload a logo for best results."); return; }
              markDone("brand-logo");
              advancePanel("brand-logo");
            }}
            setPanelRef={(el) => { panelRefs.current["brand-logo"] = el; }}
            hasIncomingAttention={incomingAttentionPanelId === "brand-logo"}
            doneError={panel3DoneError}
            isDone={donePanels.has("brand-logo") && !!userLogo}
            summary={
              (() => {
                if (userLogo) return <span className="wf-summary-text">Logo uploaded · {logoMode ? (logoMode === "dark" ? "Dark bg" : "Light bg") : "No mode selected"}</span>;
                if (logoWasUploaded) return <span className="wf-summary-text wf-reupload-notice">Logo not stored — re-upload on next visit</span>;
                return <span className="wf-summary-empty">No logo uploaded</span>;
              })()
            }
          >
            {logoWasUploaded && !userLogo && (
              <p className="wf-reupload-notice">Your previous logo could not be stored (too large). Please re-upload it.</p>
            )}
            <p className="logo-hint">
              Upload your logo (PNG, JPG, WEBP, GIF, BMP, or SVG). We convert it to a clean
              transparent PNG, generate the prompt with all logo placement rules wired to YOUR
              logo, and give you back the PNG to attach to your image LLM along with the prompt.
            </p>

            <input
              id="user-logo-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,image/avif"
              className="logo-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                handleLogoUpload(file);
                e.target.value = "";
              }}
            />

            {!userLogo ? (
              <label htmlFor="user-logo-file" className="logo-upload-button">
                {userLogoBusy ? "Converting…" : "Choose Logo File"}
              </label>
            ) : (
              <>
                <p className="logo-contrast-prompt">
                  {logoMode
                    ? `${logoMode === "dark" ? "Dark" : "Light"} Mode selected — using your logo's accent colour${autoAccentHex !== "#20c8ff" ? ` (${autoAccentHex})` : ""}. You can override in the palette picker.`
                    : "Choose how your ad will be rendered:"}
                </p>
                <div className="logo-contrast-row">
                  <div
                    className={`logo-contrast-card${logoMode === "dark" ? " active" : ""}`}
                    onClick={() => setLogoMode("dark")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setLogoMode("dark")}
                  >
                    <div className="logo-contrast-label">Dark Background</div>
                    <div className="logo-contrast-thumb logo-contrast-dark">
                      <img src={userLogo.dataUrl} alt="Logo on dark background" />
                    </div>
                    <div className="logo-contrast-select">
                      {logoMode === "dark" ? "✓ Selected" : "Select"}
                    </div>
                  </div>
                  <div
                    className={`logo-contrast-card${logoMode === "light" ? " active" : ""}`}
                    onClick={() => setLogoMode("light")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setLogoMode("light")}
                  >
                    <div className="logo-contrast-label">Light Background</div>
                    <div className="logo-contrast-thumb logo-contrast-light">
                      <img src={userLogo.dataUrl} alt="Logo on light background" className="logo-on-light-preview" />
                    </div>
                    <div className="logo-contrast-select">
                      {logoMode === "light" ? "✓ Selected" : "Select"}
                    </div>
                  </div>
                </div>
                <div className="logo-preview-actions" style={{ marginTop: "10px" }}>
                  <button
                    type="button"
                    className="logo-download-btn"
                    onClick={() => downloadNormalizedLogo(userLogo)}
                  >
                    ⬇ Download PNG (attach this to your image LLM)
                  </button>
                  <label htmlFor="user-logo-file" className="logo-replace-btn">
                    Replace
                  </label>
                  <button
                    type="button"
                    className="logo-clear-btn"
                    onClick={clearUserLogo}
                  >
                    Clear
                  </button>
                </div>
              </>
            )}

            {userLogoError && <p className="logo-error">{userLogoError}</p>}
            <PalettePicker
              value={state.paletteId}
              onChange={(id) => update("paletteId", id)}
              userLogo={userLogo}
              autoAccentHex={autoAccentHex}
              modeFilter={logoMode}
            />
          </WorkflowPanel>

          <WorkflowPanel
            id="look-and-feel"
            activePanelId={activePanelId}
            onActivate={() => openPanel("look-and-feel")}
            onDone={() => { markDone("look-and-feel"); advancePanel("look-and-feel"); }}
            setPanelRef={(el) => { panelRefs.current["look-and-feel"] = el; }}
            hasIncomingAttention={incomingAttentionPanelId === "look-and-feel"}
            isDone={donePanels.has("look-and-feel")}
            summary={
              (() => {
                const style = state.animatedCharacterStyle ?? state.adStyle;
                return style
                  ? <span className="wf-summary-text">{style}</span>
                  : <span className="wf-summary-empty">No style selected</span>;
              })()
            }
          >
            <div className="form-grid">
              <StyleSelect
                value={state.adStyle ?? DEFAULT_STYLE}
                onChange={(value) => {
                  setState((s) => ({ ...s, adStyle: value, animatedCharacterStyle: undefined }));
                }}
                animatedOverride={state.animatedCharacterStyle}
              />
            </div>
            <AnimatedCharacterCards
              value={state.animatedCharacterStyle}
              onChange={(value) => {
                setState((s) => ({
                  ...s,
                  animatedCharacterStyle: value,
                  adStyle: value ? undefined : DEFAULT_STYLE,
                }));
              }}
            />
          </WorkflowPanel>

          <WorkflowPanel
            id="ad-settings"
            activePanelId={activePanelId}
            onActivate={() => openPanel("ad-settings")}
            onDone={() => { markDone("ad-settings"); advancePanel("ad-settings"); }}
            setPanelRef={(el) => { panelRefs.current["ad-settings"] = el; }}
            hasIncomingAttention={incomingAttentionPanelId === "ad-settings"}
            isDone={donePanels.has("ad-settings")}
            summary={
              (() => {
                const parts = [state.tone, selectedFormat.name, state.cta].filter(Boolean);
                return parts.length
                  ? <span className="wf-summary-text">{parts.join(" · ")}</span>
                  : <span className="wf-summary-empty">Not configured</span>;
              })()
            }
          >
            <div className="form-grid">
            <Field label="Tone" value={state.tone} onChange={(value) => update("tone", value)}>
              {tones.map((tone) => (
                <option key={tone}>{tone}</option>
              ))}
            </Field>

            <Field
              label="Platform + format"
              value={state.platformFormatId}
              onChange={(value) => update("platformFormatId", value)}
            >
              {["Facebook", "Instagram", "LinkedIn", "Threads", "X"].map((platform) => (
                <optgroup key={platform} label={platform}>
                  {formats.filter((f) => f.platform === platform).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.aspectRatio}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Field>

            <div className="spec-row">
              <div>
                <span>Aspect ratio</span>
                <strong>{selectedFormat.aspectRatio}</strong>
              </div>
              <div>
                <span>Resolution</span>
                <strong>{selectedFormat.resolution}</strong>
              </div>
            </div>

            <label className="field cta-field">
              <span>CTA</span>
              {editingCta ? (
                <input
                  autoFocus
                  type="text"
                  value={ctaDraft}
                  onChange={(e) => setCtaDraft(e.target.value)}
                  onBlur={commitEditCta}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEditCta();
                    if (e.key === "Escape") setEditingCta(false);
                  }}
                />
              ) : (
                <div className="cta-select-row">
                  <select value={state.cta} onChange={(event) => update("cta", event.target.value)}>
                    {!ctas.includes(state.cta) && <option value={state.cta}>{state.cta}</option>}
                    {ctas.map((cta) => (
                      <option key={cta}>{cta}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="cta-edit-button"
                    title="Edit CTA"
                    onClick={startEditCta}
                  >✏️</button>
                </div>
              )}
            </label>

            <Field label="Expression" value={state.expression} onChange={(value) => update("expression", value)}>
              {expressions.map((expression) => (
                <option key={expression}>{expression}</option>
              ))}
            </Field>

            {state.productId === "nfc_social_station" && (
              <Field
                label="Social platform"
                value={state.socialPlatform}
                onChange={(value) => update("socialPlatform", value as BuilderState["socialPlatform"])}
              >
                <option>Instagram</option>
                <option>Facebook</option>
                <option>Both</option>
              </Field>
            )}
            </div>
          </WorkflowPanel>

          <div className="segmented" aria-label="Image source" style={{ display: "none" }}>
            {["Generate new image", "Upload own image"].map((source) => (
              <button
                className={state.imageSource === source ? "active" : ""}
                key={source}
                onClick={() => update("imageSource", source as BuilderState["imageSource"])}
                type="button"
              >
                {source}
              </button>
            ))}
          </div>

          <WorkflowPanel
            id="special-instructions"
            activePanelId={activePanelId}
            onActivate={() => openPanel("special-instructions")}
            onDone={() => {
              if (kbOffers.length === 0) {
                setBuildKbUrgent(true);
                openPanel("business-info");
                return;
              }
              markDone("special-instructions");
              const p2Done = !!activeOffer && activeBenefitCount >= 1;
              if (p2Done) {
                setActivePanelId("");
              } else {
                setPanel6DoneError("Almost there — select an offer and at least 1 benefit in Step 2 to generate.");
                setPanel2IncomingAttention(true);
                setActivePanelId("offer-benefits");
              }
            }}
            setPanelRef={(el) => { panelRefs.current["special-instructions"] = el; }}
            hasIncomingAttention={incomingAttentionPanelId === "special-instructions"}
            doneError={panel6DoneError}
            isDone={donePanels.has("special-instructions")}
            summary={
              (() => {
                const text = (state.refinedInstructions || state.specialInstructions)?.trim();
                return text
                  ? <span className="wf-summary-text">{text.slice(0, 60)}{text.length > 60 ? "…" : ""}</span>
                  : <span className="wf-summary-empty">No instructions added</span>;
              })()
            }
          >
            <SpecialInstructions
              embedded
              rawText={state.specialInstructions ?? ""}
              refinedText={state.refinedInstructions ?? ""}
              onRawChange={(v) => setState((s) => ({ ...s, specialInstructions: v, refinedInstructions: "" }))}
              onRefined={(v) => setState((s) => ({ ...s, refinedInstructions: v }))}
            />
            {(state.specialInstructions || state.refinedInstructions) && (
              <button
                type="button"
                className="si-clear-btn"
                onClick={() => setState((s) => ({ ...s, specialInstructions: "", refinedInstructions: "" }))}
              >
                ✕ Clear Instructions
              </button>
            )}
          </WorkflowPanel>

        </aside>

        <div className="right-column">
          <section className={`kb-panel${activePanelId === "offer-benefits" ? " kb-step-active" : ""}${panel2IncomingAttention ? " panel2-incoming-attention" : ""}`}>
            <header className="kb-panel-header">
              <div className="kb-panel-header-top">
                <span className="kb-step-badge">2</span>
                <h3>Offer &amp; Benefits</h3>
                <button
                  type="button"
                  className={`kb-panel-done-btn${doneButtonShouldPulse ? " done-pulsing" : ""}`}
                  onClick={handlePanel2Done}
                >
                  Done
                </button>
              </div>
              <p>Pick one offer, then choose 1 to 4 benefits.</p>
              {panel2DoneError && <p className="kb-panel-done-error">{panel2DoneError}</p>}
            </header>
            {kbSelectedOffer !== null && Object.keys(kbBenefitsByOffer).length === 0 && (
              <p className="kb-rescan-notice">Previous selection loaded. Re-scan KB to reload benefit options.</p>
            )}

            <div className="kb-subcard quick-communication-card">
              <label className="quick-communication-field">
                <span className="kb-subcard-label">QUICK COMMUNICATION TYPE</span>
                <select
                  value={quickCommunicationTypeId}
                  onChange={(e) => {
                    const nextTypeId = e.target.value;
                    const nextSavedComboId = nextTypeId.startsWith(SAVED_COMBO_ID_PREFIX)
                      ? nextTypeId.slice(SAVED_COMBO_ID_PREFIX.length)
                      : null;
                    const nextSavedCombo = nextSavedComboId
                      ? savedCombos.find((combo) => combo.id === nextSavedComboId)
                      : null;
                    const nextType = quickCommunicationTypes.find((type) => type.id === nextTypeId);
                    setQuickCommunicationTypeId(nextTypeId);
                    if (nextSavedCombo) {
                      update("cta", nextSavedCombo.cta);
                    }
                    if (nextType?.suggestedCta) {
                      update("cta", nextType.suggestedCta);
                    }
                    setEditingPresetOffer(false);
                    setEditingPresetBenefit(null);
                    setPanel2DoneError(null);
                    setGenerateError(null);
                  }}
                  disabled={!hasBuiltKnowledgeBase}
                >
                  <optgroup label="Built-In Presets">
                    {quickCommunicationTypes.map((type) => (
                      <option key={type.id} value={type.id}>{type.label}</option>
                    ))}
                  </optgroup>
                  {savedCombos.length > 0 && (
                    <optgroup label="Saved Combos">
                      {savedCombos.map((combo) => (
                        <option key={combo.id} value={`${SAVED_COMBO_ID_PREFIX}${combo.id}`}>
                          {combo.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <p className="kb-subcard-desc">
                {hasBuiltKnowledgeBase
                  ? "Choose a preset to swap only the offer and benefit chip words."
                  : "Build the KB first, then choose an optional preset."}
              </p>
              <div className="saved-combo-actions">
                <button
                  type="button"
                  className="saved-combo-button"
                  onClick={handleSaveCurrentCombo}
                  disabled={!hasBuiltKnowledgeBase || !activeOffer || activeBenefitCount < 1}
                >
                  Save Current Combo
                </button>
                {activeSavedCombo && (
                  <button
                    type="button"
                    className="saved-combo-button saved-combo-delete"
                    onClick={handleDeleteActiveSavedCombo}
                  >
                    Delete Saved
                  </button>
                )}
              </div>
              {savedComboNotice && <p className="saved-combo-notice">{savedComboNotice}</p>}
            </div>

            <div className="kb-subcard">
              <div className="kb-subcard-head">
                <span className="kb-subcard-label">
                  {showSubOffers ? "OFFERS + SUB-OFFERS" : "OFFER CHIPS"}
                </span>
                <button
                  type="button"
                  className={`kb-toggle ${showSubOffers ? "on" : ""}`}
                  onClick={() => {
                    setShowSubOffers((v) => !v);
                    setKbSelectedOffer(null);
                    setEditingOffer(null);
                  }}
                  disabled={kbOffers.length === 0 && kbSubOffers.length === 0}
                  aria-pressed={showSubOffers}
                  title="Toggle Sub-Offers"
                >
                  <span className="kb-toggle-track"><span className="kb-toggle-thumb" /></span>
                  <span className="kb-toggle-text">Sub-Offers</span>
                </button>
              </div>
              <p className="kb-subcard-desc">
                {showSubOffers
                  ? "Primary pillars plus granular sub-offers detected on site."
                  : "Offers we'll pull from your website."}
              </p>
              {(showSubOffers
                ? [...kbOffers, ...kbSubOffers.filter((s) => !kbOffers.includes(s))]
                : kbOffers
              ).length === 0 ? (
                <p className="kb-subcard-cue">
                  Enter business details on the left and click Build KB.
                </p>
              ) : (
                <div className="kb-chips">
                  {!usingWebsiteOffer && activeManualOffer && (
                    <div className="kb-chip active kb-chip-preset">
                      {editingPresetOffer ? (
                        <input
                          autoFocus
                          className="kb-chip-edit-input"
                          value={chipDraft}
                          onChange={(e) => setChipDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={commitEditPresetOffer}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEditPresetOffer();
                            if (e.key === "Escape") setEditingPresetOffer(false);
                          }}
                        />
                      ) : (
                        <span className="kb-chip-text">{activeManualOffer}</span>
                      )}
                      <button
                        type="button"
                        className="kb-chip-action"
                        title="Edit"
                        onClick={(e) => { e.stopPropagation(); startEditPresetOffer(); }}
                      >✏️</button>
                    </div>
                  )}
                  {(showSubOffers
                    ? [...kbOffers, ...kbSubOffers.filter((s) => !kbOffers.includes(s))]
                    : kbOffers
                  ).map((offer) => (
                    <div
                      key={offer}
                      className={`kb-chip ${usingWebsiteOffer && kbSelectedOffer === offer ? "active" : ""} ${kbSubOffers.includes(offer) && !kbOffers.includes(offer) ? "kb-chip-sub" : ""}${!usingWebsiteOffer ? " kb-chip-muted" : ""}`}
                      onClick={() => editingOffer !== offer && usingWebsiteOffer && setKbSelectedOffer(offer)}
                    >
                      {editingOffer === offer ? (
                        <input
                          autoFocus
                          className="kb-chip-edit-input"
                          value={chipDraft}
                          onChange={(e) => setChipDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => commitEditOffer(offer)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEditOffer(offer);
                            if (e.key === "Escape") setEditingOffer(null);
                          }}
                        />
                      ) : (
                        <span className="kb-chip-text">{offer}</span>
                      )}
                      {usingWebsiteOffer && (
                        <>
                          <button
                            type="button"
                            className="kb-chip-action"
                            title="Edit"
                            onClick={(e) => { e.stopPropagation(); startEditOffer(offer); }}
                          >✏️</button>
                          <button
                            type="button"
                            className="kb-chip-action kb-chip-delete"
                            title="Delete"
                            onClick={(e) => { e.stopPropagation(); deleteOffer(offer); }}
                          >✕</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`kb-subcard kb-subcard-benefits${benefitsNeedAttention ? " benefits-attention" : ""}`}>
              <div className="kb-subcard-head">
                <span className="kb-subcard-label">BENEFIT STATEMENTS</span>
                {activeOffer && activeBenefitCount > 0 ? (
                  <span className="kb-benefit-counter">
                    {activeBenefitCount} / {BENEFIT_SELECTION_CAP} selected
                  </span>
                ) : null}
              </div>
              {!usingWebsiteOffer && activeManualOffer ? (
                <>
                  <p className="kb-subcard-cue kb-benefit-instruction">
                    Tick any 1 to {BENEFIT_SELECTION_CAP} benefit statements to bake into the prompt.
                  </p>
                  <ul className="kb-benefit-list">
                    {activeManualBenefits.map((benefit) => {
                      const checked = selectedManualBenefitsSet.has(benefit);
                      const atCap = selectedManualBenefitsSet.size >= BENEFIT_SELECTION_CAP;
                      const disabled = !checked && atCap;
                      return (
                      <li key={benefit} className={`kb-benefit-row${checked ? " checked" : ""}${disabled ? " disabled" : ""} kb-benefit-row-preset`}>
                        <label className="kb-benefit-checkbox-label">
                          <input
                            type="checkbox"
                            className="kb-benefit-checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleManualBenefit(benefit)}
                          />
                          {editingPresetBenefit === benefit ? (
                            <input
                              autoFocus
                              className="kb-chip-edit-input kb-benefit-edit-input"
                              value={chipDraft}
                              onChange={(e) => setChipDraft(e.target.value)}
                              onBlur={() => commitEditPresetBenefit(benefit)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEditPresetBenefit(benefit);
                                if (e.key === "Escape") setEditingPresetBenefit(null);
                              }}
                            />
                          ) : (
                            <span className="kb-benefit-text">{benefit}</span>
                          )}
                        </label>
                        <button
                          type="button"
                          className="kb-chip-menu-trigger"
                          aria-label="Edit preset benefit"
                          onClick={() => startEditPresetBenefit(benefit)}
                        >✏️</button>
                      </li>
                      );
                    })}
                  </ul>
                </>
              ) : kbSelectedOffer && kbBenefitsByOffer[kbSelectedOffer]?.length ? (
                <>
                  <p className="kb-subcard-cue kb-benefit-instruction">
                    Tick up to {BENEFIT_SELECTION_CAP} benefit statements to bake into the prompt.
                  </p>
                  <ul className="kb-benefit-list">
                    {kbBenefitsByOffer[kbSelectedOffer].map((benefit) => {
                      const checked = selectedBenefitsSet(kbSelectedOffer).has(benefit);
                      const atCap =
                        selectedBenefitsSet(kbSelectedOffer).size >= BENEFIT_SELECTION_CAP;
                      const disabled = !checked && atCap;
                      const isEditing = editingBenefit === benefit;
                      return (
                        <li
                          key={benefit}
                          className={`kb-benefit-row${checked ? " checked" : ""}${disabled ? " disabled" : ""}`}
                        >
                          <label className="kb-benefit-checkbox-label">
                            <input
                              type="checkbox"
                              className="kb-benefit-checkbox"
                              checked={checked}
                              disabled={disabled || isEditing}
                              onChange={() => toggleBenefit(benefit)}
                            />
                            {isEditing ? (
                              <input
                                autoFocus
                                className="kb-chip-edit-input kb-benefit-edit-input"
                                value={chipDraft}
                                onChange={(e) => setChipDraft(e.target.value)}
                                onBlur={() => commitEditBenefit(benefit)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitEditBenefit(benefit);
                                  if (e.key === "Escape") setEditingBenefit(null);
                                }}
                              />
                            ) : (
                              <span className="kb-benefit-text">{benefit}</span>
                            )}
                          </label>
                          <div className="kb-chip-menu-wrap">
                            <button
                              type="button"
                              className="kb-chip-menu-trigger"
                              aria-label="Edit or delete benefit"
                              onClick={() =>
                                setOpenBenefitMenu((cur) => (cur === benefit ? null : benefit))
                              }
                            >⋯</button>
                            {openBenefitMenu === benefit && (
                              <div className="kb-chip-menu" role="menu">
                                <button
                                  type="button"
                                  className="kb-chip-menu-item"
                                  onClick={() => {
                                    setOpenBenefitMenu(null);
                                    startEditBenefit(benefit);
                                  }}
                                >✏️ Edit</button>
                                <button
                                  type="button"
                                  className="kb-chip-menu-item kb-chip-menu-item-delete"
                                  onClick={() => {
                                    setOpenBenefitMenu(null);
                                    deleteBenefit(benefit);
                                  }}
                                >✕ Delete</button>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="kb-subcard-cue">
                  {kbOffers.length === 0
                    ? "Build the KB first to surface benefits."
                    : "Select an offer above to see matching benefits."}
                </p>
              )}
            </div>

            {doneButtonShouldPulse && !allLeftDone && (
              <button
                type="button"
                className="kb-done-mega"
                onClick={handlePanel2Done}
              >
                ✓ Done — Next: {nextPanelTitle} →
              </button>
            )}
          </section>

        <div className="action-row">
          <button
            className={`copy-prompt-mega ${copied ? "copied clicked-feedback" : ""}`}
            onClick={copyPrompt}
            type="button"
            aria-disabled={!canGeneratePrompt}
          >
            {copied ? "✓ Prompt Copied" : "📋 Copy Prompt"}
          </button>
          <button
            className={`copy-prompt-mega regenerate${regenDone ? " regen-done" : ""}${regenReady ? " regen-ready" : ""}`}
            onClick={handleGenerate}
            type="button"
            disabled={isGenerating}
            aria-disabled={!canGeneratePrompt}
          >
            {isGenerating ? <span className="btn-spinner" /> : regenDone ? "✓ Generated" : "↺ Generate Prompt"}
          </button>
        </div>
        {generateError && <p className="generate-requirements-note generate-requirements-warning">{generateError}</p>}

        <div className="output-accordion">
          <button
            className="output-accordion-trigger"
            onClick={() => setPromptOpen((o) => !o)}
            type="button"
            aria-expanded={promptOpen}
          >
            <span>{promptOpen ? "▲" : "▼"} Expanded prompt</span>
          </button>

          {promptOpen && (
            <section className="output-panel">
              <div className="output-header">
                <div>
                  <p>Copy-ready output</p>
                  <h2>{generated?.title ?? "No prompt generated yet"}</h2>
                </div>
                <div className="output-actions">
                  <button onClick={() => generate()} type="button" title="Regenerate">
                    <RefreshCw size={18} />
                  </button>
                  <button onClick={copyPrompt} type="button" title="Copy prompt">
                    {copied ? <Check size={18} /> : <Clipboard size={18} />}
                  </button>
                </div>
              </div>

              <div className="prompt-card">
                {generated ? (
                  generated.sections.map((section) => (
                    <article key={section.heading}>
                      <h3>{section.heading}</h3>
                      <p>{section.body}</p>
                    </article>
                  ))
                ) : (
                  <article>
                    <h3>Prompt</h3>
                    <p>Click Generate Prompt to create a fresh output from the current business details.</p>
                  </article>
                )}
              </div>
            </section>
          )}
        </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
