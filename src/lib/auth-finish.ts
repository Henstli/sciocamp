import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isSchoolEmail } from "./config";
import { createClient } from "./supabase/server";

/**
 * Po přihlášení přes Google nebo odkaz z e-mailu ověří, že jde o školní
 * účet, který admin založil a nezablokoval. Jinak uživatele odhlásí.
 */
export async function finishSignIn(request: NextRequest, next: string) {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims;
  const fail = async (reason: string) => {
    await sb.auth.signOut();
    return NextResponse.redirect(new URL(`/prihlaseni?chyba=${reason}`, request.url));
  };
  if (!claims?.sub) return fail("odkaz");
  if (!isSchoolEmail(claims.email as string | undefined)) return fail("domena");
  const { data: profile } = await sb.from("profiles").select("blocked").eq("id", claims.sub).maybeSingle();
  if (!profile) return fail("ucet");
  if (profile.blocked) return fail("blokovano");
  return NextResponse.redirect(new URL(safeNext(next), request.url));
}

/** Povolí jen návrat na stránku v aplikaci (ne na cizí web). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
