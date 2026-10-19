"use server";

// Termíny ateliérů a expedic: zakládá je admin, učitelé z nich vybírají.

import { refresh } from "next/cache";
import { requireAdmin } from "../auth";
import { isSupabase } from "../config";
import { createClient } from "../supabase/server";

export type TermState = { error?: string; info?: string; fieldErrors?: Record<string, string> };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function saveTerm(_prev: TermState, formData: FormData): Promise<TermState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "") || null;
  const kind = formData.get("kind") === "expedice" ? "expedice" : "atelier";
  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || null;
  const startsOn = String(formData.get("startsOn") ?? "");
  let endsOn = String(formData.get("endsOn") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (!ISO.test(startsOn)) fieldErrors.startsOn = "Napiš datum jako 16. 11. 2026.";
  // Expedice: stačí vybrat pondělí, pátek se doplní sám.
  if (!endsOn && kind === "expedice" && ISO.test(startsOn)) {
    const d = new Date(`${startsOn}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 4);
    endsOn = d.toISOString().slice(0, 10);
  }
  if (!ISO.test(endsOn)) fieldErrors.endsOn = "Napiš datum jako 20. 11. 2026.";
  if (!fieldErrors.startsOn && !fieldErrors.endsOn && endsOn < startsOn) fieldErrors.endsOn = "Konec musí být po začátku.";
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };
  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };

  const sb = await createClient();
  const values = { kind, name, starts_on: startsOn, ends_on: endsOn };
  const { error } = id
    ? await sb.from("activity_terms").update(values).eq("id", id)
    : await sb.from("activity_terms").insert(values);
  if (error) {
    if (error.code === "23P01") return { error: "Posunutím by se u některého studenta překryly dva ateliéry nebo expedice." };
    return { error: "Termín se nepodařilo uložit." };
  }
  refresh();
  return { info: id ? "Termín je upravený. Ateliéry a expedice v něm se posunuly taky." : "Termín je přidaný." };
}

export async function deleteTerm(id: string): Promise<TermState> {
  await requireAdmin();
  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };
  const sb = await createClient();
  const { error } = await sb.from("activity_terms").delete().eq("id", id);
  if (error) return { error: "Termín se nepodařilo smazat." };
  refresh();
  return { info: "Termín je smazaný. Ateliéry a expedice v něm si data ponechaly." };
}
