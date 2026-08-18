// ─── Logo Normalizer ──────────────────────────────────────────────────────
// Accepts any browser-decodable image file (PNG, JPG, WEBP, GIF, BMP, SVG)
// and converts it to a transparent PNG data URL, capped at a reasonable
// pixel size so the file stays attachable to any image LLM. Preserves alpha.
// Exotic formats the browser can't decode (HEIC on non-Safari, WBMP, etc.)
// throw a helpful error so the UI can guide the user to re-save as PNG.

export interface NormalizedLogo {
  dataUrl: string;       // image/png data URL
  filename: string;      // suggested .png filename derived from the original
  width: number;
  height: number;
}

export interface ExtractedLogoPalette {
  primary: string | null;
  secondary: string | null;
  contrast: string;
}

const ACCEPTED_MIME = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml|avif)$/i;
const MAX_LONG_EDGE = 2048;     // raster cap
const SVG_RENDER_EDGE = 1024;   // SVG default render size if intrinsic missing

function stripExtension(name: string): string {
  return name.replace(/\.[^./]+$/, "");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("File could not be read as a data URL."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be decoded by the browser."));
    img.src = src;
  });
}

function rasterizeToPng(
  img: HTMLImageElement,
  targetLongEdge: number,
): { dataUrl: string; width: number; height: number } {
  const naturalW = img.naturalWidth || img.width || targetLongEdge;
  const naturalH = img.naturalHeight || img.height || targetLongEdge;

  let drawW = naturalW;
  let drawH = naturalH;
  const longEdge = Math.max(drawW, drawH);
  if (longEdge > targetLongEdge) {
    const scale = targetLongEdge / longEdge;
    drawW = Math.round(drawW * scale);
    drawH = Math.round(drawH * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = drawW;
  canvas.height = drawH;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Browser could not create a 2D canvas context.");
  // Transparent base — never paint a white background; preserves logo alpha.
  ctx.clearRect(0, 0, drawW, drawH);
  ctx.drawImage(img, 0, 0, drawW, drawH);
  const dataUrl = canvas.toDataURL("image/png");
  return { dataUrl, width: drawW, height: drawH };
}

export async function normalizeLogoToPng(file: File): Promise<NormalizedLogo> {
  if (!file) throw new Error("No file provided.");
  if (!ACCEPTED_MIME.test(file.type) && !/\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(file.name)) {
    throw new Error(
      `Unsupported logo format: ${file.type || file.name.split(".").pop() || "unknown"}. ` +
        `Please re-save your logo as PNG, JPG, WEBP, or SVG and upload again.`,
    );
  }

  const sourceDataUrl = await readFileAsDataUrl(file);

  let img: HTMLImageElement;
  try {
    img = await loadImage(sourceDataUrl);
  } catch {
    throw new Error(
      `Your browser couldn't decode this logo file. Please re-save it as PNG or JPG and upload again.`,
    );
  }

  const isSvg = /^image\/svg\+xml/i.test(file.type) || /\.svg$/i.test(file.name);
  const longEdgeCap = isSvg
    ? Math.max(SVG_RENDER_EDGE, img.naturalWidth, img.naturalHeight) || SVG_RENDER_EDGE
    : MAX_LONG_EDGE;

  const { dataUrl, width, height } = rasterizeToPng(img, longEdgeCap);
  const filename = `${stripExtension(file.name) || "brand-logo"}.png`;

  return { dataUrl, filename, width, height };
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function colorDistance(a: string, b: string) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b);
}

// Samples the most useful brand colors from the logo. Primary prefers the
// most visible saturated color; secondary prefers a clearly different vivid
// color. White/black/greyscale are ignored as accents and reserved for contrast.
export async function extractLogoPalette(logo: NormalizedLogo): Promise<ExtractedLogoPalette> {
  const img = await loadImage(logo.dataUrl);
  const size = Math.min(logo.width, logo.height, 128);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return { primary: null, secondary: null, contrast: "#ffffff" };
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const buckets = new Map<string, { r: number; g: number; b: number; count: number; sat: number; light: number }>();
  let lightPixels = 0;
  let darkPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (l > 0.88 && s < 0.18) lightPixels += 1;
    if (l < 0.16 && s < 0.28) darkPixels += 1;
    if (l < 0.12 || l > 0.88 || s < 0.28) continue;

    const qr = Math.round(r / 24) * 24;
    const qg = Math.round(g / 24) * 24;
    const qb = Math.round(b / 24) * 24;
    const key = `${qr},${qg},${qb}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0, sat: 0, light: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    bucket.sat += s;
    bucket.light += l;
    buckets.set(key, bucket);
  }

  const candidates = Array.from(buckets.values())
    .filter((bucket) => bucket.count >= 2)
    .map((bucket) => {
      const r = Math.round(bucket.r / bucket.count);
      const g = Math.round(bucket.g / bucket.count);
      const b = Math.round(bucket.b / bucket.count);
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      const sat = bucket.sat / bucket.count;
      const light = bucket.light / bucket.count;
      const score = bucket.count * (0.65 + sat) * (light > 0.18 && light < 0.82 ? 1.15 : 0.9);
      return { hex, score };
    })
    .sort((a, b) => b.score - a.score);

  const primary = candidates[0]?.hex ?? null;
  const secondary = primary
    ? candidates.find((candidate) => colorDistance(candidate.hex, primary) >= 90)?.hex ?? null
    : null;
  const contrast = lightPixels >= darkPixels ? "#ffffff" : "#111827";

  return { primary, secondary, contrast };
}

// Backwards-compatible single-accent helper.
export async function extractDominantAccent(logo: NormalizedLogo): Promise<string | null> {
  const palette = await extractLogoPalette(logo);
  return palette.primary;
}

// Composites the logo onto a solid baseHex background and returns a new
// NormalizedLogo. Used to create a palette-matched version of a white/mono
// logo so the user can see and download an attachment-ready contrasted copy.
export async function createDarkBackedLogo(
  logo: NormalizedLogo,
  baseHex: string,
): Promise<NormalizedLogo> {
  const img = await loadImage(logo.dataUrl);
  const w = img.naturalWidth || logo.width;
  const h = img.naturalHeight || logo.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    filename: logo.filename.replace(/\.png$/i, "-palette-matched.png"),
    width: logo.width,
    height: logo.height,
  };
}

export function downloadNormalizedLogo(logo: NormalizedLogo): void {
  const link = document.createElement("a");
  link.href = logo.dataUrl;
  link.download = logo.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
