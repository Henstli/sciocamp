// Podepsaná session cookie pro ukázkový režim (etapa 1).
// Používá Web Crypto, takže funguje v proxy.ts i na serveru.
// Po napojení Supabase Auth (Google) se tento soubor nahradí jejich session.

export const SESSION_COOKIE = "sc_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dní

const DEV_SECRET = "sciocamp-dev-secret-jen-pro-lokalni-vyvoj";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Chybí SESSION_SECRET (aspoň 32 znaků). Nastav ho v proměnných prostředí na Vercelu.");
  }
  return DEV_SECRET;
}

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  return `${payload}.${await hmac(payload)}`;
}

export async function readSessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(payload))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof uid !== "string" || typeof exp !== "number") return null;
    if (exp < Date.now() / 1000) return null;
    return uid;
  } catch {
    return null;
  }
}
