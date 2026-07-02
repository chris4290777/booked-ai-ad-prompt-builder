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

// Samples the most chromatically vivid opaque pixel from the logo. Returns
// null when no saturated pixel is found (white, black, or greyscale logo) so
// callers can detect mono logos and offer the dark-backed adjustment UI.
export async function extractDominantAccent(logo: NormalizedLogo): Promise<string | null> {
  const img = await loadImage(logo.dataUrl);
  const size = Math.min(logo.width, logo.height, 128);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  let bestHex = "";
  let bestSat = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (l < 0.12 || l > 0.88 || s < 0.28) continue;
    if (s > bestSat) {
      bestSat = s;
      bestHex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }
  }
  return bestHex || null;
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
