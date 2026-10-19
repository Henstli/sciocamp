"use server";

// Zápis studenta. Kapacitu, čekačku, kolize, ročníky a termín hlídá databáze
// (funkce enroll_self, leave_self, join_waitlist, leave_waitlist).

import { refresh } from "next/cache";
import { requireUser } from "../auth";
import { isSupabase } from "../config";
import { getActivity } from "../data";
import { createClient } from "../supabase/server";

export type EnrollResult = { error?: string; info?: string };

const DEMO = "Ukázkový režim: zápis se neukládá.";
const RPC = { enroll: "enroll_self", leave: "leave_self", wait: "join_waitlist", unwait: "leave_waitlist" } as const;
const FAIL = {
  enroll: "Zapsat se nepodařilo.",
  leave: "Odhlásit se nepodařilo.",
  wait: "Na čekací řadu se nepodařilo přidat.",
  unwait: "Z čekací řady se nepodařilo odejít.",
} as const;

/** Chyby z databáze jsou česky a srozumitelně — ukážeme je, ostatní nahradíme obecnou. */
function explain(message: string | undefined, fallback: string) {
  if (message && /plno|neprobíhá|ročník|Kříží se|skončil|jen studenti|zapsaný|volné/.test(message)) return message;
  return fallback;
}

export async function enrollAction(slug: string, action: keyof typeof RPC): Promise<EnrollResult> {
  const user = await requireUser();
  if (user.role !== "student") return { error: "Zapisovat se můžou jen studenti." };
  const activity = await getActivity(slug);
  if (!activity) return { error: "Nabídka už neexistuje." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc(RPC[action], { activity: activity.dbId });
  if (error) return { error: explain(error.message, FAIL[action]) };
  refresh();
  return {};
}
