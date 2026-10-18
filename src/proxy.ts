import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "./lib/session";

// Optimistická kontrola přihlášení. Skutečná kontrola rolí probíhá na serveru
// ve stránkách (src/lib/auth.ts), proxy jen šetří zbytečné vykreslení.
export async function proxy(request: NextRequest) {
  const uid = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = request.nextUrl.pathname === "/prihlaseni";

  // Přihlášené z /prihlaseni přesměrovává až stránka sama, protože jen ona ví,
  // jestli účet ještě existuje (jinak by vznikla smyčka přesměrování).
  if (!uid && !isLogin) {
    return NextResponse.redirect(new URL("/prihlaseni", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
