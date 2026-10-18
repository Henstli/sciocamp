import { NextResponse, type NextRequest } from "next/server";
import { isSupabase } from "./lib/config";
import { SESSION_COOKIE, readSessionToken } from "./lib/session";
import { updateSession } from "./lib/supabase/proxy";

// Stránky, které jsou dostupné i bez přihlášení.
const PUBLIC_PATHS = ["/prihlaseni", "/auth/callback", "/auth/confirm", "/auth/prijeti"];

// Optimistická kontrola přihlášení. Skutečná kontrola rolí probíhá na serveru
// ve stránkách (src/lib/auth.ts), proxy jen šetří zbytečné vykreslení.
// Přihlášené z /prihlaseni přesměrovává až stránka sama, protože jen ona ví,
// jestli účet ještě existuje (jinak by vznikla smyčka přesměrování).
export async function proxy(request: NextRequest) {
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);

  if (isSupabase) {
    const { response, signedIn } = await updateSession(request);
    if (!signedIn && !isPublic) return redirectWithCookies(request, response);
    return response;
  }

  const uid = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!uid && !isPublic) {
    return NextResponse.redirect(new URL("/prihlaseni", request.url));
  }
  return NextResponse.next();
}

/** Přesměrování na přihlášení, které zachová cookies nastavené při obnově session. */
function redirectWithCookies(request: NextRequest, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL("/prihlaseni", request.url));
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
