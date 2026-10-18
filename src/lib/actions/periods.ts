"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "../auth";
import { isSupabase } from "../config";
import { createClient } from "../supabase/server";

export type PeriodState = { error?: string; info?: string; fieldErrors?: Record<string, string> };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Admin založí nebo upraví kurzové období. */
export async function savePeriod(_prev: PeriodState, formData: FormData): Promise<PeriodState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("startsOn") ?? "");
  const endsOn = String(formData.get("endsOn") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Vyplň název, např. Kurzové období 1.";
  if (!ISO.test(startsOn)) fieldErrors.startsOn = "Napiš datum jako 1. 9. 2026.";
  if (!ISO.test(endsOn)) fieldErrors.endsOn = "Napiš datum jako 30. 10. 2026.";
  if (!fieldErrors.startsOn && !fieldErrors.endsOn && endsOn < startsOn) fieldErrors.endsOn = "Konec musí být po začátku.";
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };
  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };

  const sb = await createClient();
  const values = { name: name.slice(0, 80), starts_on: startsOn, ends_on: endsOn };
  const { error } = id ? await sb.from("blocks").update(values).eq("id", id) : await sb.from("blocks").insert(values);
  if (error) return { error: `Období se nepodařilo uložit: ${error.message}` };
  refresh();
  return { info: id ? "Období je upravené." : "Období je založené." };
}

export async function deletePeriod(id: string): Promise<PeriodState> {
  await requireAdmin();
  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };
  const sb = await createClient();
  const { error } = await sb.from("blocks").delete().eq("id", id);
  if (error) return { error: "Období se nepodařilo smazat." };
  refresh();
  return { info: "Období je smazané. Kurzy z něj zůstaly, jen bez období." };
}
