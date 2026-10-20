// Wrap na serveru: stav (spuštěný, zkouška, viděný) a nastavení spuštění.
// Ukázkový režim drží stav v cookie, aby šlo vyzkoušet celé spuštění.

import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { isAdmin } from "./roles";
import { isSupabase } from "./config";
import { createClient } from "./supabase/server";
import { pragueLocalToIso, pragueNow, toIso } from "./time";
import { WRAP_DAYS, defaultLaunchLocal, seasonOf, type WrapState } from "./wrap";
import type { User } from "./types";

export const DEMO_WRAP_COOKIE = "sciocamp-demo-wrap";
export type DemoWrapCookie = { launch?: string; trial?: string; seen?: number };

export async function readDemoWrap(): Promise<DemoWrapCookie> {
  try {
    const raw = (await cookies()).get(DEMO_WRAP_COOKIE)?.value;
    return raw ? (JSON.parse(raw) as DemoWrapCookie) : {};
  } catch {
    return {};
  }
}

const DAY = 86_400_000;

/** Stav ukázkového wrapu podle cookie (stejná pravidla jako wrap_state v DB). */
function demoState(c: DemoWrapCookie, user: User): WrapState {
  const now = Date.now();
  const season = seasonOf(toIso(pragueNow()));
  const fallback = pragueLocalToIso(defaultLaunchLocal(season))!;
  const launch = c.launch && seasonOf(toIso(pragueNow(new Date(c.launch)))) === season ? c.launch : fallback;
  const trialAt = isAdmin(user.role) && c.trial && now - Date.parse(c.trial) < WRAP_DAYS * DAY ? c.trial : null;
  const active = trialAt ? true : now >= Date.parse(launch) && now < Date.parse(launch) + WRAP_DAYS * DAY;
  const until = new Date(Date.parse(trialAt ?? launch) + WRAP_DAYS * DAY).toISOString();
  return { launchAt: launch, until, active, trial: !!trialAt, seen: c.seen === season, season };
}

async function wrapStateUncached(user: User): Promise<WrapState | null> {
  if (!isSupabase) return demoState(await readDemoWrap(), user);
  const sb = await createClient();
  const { data, error } = await sb.rpc("wrap_state");
  if (error || !data) return null;
  const r = data as { launch_at: string; until: string; active: boolean; trial: boolean; seen: boolean; season: number };
  return { launchAt: r.launch_at, until: r.until, active: r.active, trial: r.trial, seen: r.seen, season: r.season };
}

export const wrapState = cache(wrapStateUncached);
