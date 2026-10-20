import { NextResponse } from "next/server";
import { isSupabase } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Profilová fotka člověka: přesměruje na dočasný podepsaný odkaz do bucketu
 * `avatary`. Fotky vidí jen přihlášení členové školy (RLS i pravidla úložiště).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isSupabase || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const sb = await createClient();
  const { data: profile } = await sb.from("profiles").select("avatar_path").eq("id", id).maybeSingle();
  const path = profile?.avatar_path as string | null | undefined;
  if (!path) return new NextResponse(null, { status: 404 });
  const { data } = await sb.storage.from("avatary").createSignedUrl(path, 3600);
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(data.signedUrl, 302);
  // Adresa obsahuje verzi (?v=cesta), takže ji prohlížeč může chvíli držet.
  res.headers.set("Cache-Control", "private, max-age=3000");
  return res;
}
