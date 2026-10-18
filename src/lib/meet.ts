/**
 * Převede, co vyučující vloží (celý odkaz, odkaz bez https, nebo jen kód
 * „abc-defg-hij“), na tvar https://meet.google.com/<kód>. Null = neplatné.
 */
export function normalizeMeetUrl(input: string): string | null {
  const v = input.trim();
  const code = v.match(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i)?.[0];
  if (code) return `https://meet.google.com/${code.toLowerCase()}`;
  const m = v.match(/^(?:https?:\/\/)?meet\.google\.com\/([a-z0-9-]+)\/?(?:[?#].*)?$/i);
  if (m && m[1] !== "new" && m[1] !== "landing") return `https://meet.google.com/${m[1].toLowerCase()}`;
  return null;
}
