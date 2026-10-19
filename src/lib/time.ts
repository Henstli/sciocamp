// Práce s časem v pražském pásmu. Server na Vercelu běží v UTC, proto se
// "teď" vždy přepočítává přes Intl na Europe/Prague.

import type { Slot, Weekday } from "./types";

export const TZ = "Europe/Prague";

/** Kalendářní datum bez času (pražské). */
export type PlainDate = { y: number; m: number; d: number };

export type PragueNow = PlainDate & {
  /** 1 = pondělí … 7 = neděle */
  isoWeekday: number;
  minutes: number;
};

export function pragueNow(date = new Date()): PragueNow {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    isoWeekday: wd,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "09:00" → "9:00" */
export function formatTime(hhmm: string): string {
  return hhmm.replace(/^0/, "");
}

export function formatRange(slot: Slot): string {
  return `${formatTime(slot.start)}–${formatTime(slot.end)}`;
}

// Kalendářní aritmetika přes UTC, aby nezáleželo na pásmu serveru.
function toUtc(p: PlainDate): Date {
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}
function fromUtc(d: Date): PlainDate {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function addDays(p: PlainDate, days: number): PlainDate {
  const d = toUtc(p);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function isoWeekdayOf(p: PlainDate): number {
  const wd = toUtc(p).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function sameDate(a: PlainDate, b: PlainDate): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

export function toIso(p: PlainDate): string {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function parseIso(s: string | undefined): PlainDate | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const p = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  return toIso(fromUtc(toUtc(p))) === s ? p : null;
}

/** Pondělí týdne, který se má ukázat. O víkendu je to už příští týden. */
export function defaultWeekStart(now: PragueNow): PlainDate {
  const offset = now.isoWeekday >= 6 ? 8 - now.isoWeekday : 1 - now.isoWeekday;
  return addDays(now, offset);
}

export function mondayOf(p: PlainDate): PlainDate {
  return addDays(p, 1 - isoWeekdayOf(p));
}

const MONTHS_GEN = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const DAYS_LONG = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
export const DAYS_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

/** "Úterý 20. října" */
export function formatLongDate(p: PlainDate): string {
  return `${DAYS_LONG[isoWeekdayOf(p) - 1]} ${p.d}. ${MONTHS_GEN[p.m - 1]}`;
}

/** "19.–23. října" nebo "28. září – 2. října" */
export function formatWeekRange(monday: PlainDate): string {
  const friday = addDays(monday, 4);
  if (monday.m === friday.m) return `${monday.d}.–${friday.d}. ${MONTHS_GEN[friday.m - 1]}`;
  return `${monday.d}. ${MONTHS_GEN[monday.m - 1]} – ${friday.d}. ${MONTHS_GEN[friday.m - 1]}`;
}

/** "Út 9:00–10:00" nebo "Po a Čt 12:00–13:00" */
export function formatSlots(slots: Slot[]): string {
  const byTime = new Map<string, Weekday[]>();
  for (const s of slots) {
    const key = formatRange(s);
    byTime.set(key, [...(byTime.get(key) ?? []), s.day]);
  }
  return [...byTime.entries()]
    .map(([range, days]) => {
      const names = days.sort().map((d) => DAYS_SHORT[d - 1]);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} a ${names.at(-1)}` : names[0];
      return `${list} ${range}`;
    })
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Termíny úkolů (okamžiky v UTC zobrazované v pražském čase)
// ---------------------------------------------------------------------------

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** ISO okamžik → hodnota pro <input type="datetime-local"> v pražském čase. */
export function isoToPragueLocal(iso: string): string {
  const p = pragueNow(new Date(iso));
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(Math.floor(p.minutes / 60))}:${pad(p.minutes % 60)}`;
}

/** „2026-10-21T23:59“ (pražský čas) → ISO okamžik v UTC. Null = neplatné. */
export function pragueLocalToIso(local: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wanted;
  // Dvakrát dorovnat posun pásma (kvůli přechodu na letní čas).
  for (let i = 0; i < 2; i++) {
    const p = pragueNow(new Date(guess));
    const shown = Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.minutes / 60), p.minutes % 60);
    guess += wanted - shown;
  }
  return new Date(guess).toISOString();
}

/** Termín lidsky: „dnes 23:59“, „zítra 8:00“, „čt 22. 10. 23:59“. */
export function formatDue(iso: string, now = new Date()): string {
  const due = pragueNow(new Date(iso));
  const today = pragueNow(now);
  const time = `${Math.floor(due.minutes / 60)}:${pad(due.minutes % 60)}`;
  if (sameDate(due, today)) return `dnes ${time}`;
  if (sameDate(due, addDays(today, 1))) return `zítra ${time}`;
  if (sameDate(due, addDays(today, -1))) return `včera ${time}`;
  const year = due.y !== today.y ? `${due.y} ` : "";
  return `${DAYS_SHORT[due.isoWeekday - 1].toLowerCase()} ${due.d}. ${due.m}. ${year}${time}`;
}

/** Krátké datum: „21. 10.“ */
export function formatShortDate(iso: string): string {
  const p = pragueNow(new Date(iso));
  return `${p.d}. ${p.m}.`;
}

/** Datum a čas události: „21. 10. 14:05“ */
export function formatStamp(iso: string, now = new Date()): string {
  const p = pragueNow(new Date(iso));
  const t = pragueNow(now);
  const time = `${Math.floor(p.minutes / 60)}:${pad(p.minutes % 60)}`;
  if (sameDate(p, t)) return `dnes ${time}`;
  if (sameDate(p, addDays(t, -1))) return `včera ${time}`;
  return `${p.d}. ${p.m}. ${time}`;
}

/** Čas v seznamu konverzací: „14:06“ dnes, „včera“, „po“ v posledním týdnu, jinak „12. 10.“ */
export function formatListTime(iso: string, now = new Date()): string {
  const p = pragueNow(new Date(iso));
  const t = pragueNow(now);
  if (sameDate(p, t)) return `${Math.floor(p.minutes / 60)}:${pad(p.minutes % 60)}`;
  if (sameDate(p, addDays(t, -1))) return "včera";
  const diff = Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(p.y, p.m - 1, p.d)) / 86400000);
  if (diff > 0 && diff < 7) return DAYS_SHORT[isoWeekdayOf(p) - 1].toLowerCase();
  return `${p.d}. ${p.m}.`;
}

/** Jen čas „14:06“ (pražský). */
export function formatClock(iso: string): string {
  const p = pragueNow(new Date(iso));
  return `${Math.floor(p.minutes / 60)}:${pad(p.minutes % 60)}`;
}

/** Oddělovač dne v konverzaci: „Dnes“, „Včera“, „Po 12. 10.“ */
export function formatDayLabel(iso: string, now = new Date()): string {
  const p = pragueNow(new Date(iso));
  const t = pragueNow(now);
  if (sameDate(p, t)) return "Dnes";
  if (sameDate(p, addDays(t, -1))) return "Včera";
  return `${DAYS_SHORT[isoWeekdayOf(p) - 1]} ${p.d}. ${p.m}.${p.y !== t.y ? ` ${p.y}` : ""}`;
}

/** Teď v milisekundách (na serveru při vykreslení stránky). */
export function nowMs(): number {
  return Date.now();
}
