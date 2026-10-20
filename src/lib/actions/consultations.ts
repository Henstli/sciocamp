"use server";

// Konzultace: zápis, zrušení, pozvání, Meet a nedostupnost učitele.
// Pravidla (pátek, 8:30–12:00, 2 týdny, kolize) hlídá databáze.

import { refresh } from "next/cache";
import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { SLOTS, toRanges } from "../consultations";
import { canTeach } from "../roles";
import { createClient } from "../supabase/server";

export type ConsultResult = { error?: string; info?: string; ok?: boolean };

const DEMO = "Ukázkový režim: změny se neukládají.";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MEET = /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/;

/** Chyby z databáze jsou česky — ukážeme je, technické nahradíme obecnou. */
function explain(message: string | undefined, fallback: string) {
  if (message && /[ěščřžýáíéůú]/i.test(message) && !/violates|permission|relation|column|function/i.test(message)) return message;
  return fallback;
}

/** Student se zapíše u učitele na vybrané bloky (sousední se spojí). */
export async function bookConsultation(teacherId: string, day: string, slots: string[]): Promise<ConsultResult> {
  const user = await requireUser();
  if (user.role !== "student") return { error: "Na konzultace se zapisují studenti." };
  if (!DAY.test(day) || slots.length === 0 || slots.some((s) => !SLOTS.includes(s))) return { error: "Vyber časy." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  for (const [start, end] of toRanges(slots)) {
    const { error } = await sb.rpc("book_consultation", { teacher: teacherId, d: day, s: start, e: end });
    if (error) {
      refresh();
      return { error: explain(error.message, "Zapsat se nepodařilo.") };
    }
  }
  refresh();
  return { ok: true };
}

export async function cancelConsultation(id: string): Promise<ConsultResult> {
  await requireUser();
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("cancel_consultation", { consultation: id });
  if (error) return { error: explain(error.message, "Konzultaci se nepodařilo zrušit.") };
  refresh();
  return { ok: true };
}

export async function inviteToConsultation(id: string, personId: string): Promise<ConsultResult> {
  await requireUser();
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("invite_to_consultation", { consultation: id, person: personId });
  if (error) return { error: explain(error.message, "Pozvat se nepodařilo.") };
  refresh();
  return { ok: true };
}

/** Odebere pozvaného; personId „me“ = odejít sám. */
export async function removeConsultationGuest(id: string, personId: string): Promise<ConsultResult> {
  const user = await requireUser();
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("remove_consultation_guest", { consultation: id, person: personId === "me" ? user.id : personId });
  if (error) return { error: explain(error.message, "Nepodařilo se to.") };
  refresh();
  return { ok: true };
}

export async function setConsultationMeet(id: string, url: string): Promise<ConsultResult> {
  await requireUser();
  const clean = url.trim();
  if (clean && !MEET.test(clean)) return { error: "Vlož odkaz ve tvaru https://meet.google.com/abc-defg-hij." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("set_consultation_meet", { consultation: id, url: clean });
  if (error) return { error: explain(error.message, "Odkaz se nepodařilo uložit.") };
  refresh();
  return { ok: true };
}

/** Učitel: blok, který pravidelně každý pátek nemůže (on = nemůže). */
export async function setConsultationRule(slot: string, unavailable: boolean): Promise<ConsultResult> {
  const user = await requireUser();
  if (!canTeach(user.role)) return { error: "Jen pro vyučující." };
  if (!SLOTS.includes(slot)) return { error: "Neplatný čas." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = unavailable
    ? await sb.from("consultation_rules").upsert({ teacher_id: user.id, slot }, { ignoreDuplicates: true })
    : await sb.from("consultation_rules").delete().eq("teacher_id", user.id).eq("slot", slot);
  if (error) return { error: "Nepodařilo se to uložit." };
  refresh();
  return { ok: true };
}

/** Učitel: jednorázově zruší blok (slot) nebo celý pátek (slot = null); unavailable=false vrací. */
export async function setConsultationBlock(day: string, slot: string | null, unavailable: boolean): Promise<ConsultResult> {
  const user = await requireUser();
  if (!canTeach(user.role)) return { error: "Jen pro vyučující." };
  if (!DAY.test(day) || (slot !== null && !SLOTS.includes(slot))) return { error: "Neplatný čas." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  let q = sb.from("consultation_blocks").delete().eq("teacher_id", user.id).eq("day", day);
  q = slot === null ? q.is("slot", null) : q.eq("slot", slot);
  const del = await q;
  if (del.error) return { error: "Nepodařilo se to uložit." };
  if (unavailable) {
    const { error } = await sb.from("consultation_blocks").insert({ teacher_id: user.id, day, slot });
    if (error) return { error: "Nepodařilo se to uložit." };
  }
  refresh();
  return { ok: true };
}
