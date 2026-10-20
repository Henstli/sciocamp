// Zmenšení fotek v prohlížeči před nahráním (šetří úložiště i data).
// Fotku z mobilu (3–5 MB) zmenší na delší stranu MAX_SIDE px a uloží jako JPEG;
// obrázek s průhledností zůstane PNG. GIF (animace), SVG a jiné soubory se nemění.
// Když by výsledek nebyl menší nebo se obrázek nedá načíst, vrátí původní soubor.

export const MAX_SIDE = 2048;
const QUALITY = 0.82;
/** Menší obrázky v rozumném rozlišení se nepřepočítávají. */
const SMALL_ENOUGH = 400 * 1024;
const RESIZABLE = /^image\/(jpeg|jpg|png|webp|heic|heif|avif|bmp)$/i;

export function isCompressibleImage(file: File): boolean {
  if (RESIZABLE.test(file.type)) return true;
  // Některé prohlížeče u HEIC z iPhonu typ neuvedou.
  return !file.type && /\.(heic|heif)$/i.test(file.name);
}

async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/** Vrátí zmenšenou kopii fotky, nebo původní soubor. */
export async function compressImage(file: File): Promise<File> {
  if (typeof document === "undefined" || !isCompressibleImage(file)) return file;
  let img: Awaited<ReturnType<typeof loadImage>>;
  try {
    img = await loadImage(file);
  } catch {
    return file; // prohlížeč formát neumí (např. HEIC mimo Safari)
  }
  try {
    const { width, height } = img;
    if (!width || !height) return file;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    if (scale === 1 && file.size <= SMALL_ENOUGH) return file;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.source, 0, 0, w, h);

    const transparent = /png|webp|avif/i.test(file.type) && hasTransparency(ctx, w, h);
    let blob: Blob | null;
    let ext: string;
    if (transparent) {
      blob = await toBlob(canvas, "image/png");
      ext = "png";
    } else {
      // JPEG neumí průhlednost — podklad bílý (pro jistotu, kdyby nějaký pixel byl).
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      blob = await toBlob(canvas, "image/jpeg", QUALITY);
      ext = "jpg";
    }
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    img.close();
  }
}
