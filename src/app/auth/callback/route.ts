import { NextResponse, type NextRequest } from "next/server";
import { finishSignIn } from "@/lib/auth-finish";
import { createClient } from "@/lib/supabase/server";

// Návrat z Googlu (OAuth) a z odkazu na obnovu hesla: výměna kódu za session.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  if (!code) {
    // Google vrací chybu v parametru error, např. když studentovi přístup zablokovala škola.
    const reason = url.searchParams.get("error") ? "google" : "odkaz";
    return NextResponse.redirect(new URL(`/prihlaseni?chyba=${reason}`, request.url));
  }
  const sb = await createClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    // Typicky: Supabase odmítl vytvořit účet (registrace vypnuté nebo cizí doména).
    return NextResponse.redirect(new URL("/prihlaseni?chyba=ucet", request.url));
  }
  return finishSignIn(request, next ?? "/");
}
