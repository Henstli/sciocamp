// GIFy přes Giphy (klíč v NEXT_PUBLIC_GIPHY_KEY; jen obsah s hodnocením G).

export const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_KEY ?? "";

/** Je zpráva jen odkaz na GIF z Giphy? (pak se ukáže jako obrázek) */
export function isGifUrl(body: string): boolean {
  return /^https:\/\/media\d*\.giphy\.com\/media\/[\w/.-]+\.(gif|webp)(\?[\w=&.-]*)?$/.test(body.trim());
}

export type GifResult = { id: string; preview: string; url: string; width: number; height: number; title: string };

type GiphyImage = { url: string; width: string; height: string };
type GiphyItem = { id: string; title: string; images: { fixed_height: GiphyImage; fixed_width_small?: GiphyImage; fixed_height_small?: GiphyImage } };

/** Vyhledá GIFy (prázdný dotaz = populární). */
export async function searchGifs(query: string, signal?: AbortSignal): Promise<GifResult[]> {
  const q = query.trim();
  const base = q ? "https://api.giphy.com/v1/gifs/search" : "https://api.giphy.com/v1/gifs/trending";
  const params = new URLSearchParams({ api_key: GIPHY_KEY, limit: "24", rating: "g", ...(q ? { q, lang: "cs" } : {}) });
  const res = await fetch(`${base}?${params}`, { signal });
  if (!res.ok) throw new Error("giphy");
  const json = (await res.json()) as { data: GiphyItem[] };
  return json.data.map((g) => {
    const big = g.images.fixed_height;
    const small = g.images.fixed_height_small ?? big;
    return {
      id: g.id,
      title: g.title,
      preview: small.url,
      url: big.url.split("?")[0],
      width: Number(big.width),
      height: Number(big.height),
    };
  });
}
