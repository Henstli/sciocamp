"use server";

// Wrap: načtení dat k přehrání, „viděno“, a admin nástroje (datum spuštění,
// zkouška spuštění jen na sobě).

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { requireAdmin, requireUser } from "../auth";
import { isSupabase } from "../config";
import { DEMO_WRAP_COOKIE, readDemoWrap, wrapState, type DemoWrapCookie } from "../data-wrap";
import { demoStaffWrap, demoStudentWrap } from "../demo-wrap";
import { isAdmin } from "../roles";
import { createClient } from "../supabase/server";
import { pragueLocalToIso, pragueNow, toIso } from "../time";
import { parseWrap, seasonOf, type WrapData, type WrapMode } from "../wrap";

const czech = (msg: string, fallback: string) => (/[áčéěíňóřšťúůýž]/i.test(msg) ? msg : fallback);

async function writeDemo(c: DemoWrapCookie) {
  (await cookies()).set(DEMO_WRAP_COOKIE, JSON.stringify(c), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 60 });
}

/** Data wrapu k přehrání. Ukázky (student/staff) jen pro admina. */
export async function loadWrap(mode: WrapMode): Promise<{ data?: WrapData; error?: string }> {
  const user = await requireUser();
  const season = seasonOf(toIso(pragueNow()));
  if (mode !== "mine") {
    if (!isAdmin(user.role)) return { error: "Ukázky wrapu jsou jen pro admina." };
    return { data: mode === "student" ? demoStudentWrap(undefined, undefined, season) : demoStaffWrap(undefined, undefined, season) };
  }
  if (!isSupabase) {
    const state = await wrapState(user);
    if (!isAdmin(user.role) && !state?.active) return { error: "Wrap ještě není spuštěný." };
    return { data: user.role === "student" ? demoStudentWrap(user.name, user.id, season) : demoStaffWrap(user.name, user.id, season) };
  }
  const sb = await createClient();
  const { data, error } = await sb.rpc("wrap_data");
  if (error || !data) return { error: czech(error?.message ?? "", "Wrap se nepodařilo načíst.") };
  return { data: parseWrap(data as Record<string, unknown>, user.id) };
}

/** Wrap jsem viděl(a): sám se už neotevře, zůstane v profilu. */
export async function markWrapSeen(): Promise<void> {
  await requireUser();
  if (!isSupabase) {
    const c = await readDemoWrap();
    await writeDemo({ ...c, seen: seasonOf(toIso(pragueNow())) });
    return;
  }
  const sb = await createClient();
  await sb.rpc("mark_wrap_seen");
}

/** Admin: datum a čas spuštění („rrrr-mm-ddThh:mm“, pražský čas). */
export async function setWrapLaunch(local: string): Promise<{ error?: string; info?: string }> {
  await requireAdmin();
  const iso = pragueLocalToIso(local);
  if (!iso) return { error: "Vyplň datum i čas spuštění." };
  if (seasonOf(toIso(pragueNow(new Date(iso)))) !== seasonOf(toIso(pragueNow()))) {
    return { error: "Datum musí patřit do letošního školního roku (1. 9. – 31. 8.)." };
  }
  if (!isSupabase) {
    await writeDemo({ ...(await readDemoWrap()), launch: iso });
    refresh();
    return { info: "Uloženo (ukázkový režim: jen v tomto prohlížeči)." };
  }
  const sb = await createClient();
  const { error } = await sb.rpc("set_wrap_launch", { launch: iso });
  if (error) return { error: czech(error.message, "Datum se nepodařilo uložit.") };
  refresh();
  return { info: "Datum spuštění je uložené." };
}

/** Admin: spuštění jen na mně (zkouška), nebo její zrušení. */
export async function setWrapTrial(on: boolean): Promise<{ error?: string }> {
  await requireAdmin();
  if (!isSupabase) {
    const c = await readDemoWrap();
    await writeDemo({ ...c, trial: on ? new Date().toISOString() : undefined, seen: undefined });
    refresh();
    return {};
  }
  const sb = await createClient();
  const { error } = await sb.rpc(on ? "start_wrap_trial" : "stop_wrap_trial");
  if (error) return { error: czech(error.message, "Zkoušku se nepodařilo změnit.") };
  refresh();
  return {};
}
