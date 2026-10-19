"use server";

import { refresh } from "next/cache";
import { requireAdmin, requireTeacher } from "../auth";
import { isSupabase } from "../config";
import { createClient } from "../supabase/server";
import { parseWindowFields } from "../window-fields";

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
  const window = parseWindow(formData, fieldErrors);
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };
  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };

  const sb = await createClient();
  const values = {
    name: name.slice(0, 80),
    starts_on: startsOn,
    ends_on: endsOn,
    enroll_opens_at: window.opens,
    enroll_closes_at: window.closes,
  };
  const { error } = id ? await sb.from("blocks").update(values).eq("id", id) : await sb.from("blocks").insert(values);
  if (error) return { error: `Období se nepodařilo uložit: ${error.message}` };
  refresh();
  return { info: id ? "Období je upravené." : "Období je založené." };
}

function parseWindow(formData: FormData, fieldErrors: Record<string, string>) {
  return parseWindowFields(String(formData.get("enrollOpens") ?? ""), String(formData.get("enrollCloses") ?? ""), fieldErrors);
}

/** Admin zveřejní kurzy období v Zápisech (a studentům přijde oznámení). */
export async function publishPeriod(id: string): Promise<PeriodState> {
  await requireAdmin();
  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };
  const sb = await createClient();
  const { error } = await sb.rpc("publish_block", { block: id });
  if (error) return { error: /termín|Nejdřív/.test(error.message) ? error.message : "Období se nepodařilo zveřejnit." };
  refresh();
  return { info: "Kurzy jsou zveřejněné v Zápisech. Studentům přišlo oznámení." };
}

/** Učitel potvrdí (nebo zruší), že má kurzy v období připravené. */
export async function setPeriodReady(id: string, ready: boolean): Promise<PeriodState> {
  const user = await requireTeacher();
  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };
  const sb = await createClient();
  const { error } = ready
    ? await sb.from("block_ready").upsert({ block_id: id, teacher_id: user.id }, { ignoreDuplicates: true })
    : await sb.from("block_ready").delete().eq("block_id", id).eq("teacher_id", user.id);
  if (error) return { error: "Nepodařilo se uložit." };
  refresh();
  return { info: ready ? "Hotovo — admin uvidí, že máš kurzy připravené." : "Potvrzení je zrušené." };
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
