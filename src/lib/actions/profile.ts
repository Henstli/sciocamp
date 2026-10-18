"use server";

import { refresh } from "next/cache";
import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { createClient } from "../supabase/server";

export type ProfileState = { error?: string; info?: string; fieldErrors?: Record<string, string> };

/** „777123456“ → „+420 777 123 456“, „+421 905 123 456“ zůstane. Null = neplatné. */
function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[\s\-().\/]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!/^\+?\d{9,15}$/.test(digits)) return null;
  if (!digits.startsWith("+")) digits = digits.length === 9 ? `+420${digits}` : `+${digits}`;
  const cc = digits.length > 13 ? digits.slice(0, digits.length - 9) : digits.slice(0, 4);
  const rest = digits.slice(cc.length);
  return `${cc} ${rest.replace(/(\d{3})(?=\d)/g, "$1 ")}`.trim();
}

/** Uloží „O mně“ a telefon přihlášeného uživatele. */
export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 600) || null;
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) {
    return { error: "Zkontroluj zvýrazněná pole.", fieldErrors: { phone: "Napiš telefon jako 777 123 456 nebo +420 777 123 456." } };
  }
  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };

  const sb = await createClient();
  const { error } = await sb.from("profiles").update({ bio }).eq("id", user.id);
  if (error) return { error: "Profil se nepodařilo uložit." };
  const res = phone
    ? await sb.from("profile_contacts").upsert({ user_id: user.id, phone, updated_at: new Date().toISOString() })
    : await sb.from("profile_contacts").delete().eq("user_id", user.id);
  if (res.error) return { error: "Telefon se nepodařilo uložit." };
  refresh();
  return { info: "Uloženo." };
}
