"use server";

// Zápisová kola ateliérů a expedic: učitelé vyhlašují připravené nabídky hromadně.
// Pravidla (jen jedno běžící kolo na druh, cizí nabídka jen připravená, stažení
// jen před otevřením) hlídá databáze.

import { refresh } from "next/cache";
import { requireTeacher } from "../auth";
import { isSupabase } from "../config";
import { getActivity, listActivities, teachesActivity } from "../data";
import { createClient } from "../supabase/server";
import { parseWindowFields } from "../window-fields";

export type RoundState = { error?: string; info?: string; fieldErrors?: Record<string, string> };

const DEMO = "Ukázkový režim: změny se neukládají.";

function explain(message: string | undefined, fallback: string) {
  if (message && /vyhlášený|nejde|připravenou|skončil|běží|jiný druh|už je v zápisu|vyhlásil|Zápis musí/.test(message)) return message;
  return fallback;
}

/** Vyhlásí zápis s vybranými připravenými ateliéry (expedicemi) a jedním termínem. */
export async function announceRound(_prev: RoundState, formData: FormData): Promise<RoundState> {
  await requireTeacher();
  const kind = formData.get("kind") === "expedice" ? "expedice" : "atelier";
  const slugs = formData.getAll("items").map(String);
  const fieldErrors: Record<string, string> = {};
  const w = parseWindowFields(String(formData.get("enrollOpens") ?? ""), String(formData.get("enrollCloses") ?? ""), fieldErrors);
  if (!w.opens && !fieldErrors.enrollOpens) fieldErrors.enrollOpens = "Vyplň, kdy se zápis otevře.";
  if (!w.closes && !fieldErrors.enrollCloses) fieldErrors.enrollCloses = "Vyplň, kdy zápis skončí.";
  if (slugs.length === 0) fieldErrors.items = "Vyber aspoň jednu nabídku.";
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };
  if (!isSupabase) return { info: DEMO };

  const all = await listActivities();
  const ids = slugs.map((s) => all.find((a) => a.id === s)?.dbId).filter((id): id is string => !!id);
  const sb = await createClient();
  const { error } = await sb.rpc("announce_round", { round_kind: kind, opens: w.opens, closes: w.closes, items: ids });
  if (error) return { error: explain(error.message, "Zápis se nepodařilo vyhlásit.") };
  refresh();
  return { info: "Zápis je vyhlášený. Studentům přišlo oznámení." };
}

/** Přidá ateliér / expedici do už vyhlášeného zápisu. */
export async function joinRound(roundId: string, slug: string): Promise<RoundState> {
  await requireTeacher();
  const a = await getActivity(slug);
  if (!a) return { error: "Nabídka neexistuje." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("join_round", { round: roundId, activity: a.dbId });
  if (error) return { error: explain(error.message, "Nabídku se nepodařilo přidat.") };
  refresh();
  return {};
}

/** Stáhne nabídku ze zápisu, dokud se neotevřel. */
export async function leaveRound(slug: string): Promise<RoundState> {
  const user = await requireTeacher();
  const a = await getActivity(slug);
  if (!a || !teachesActivity(user, a)) return { error: "Tuhle nabídku stáhnout nemůžeš." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("leave_round", { activity: a.dbId });
  if (error) return { error: explain(error.message, "Nabídku se nepodařilo stáhnout.") };
  refresh();
  return {};
}

/** Změní termín vyhlášeného zápisu (kdo ho vyhlásil, nebo admin). */
export async function updateRound(_prev: RoundState, formData: FormData): Promise<RoundState> {
  await requireTeacher();
  const roundId = String(formData.get("roundId") ?? "");
  const fieldErrors: Record<string, string> = {};
  const w = parseWindowFields(String(formData.get("enrollOpens") ?? ""), String(formData.get("enrollCloses") ?? ""), fieldErrors);
  if (!w.opens || !w.closes) fieldErrors.enrollCloses ??= "Vyplň začátek i konec zápisu.";
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("update_round", { round: roundId, opens: w.opens, closes: w.closes });
  if (error) return { error: explain(error.message, "Termín se nepodařilo změnit.") };
  refresh();
  return { info: "Termín je změněný." };
}

/** Učitel označí (nebo zruší) „Připraveno k vyhlášení“. */
export async function setAnnounceReady(slug: string, ready: boolean): Promise<RoundState> {
  const user = await requireTeacher();
  const a = await getActivity(slug);
  if (!a || !teachesActivity(user, a)) return { error: "Tuhle nabídku upravovat nemůžeš." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("activities").update({ announce_ready: ready }).eq("id", a.dbId!);
  if (error) return { error: "Nepodařilo se uložit." };
  refresh();
  return {};
}
