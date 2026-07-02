import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Lock, Sparkles, Upload, X } from "lucide-react";
import type { KBInputs, Tone, AdStyle, HeroEthnicity } from "@/lib/kb-types";
import type { LogoMode } from "@/lib/kb-types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { saveInputs } from "@/lib/kb-storage";
import { PalettePicker } from "./PalettePicker";
import { PLATFORM_SPECS, PLATFORM_GROUPS } from "@/lib/platform-specs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import papercraftImg from "@/assets/character-styles/papercraft.png";
import pixelArtImg from "@/assets/character-styles/pixel-art.png";
import motionComicImg from "@/assets/character-styles/motion-comic.png";
import proAvatarImg from "@/assets/character-styles/pro-avatar.png";

const TONES: Tone[] = ["Professional", "Friendly", "Urgent"];

type PanelId = "business" | "format" | "look" | "logo";
type PanelStatus = "locked" | "active" | "complete" | "recommended";

const PHOTO_STYLES: { value: AdStyle; sub: string }[] = [
  { value: "Industry Realistic Photo", sub: "Photoreal, on-site, natural light" },
  { value: "Clean Minimal", sub: "Studio, negative space, light type" },
  { value: "Bold Graphic", sub: "Flat/duotone, heavy display, hard borders" },
  { value: "Editorial Magazine", sub: "Cinematic photo + serif headline" },
  { value: "Retro / Vintage", sub: "Warm grain, slab/script, sticker chips" },
];

const CHARACTER_STYLES: {
  value: AdStyle;
  title: string;
  sub: string;
  preview: React.ReactNode;
}[] = [
  {
    value: "Papercraft Cutout",
    title: "Papercraft",
    sub: "Layered paper cutouts, warm & tactile",
    preview: (
      <img
        src={papercraftImg}
        alt="Papercraft cutout character preview"
        className="h-28 w-full rounded object-cover"
      />
    ),
  },
  {
    value: "Pixel Art Retro",
    title: "Pixel Art Retro",
    sub: "8-bit blocky, arcade aesthetic",
    preview: (
      <img
        src={pixelArtImg}
        alt="Pixel art retro character preview"
        className="h-28 w-full rounded object-cover"
        style={{ imageRendering: "pixelated" }}
      />
    ),
  },
  {
    value: "Bold Motion Comic",
    title: "Bold Motion Comic",
    sub: "Graphic-novel hero, energetic",
    preview: (
      <img
        src={motionComicImg}
        alt="Bold motion comic character preview"
        className="h-28 w-full rounded object-cover"
      />
    ),
  },
  {
    value: "Sleek Professional Avatar",
    title: "Pro Avatar",
    sub: "Polished animated headshot",
    preview: (
      <img
        src={proAvatarImg}
        alt="Sleek professional avatar preview"
        className="h-28 w-full rounded object-cover"
      />
    ),
  },
];

export function InputPanel({
  inputs,
  setInputs,
  onBuild,
  loading,
  uploadedLogoDataUrl,
  onUploadLogo,
  onClearUploadedLogo,
  logoMode,
  onLogoModeChange,
  hasAnyLogo,
  hasKB,
  researchDirty,
  canRegenerate,
  regenerating,
  onRegenerateAd,
  imageGenerationEnabled = true,
  lookDirty: lookDirtyProp,
  hasLookSnapshot,
}: {
  inputs: KBInputs;
  setInputs: (i: KBInputs) => void;
  onBuild: () => void;
  loading: boolean;
  uploadedLogoDataUrl: string | null;
  onUploadLogo: (dataUrl: string) => void;
  onClearUploadedLogo: () => void;
  logoMode: LogoMode;
  onLogoModeChange: (m: LogoMode) => void;
  hasAnyLogo: boolean;
  hasKB: boolean;
  researchDirty: boolean;
  canRegenerate: boolean;
  regenerating: boolean;
  onRegenerateAd: () => void;
  imageGenerationEnabled?: boolean;
  lookDirty?: boolean;
  hasLookSnapshot?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  // Guided panel flow: user must click Done on each panel to advance.
  const [confirmed, setConfirmed] = useState<Set<PanelId>>(() => new Set());
  // Tracks the panel the user has explicitly clicked into. When set, that
  // panel becomes "active" (white) and every OTHER panel is dimmed — only
  // one card is highlighted at a time.
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);

  // L&F dirty tracking is owned by the parent so it can also drive the
  // right-side cards. Fall back to "no snapshot yet" semantics if not passed.
  const lookDirty = !!lookDirtyProp;
  const lookSnapshotExists = !!hasLookSnapshot;

  useEffect(() => {
    saveInputs(inputs);
  }, [inputs]);

  // Pre-fill a sensible Visual Style default on first load.
  useEffect(() => {
    if (!inputs.adStyle) {
      setInputs({ ...inputs, adStyle: "Industry Realistic Photo" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof KBInputs>(k: K, v: KBInputs[K]) =>
    setInputs({ ...inputs, [k]: v });

  const setPlatform = (v: string) => {
    const spec = PLATFORM_SPECS[v];
    if (!spec) return;
    setInputs({
      ...inputs,
      platform: v,
      aspectRatio: spec.aspectRatio,
      resolution: spec.resolution,
    });
  };

  // Per-panel validity (required fields only).
  const businessValid =
    inputs.websiteUrl.trim().length > 0 &&
    inputs.companyName.trim().length > 0 &&
    inputs.businessType.trim().length > 0;
  const formatValid = !!inputs.platform && !!inputs.tone;
  const lookValid = !!inputs.adStyle && !!inputs.paletteId;
  const validity: Record<PanelId, boolean> = {
    business: businessValid,
    format: formatValid,
    look: lookValid,
    logo: true,
  };

  // Auto-revoke confirmation if a previously-complete panel becomes invalid
  // (per "auto after edits" rule).
  useEffect(() => {
    setConfirmed((prev) => {
      let changed = false;
      const next = new Set(prev);
      (Object.keys(validity) as PanelId[]).forEach((id) => {
        if (next.has(id) && !validity[id]) {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessValid, formatValid, lookValid]);

  // If the user edited business fields after building the KB, drop business
  // confirmation so the guided cue points back to it.
  useEffect(() => {
    if (researchDirty) {
      setConfirmed((prev) => {
        if (!prev.has("business")) return prev;
        const next = new Set(prev);
        next.delete("business");
        return next;
      });
    }
  }, [researchDirty]);

  const order: PanelId[] = ["business", "format", "logo", "look"];
  const status = (id: PanelId): PanelStatus => {
    const idx = order.indexOf(id);
    const earlierAllDone = order.slice(0, idx).every((p) => confirmed.has(p));
    if (!earlierAllDone) return "locked";
    // Explicit click overrides natural flow — chosen panel becomes active.
    if (activePanel === id) {
      return id === "logo" && !confirmed.has(id) ? "recommended" : "active";
    }
    if (confirmed.has(id)) return "complete";
    // Logo uses softer "recommended" glow since it's optional to upload.
    return id === "logo" ? "recommended" : "active";
  };

  // When the user has explicitly clicked into one card, every other card
  // should visually recede — keep its real status (no fake check marks),
  // just dim the glow + opacity so only the focused card is highlighted.
  const isDimmed = (id: PanelId) => activePanel !== null && activePanel !== id;

  const confirm = (id: PanelId) =>
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  // When a panel is confirmed via Done, release the explicit-active focus
  // so the natural next-step flow takes over again.
  const handleConfirm = (id: PanelId) => {
    confirm(id);
    setActivePanel(null);
  };

  // Look & Feel no longer requires a separate Done click — Build/Regen IS the confirm.
  const canBuild =
    businessValid &&
    lookValid &&
    !loading &&
    confirmed.has("business") &&
    confirmed.has("format") &&
    confirmed.has("logo") &&
    (!hasKB || researchDirty);

  // Wrap build/regen so the Look & Feel panel is implicitly marked complete.
  const scrollToTop = () => {
    // Jump immediately, then smooth-settle on the next frame so later
    // re-renders (state resets, layout shifts) can't strand us mid-page.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });
  };
  const handleBuild = () => {
    confirm("look");
    scrollToTop();
    onBuild();
  };
  const handleRegenerate = () => {
    confirm("look");
    scrollToTop();
    onRegenerateAd();
  };

  const buildLabel = hasKB && researchDirty ? "Rebuild KB" : "Build KB";

  const stepNumber: Record<PanelId, number> = { business: 1, format: 2, logo: 3, look: 4 };

  // Character style currently selected (if any), used to swap the
  // Visual Style trigger label and the Animated Character collapsed label.
  const characterStyle = CHARACTER_STYLES.find((c) => c.value === inputs.adStyle);
  const characterSelected = !!characterStyle;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Business Inputs</h2>
        <p className="text-xs text-muted-foreground">
          Confirm each step to unlock the next. Saved automatically.
        </p>
      </div>

      <GroupCard
        title="Business"
        status={status("business")}
        stepNumber={stepNumber.business}
        totalSteps={4}
        canConfirm={businessValid}
        onConfirm={() => handleConfirm("business")}
        onActivate={() => setActivePanel("business")}
        dimmed={isDimmed("business")}
      >
        <Field label="Website URL">
        <Input
          placeholder="https://example.com"
          value={inputs.websiteUrl}
          onChange={(e) => set("websiteUrl", e.target.value)}
        />
        </Field>
        <Field label="Company Name">
        <Input
          placeholder="Acme Plumbing Co."
          value={inputs.companyName}
          onChange={(e) => set("companyName", e.target.value)}
        />
        </Field>
        <Field label="Location Area">
        <Input
          placeholder="Surrey, BC"
          value={inputs.location}
          onChange={(e) => set("location", e.target.value)}
        />
        </Field>
        <Field label="Business Type">
        <Input
          placeholder="Plumber, Nail Salon, Med Spa…"
          value={inputs.businessType}
          onChange={(e) => set("businessType", e.target.value)}
        />
        </Field>
      </GroupCard>

      <GroupCard
        title="Output Format"
        status={status("format")}
        stepNumber={stepNumber.format}
        totalSteps={4}
        canConfirm={formatValid}
        onConfirm={() => handleConfirm("format")}
        onActivate={() => setActivePanel("format")}
        dimmed={isDimmed("format")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Platform + Format">
          <Select value={inputs.platform} onValueChange={setPlatform}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLATFORM_GROUPS.map((g, gi) => (
                <div key={g.group}>
                  {gi > 0 && (
                    <div role="separator" aria-hidden className="h-2" />
                  )}
                  {g.items.map((spec) => (
                    <SelectItem key={spec.name} value={spec.name}>
                      <span className="flex w-full items-center justify-between gap-3">
                        <span>{spec.name}</span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {spec.aspectRatio}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tone">
          <Select value={inputs.tone} onValueChange={(v) => set("tone", v as Tone)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ReadonlyTile label="Aspect Ratio" value={inputs.aspectRatio} />
        <ReadonlyTile label="Resolution" value={inputs.resolution.replace("x", "×")} />
        </div>
      </GroupCard>

      <GroupCard
        title="Logo"
        badge="Recommended"
        status={status("logo")}
        stepNumber={stepNumber.logo}
        totalSteps={4}
        canConfirm
        onConfirm={() => handleConfirm("logo")}
        onActivate={() => setActivePanel("logo")}
        dimmed={isDimmed("logo")}
      >
        <Field label="Brand Logo">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) {
              alert("Logo file must be under 8MB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = async () => {
              const result = reader.result;
              if (typeof result !== "string") return;
              // Normalize uploads (webp/jpeg/svg) to PNG so the AI receives
              // one consistent, lossless reference image format.
              try {
                const { normalizeLogoToPng } = await import("@/lib/logo-composite");
                const png = await normalizeLogoToPng(result);
                onUploadLogo(png);
              } catch {
                onUploadLogo(result);
              }
            };
            reader.readAsDataURL(file);
            e.target.value = "";
          }}
        />
        {uploadedLogoDataUrl ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-2">
            <img
              src={uploadedLogoDataUrl}
              alt="Uploaded logo preview"
              className="h-12 w-12 rounded object-contain bg-white/80 p-1"
            />
            <div className="flex-1 text-xs text-muted-foreground">
              Using your uploaded logo for ad generation.
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearUploadedLogo}
              title="Remove uploaded logo"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload logo (overrides website logo)
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground mt-1">
          <span className="font-semibold text-foreground">Recommended:</span> upload your logo (PNG, JPG, WEBP, or SVG). We try to auto-grab one from your website, but it often fails or pulls the wrong image — uploading guarantees the right brand.
        </p>
        </Field>

        {hasAnyLogo && (
          <Field label="Logo Handling">
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="logo-mode"
                  className="mt-1"
                  checked={logoMode === "composite"}
                  onChange={() => onLogoModeChange("composite")}
                />
                <span className="text-xs leading-snug">
                  <span className="font-semibold text-foreground">
                    Leave Space for My Logo — Recommended
                  </span>
                  <span className="block text-muted-foreground">
                    The prompt creates a clean empty area where you can add
                    your real logo afterward in Canva, ChatGPT editor, or
                    another design tool. This keeps your logo accurate and
                    unchanged.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="logo-mode"
                  className="mt-1"
                  checked={logoMode === "ai-blend"}
                  onChange={() => onLogoModeChange("ai-blend")}
                />
                <span className="text-xs leading-snug">
                  <span className="font-semibold text-foreground">
                    Ask AI to Include My Logo — Advanced
                  </span>
                  <span className="block text-amber-500">
                    The AI will try to include the logo in the image, but
                    it may change, miss, or distort the logo.
                  </span>
                </span>
              </label>
            </div>
          </Field>
        )}
      </GroupCard>

      <GroupCard
        title="Look & Feel"
        status={status("look")}
        stepNumber={stepNumber.look}
        totalSteps={4}
        onActivate={() => setActivePanel("look")}
        dimmed={
          isDimmed("look") ||
          (hasKB && !lookDirty && activePanel !== "look")
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Visual Style">
          <Select
            value={characterSelected ? undefined : inputs.adStyle}
            onValueChange={(v) => {
              set("adStyle", v as AdStyle);
              setCharacterOpen(false);
            }}
          >
            <SelectTrigger>
              {characterSelected ? (
                <span className="italic text-muted-foreground text-sm truncate">
                  Animated character chosen — {characterStyle!.title}
                </span>
              ) : (
                <SelectValue placeholder="Choose a style…" />
              )}
            </SelectTrigger>
            <SelectContent>
              {PHOTO_STYLES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <span className="flex flex-col">
                    <span className="font-medium">{t.value}</span>
                    <span className="text-[11px] text-muted-foreground">{t.sub}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ad Color Palette">
          <PalettePicker
            variant="field"
            value={inputs.paletteId}
            source={inputs.paletteSource}
            onChange={({ paletteId, paletteSource }) =>
              setInputs({ ...inputs, paletteId, paletteSource })
            }
          />
        </Field>
        </div>

        <Collapsible open={characterOpen} onOpenChange={setCharacterOpen} className="space-y-1.5">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left hover:border-muted-foreground/40 transition-colors">
          <Label className="font-serif italic text-sm font-bold cursor-pointer">
            Animated Character Style
            {!characterOpen && characterSelected && (
              <span className="not-italic font-normal text-muted-foreground">
                {" — "}
                <span className="italic font-bold text-foreground">{characterStyle!.title}</span>
                {" chosen"}
              </span>
            )}
            {!characterOpen && !characterSelected && (
              <span className="not-italic font-normal text-muted-foreground">
                {" "}(not selected)
              </span>
            )}
          </Label>
          <ChevronDown
            className={
              "h-4 w-4 text-muted-foreground transition-transform " +
              (characterOpen ? "rotate-180" : "")
            }
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {CHARACTER_STYLES.map((opt) => {
            const selected = inputs.adStyle === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("adStyle", opt.value)}
                className={
                  "rounded-md border p-1.5 text-left transition-all " +
                  (selected
                    ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                    : "border-input hover:border-muted-foreground/40 bg-background")
                }
              >
                {opt.preview}
                <div className="mt-1.5 px-0.5">
                  <div className="font-serif italic text-[11px] font-bold leading-tight">
                    {opt.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {opt.sub}
                  </div>
                </div>
              </button>
            );
          })}
          </div>
        </CollapsibleContent>
        </Collapsible>

        <Collapsible open={castOpen} onOpenChange={setCastOpen} className="space-y-1.5">
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left hover:border-muted-foreground/40 transition-colors">
          <Label className="font-serif italic text-sm font-bold cursor-pointer">
            Cast & People <span className="text-muted-foreground font-normal not-italic">(optional)</span>
            {!castOpen && inputs.heroEthnicity !== "Auto" && (
              <span className="not-italic font-normal text-muted-foreground">
                {" — "}
                <span className="italic font-bold text-foreground">{inputs.heroEthnicity}</span>
              </span>
            )}
            {!castOpen && inputs.heroEthnicity === "Auto" && (
              <span className="not-italic font-normal text-muted-foreground">
                {" "}(not selected)
              </span>
            )}
          </Label>
          <ChevronDown
            className={
              "h-4 w-4 text-muted-foreground transition-transform " +
              (castOpen ? "rotate-180" : "")
            }
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2 space-y-1.5">
            <Label className="text-xs">Hero ethnicity</Label>
            <Select
              value={inputs.heroEthnicity}
              onValueChange={(v) => set("heroEthnicity", v as HeroEthnicity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Auto">Auto (no preference)</SelectItem>
                <SelectItem value="Chinese">East Asian — Chinese</SelectItem>
                <SelectItem value="Indian/Punjabi">South Asian — Indian / Punjabi</SelectItem>
                <SelectItem value="Pakistani">South Asian — Pakistani</SelectItem>
                <SelectItem value="Filipino">Southeast Asian — Filipino</SelectItem>
                <SelectItem value="Vietnamese">Southeast Asian — Vietnamese</SelectItem>
                <SelectItem value="Korean">East Asian — Korean</SelectItem>
                <SelectItem value="Japanese">East Asian — Japanese</SelectItem>
                <SelectItem value="Iranian/Persian">West Asian — Iranian / Persian</SelectItem>
                <SelectItem value="Arab">West Asian — Arab</SelectItem>
                <SelectItem value="Latin American">Latin American</SelectItem>
                <SelectItem value="Indigenous">Indigenous — First Nations / Métis</SelectItem>
                <SelectItem value="Black">Black</SelectItem>
                <SelectItem value="White/European">White / European</SelectItem>
                <SelectItem value="Mixed">Mixed / Multi-ethnic</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Guides the appearance of the main person only. Doesn't change clothing, setting, or background cast — secondary people stay a natural mixed-Vancouver crowd.
            </p>
          </div>
        </CollapsibleContent>
        </Collapsible>

        <div className="mt-1 flex gap-2">
        <Button
          onClick={handleBuild}
          disabled={!canBuild}
          className={cn(
            "glow-button flex-1 bg-gradient-to-r from-[color:var(--state-loading-a)] via-[color:var(--state-loading-c)] to-[color:var(--state-loading-b)] text-primary-foreground font-semibold hover:opacity-95",
            canBuild && !loading && "build-ready"
          )}
        >
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Researching…</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> {buildLabel}</>
          )}
        </Button>
        <Button
          onClick={handleRegenerate}
          disabled={!canRegenerate || regenerating || loading}
          className={cn(
            "glow-button flex-1 bg-gradient-to-r from-[color:var(--state-complete-a)] to-[color:var(--state-complete-b)] text-[oklch(0.15_0.02_270)] font-semibold disabled:opacity-60",
            canRegenerate && !regenerating && !loading && (!lookSnapshotExists || lookDirty) && "build-ready"
          )}
          title={
            !hasKB
              ? "Build the KB first"
              : !canRegenerate
              ? "Pick an offer + 3 benefits to enable"
              : imageGenerationEnabled
              ? "Regenerate ad with current look settings"
              : "Regenerate prompt with current settings"
          }
        >
          {regenerating ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cooking…</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> {imageGenerationEnabled ? "Regenerate Ad" : "Regenerate Prompt"}</>
          )}
        </Button>
        </div>
        {hasKB && !researchDirty && (
          <p className="text-[11px] text-muted-foreground">
          KB locked in — change look settings above and click <strong>{imageGenerationEnabled ? "Regenerate Ad" : "Regenerate Prompt"}</strong> to apply.
          </p>
        )}
        {hasKB && researchDirty && (
          <p className="text-[11px] text-amber-500">
          Business fields changed — rebuilding KB will replace your current chips & benefits.
          </p>
        )}
      </GroupCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-bold">{label}</Label>
      {children}
    </div>
  );
}

function GroupCard({
  title,
  badge,
  status = "active",
  stepNumber,
  totalSteps,
  canConfirm = false,
  onConfirm,
  onActivate,
  optional = false,
  dimmed = false,
  children,
}: {
  title: string;
  badge?: string;
  status?: PanelStatus;
  stepNumber?: number;
  totalSteps?: number;
  canConfirm?: boolean;
  onConfirm?: () => void;
  onActivate?: () => void;
  optional?: boolean;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  const isLocked = status === "locked";
  const isComplete = status === "complete";
  const isActive = status === "active";
  const isRecommended = status === "recommended";

  // When dimmed (another card is the explicit focus), suppress the bright
  // animated glow so only the focused card visually pops.
  const glowClass = isLocked
    ? "glow-locked"
    : dimmed
    ? "glow-locked"
    : isComplete
    ? "glow-complete"
    : isRecommended
    ? "glow-recommended"
    : "glow-active";

  return (
    <div
      className={cn(
        "glow-border transition-opacity duration-150",
        glowClass,
        isLocked && "opacity-60",
        isComplete && !dimmed && "opacity-75 hover:opacity-100",
        dimmed && !isLocked && "opacity-55 hover:opacity-90"
      )}
    >
      <section
        className={cn(
          "rounded-2xl p-4 space-y-3 transition-colors",
          isComplete
            ? "bg-muted/30"
            : "bg-[color:color-mix(in_oklab,var(--primary)_4%,var(--card))]",
          isLocked && "pointer-events-none"
        )}
        onMouseDown={() => { if (!isLocked) onActivate?.(); }}
        onFocusCapture={() => { if (!isLocked) onActivate?.(); }}
      >
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {stepNumber && (
              <span
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1",
                  isComplete
                    ? "bg-[color:var(--state-complete-a)]/25 text-[color:var(--state-complete-a)] ring-[color:var(--state-complete-a)]/50"
                    : isLocked
                    ? "bg-muted/60 text-muted-foreground ring-border"
                    : "bg-[color:var(--primary)]/25 text-[color:var(--primary)] ring-[color:var(--primary)]/50"
                )}
                aria-label={`Step ${stepNumber} of ${totalSteps}`}
              >
                {isComplete ? <Check className="h-3 w-3" /> : isLocked ? <Lock className="h-3 w-3" /> : stepNumber}
              </span>
            )}
            <h3
              className={cn(
                "text-[11px] font-bold uppercase tracking-[0.12em] truncate",
                isLocked || isComplete
                  ? "text-muted-foreground"
                  : "text-[color:var(--primary)]"
              )}
            >
              {title}
            </h3>
            {badge && (
              <span className="rounded-full bg-[color:var(--state-complete-a)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--state-complete-a)] ring-1 ring-[color:var(--state-complete-a)]/40">
                {badge}
              </span>
            )}
          </div>
          {onConfirm && (
            <Button
              type="button"
              size="sm"
              variant={isComplete ? "outline" : "default"}
              onClick={onConfirm}
              disabled={isLocked || isComplete || !canConfirm}
              className={cn(
                "h-7 px-2.5 text-[11px] font-bold",
                isComplete && "border-[color:var(--state-complete-a)]/50 text-[color:var(--state-complete-a)]"
              )}
              title={
                isComplete
                  ? "Confirmed"
                  : !canConfirm
                  ? "Fill required fields to continue"
                  : "Mark this step done and unlock the next"
              }
            >
              {isComplete ? (
                <><Check className="h-3 w-3 mr-1" /> Done</>
              ) : (
                "Done"
              )}
            </Button>
          )}
        </header>
        {children}
      </section>
    </div>
  );
}

function ReadonlyTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-bold mt-0.5">{value}</div>
    </div>
  );
}

function LogoStylePicker({
  value,
  onChange,
}: {
  value: "dark" | "light" | "boxed";
  onChange: (v: "dark" | "light" | "boxed") => void;
}) {
  const options: { value: "dark" | "light" | "boxed"; title: string; sub: string; preview: React.ReactNode }[] = [
    {
      value: "dark",
      title: "Dark logo",
      sub: "Dark text, no box",
      preview: (
        <div className="flex h-10 items-center justify-center rounded bg-white">
          <span className="text-[11px] font-extrabold tracking-tight text-neutral-900">BRAND</span>
        </div>
      ),
    },
    {
      value: "light",
      title: "Light logo",
      sub: "Light text, no box",
      preview: (
        <div className="flex h-10 items-center justify-center rounded bg-neutral-900">
          <span className="text-[11px] font-extrabold tracking-tight text-white">BRAND</span>
        </div>
      ),
    },
    {
      value: "boxed",
      title: "Boxed logo",
      sub: "Has its own background",
      preview: (
        <div className="flex h-10 items-center justify-center rounded bg-neutral-200">
          <span className="rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-extrabold tracking-tight text-white">
            BRAND
          </span>
        </div>
      ),
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              "rounded-md border p-1.5 text-left transition-all " +
              (selected
                ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                : "border-input hover:border-muted-foreground/40 bg-background")
            }
          >
            {opt.preview}
            <div className="mt-1.5 px-0.5">
              <div className="text-[11px] font-bold leading-tight">{opt.title}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{opt.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}