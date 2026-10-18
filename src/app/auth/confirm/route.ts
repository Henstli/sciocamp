import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { finishSignIn } from "@/lib/auth-finish";
import { createClient } from "@/lib/supabase/server";

// Odkazy z e-mailů (pozvánka, obnova hesla). Šablony e-mailů v Supabase musí
// odkazovat sem: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/prihlaseni?chyba=odkaz", request.url));
  }
  const sb = await createClient();
  const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(new URL("/prihlaseni?chyba=odkaz", request.url));
  const next = type === "invite" || type === "recovery" ? "/nastavit-heslo" : url.searchParams.get("next");
  return finishSignIn(request, next ?? "/");
}
