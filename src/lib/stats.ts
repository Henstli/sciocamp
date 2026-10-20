// Statistiky studentů (Výuka → Statistiky). Čisté výpočty nad surovými daty
// (úkoly, práce, zápisy) — stejné pro Supabase i ukázkový režim.

import type { ActivityKind, ReviewResult } from "./types";
import { addDays, mondayOf, pragueLocalToIso, pragueNow, toIso } from "./time";

export type StatStudent = { id: string; name: string; grade: number | null };
export type StatActivity = {
  /** Slug */
  id: string;
  title: string;
  kind: ActivityKind;
  teacherIds: string[];
  studentIds: string[];
};
export type StatAssignment = {
  id: string;
  /** Slug třídy */
  activityId: string;
  title: string;
  dueAt: string | null;
  maxPoints: number | null;
  createdAt: string;
  /** Jen pro ukázkový režim: vymyšlená historie bez stránky úkolu */
  synthetic?: boolean;
};
export type StatWork = {
  assignmentId: string;
  studentId: string;
  status: "rozpracovano" | "odevzdano" | null;
  submittedAt: string | null;
  result: ReviewResult | null;
  points: number | null;
  reviewedAt: string | null;
  /** Práce byla aspoň jednou vrácená k doplnění */
  returned: boolean;
};
export type StatsInput = {
  now: number;
  students: StatStudent[];
  activities: StatActivity[];
  assignments: StatAssignment[];
  work: StatWork[];
};

/** Stav jedné práce (úkol × student) */
export type PairState = "ceka" | "chybi" | "odevzdano" | "vraceno" | "splneno" | "nesplneno";

export type Pair = {
  assignment: StatAssignment;
  studentId: string;
  state: PairState;
  /** Odevzdáno (i ohodnoceno) */
  handed: boolean;
  /** Termín už prošel nebo je odevzdáno — počítá se do úspěšnosti */
  due: boolean;
  /** Odevzdáno včas / pozdě (null = bez termínu nebo neodevzdáno) */
  onTime: boolean | null;
  /** Body v procentech maxima (null = bez bodů nebo ještě neohodnoceno) */
  pct: number | null;
  returned: boolean;
  submittedAt: string | null;
  points: number | null;
};

export type Summary = {
  /** Všechny zadané práce v období */
  assigned: number;
  /** Práce, u kterých už prošel termín nebo jsou odevzdané */
  due: number;
  handed: number;
  onTime: number;
  late: number;
  /** Po termínu a neodevzdané */
  missing: number;
  /** Vrácené k doplnění a zatím nedoplněné */
  returnedOpen: number;
  /** Odevzdané, čekají na hodnocení */
  waiting: number;
  passed: number;
  failed: number;
  /** Průměr bodů v % (null = žádné body) */
  pointsPct: number | null;
  /** Podíly 0–1, null = není z čeho počítat */
  handedRate: number | null;
  onTimeRate: number | null;
  passRate: number | null;
};

export type RangeKey = "mesic" | "pololeti" | "rok";
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "mesic", label: "Posledních 30 dní" },
  { key: "pololeti", label: "Toto pololetí" },
  { key: "rok", label: "Celý školní rok" },
];

/** Začátek školního roku (1. 9.) */
export function schoolYearStart(now: number): string {
  const p = pragueNow(new Date(now));
  const y = p.m >= 7 ? p.y : p.y - 1;
  return pragueLocalToIso(`${y}-09-01T00:00`)!;
}

/** Začátek období v ISO (UTC) */
export function rangeStart(range: RangeKey, now: number): string {
  const p = pragueNow(new Date(now));
  if (range === "mesic") return pragueLocalToIso(`${toIso(addDays(p, -30))}T00:00`)!;
  if (range === "pololeti") {
    // 1. pololetí září–leden, 2. pololetí únor–červen
    if (p.m >= 2 && p.m <= 6) return pragueLocalToIso(`${p.y}-02-01T00:00`)!;
    return schoolYearStart(now);
  }
  return schoolYearStart(now);
}

function pairOf(a: StatAssignment, studentId: string, w: StatWork | undefined, now: number): Pair {
  const dueMs = a.dueAt ? new Date(a.dueAt).getTime() : null;
  let state: PairState;
  if (w?.result && w.result !== "vraceno") state = w.result;
  else if (w?.result === "vraceno") {
    const resubmitted =
      w.status === "odevzdano" && w.submittedAt && w.reviewedAt && new Date(w.submittedAt) > new Date(w.reviewedAt);
    state = resubmitted ? "odevzdano" : "vraceno";
  } else if (w?.status === "odevzdano") state = "odevzdano";
  else if (dueMs !== null && dueMs < now) state = "chybi";
  else state = "ceka";
  const handed = state === "odevzdano" || state === "splneno" || state === "nesplneno";
  const due = handed || state === "vraceno" || (dueMs !== null && dueMs < now);
  const onTime =
    handed && dueMs !== null && w?.submittedAt ? new Date(w.submittedAt).getTime() <= dueMs : null;
  const pct =
    a.maxPoints && w?.points !== null && w?.points !== undefined && (state === "splneno" || state === "nesplneno")
      ? Math.min(1, w.points / a.maxPoints)
      : null;
  return {
    assignment: a,
    studentId,
    state,
    handed,
    due,
    onTime,
    pct,
    returned: w?.returned ?? false,
    submittedAt: w?.submittedAt ?? null,
    points: w?.points ?? null,
  };
}

/** Všechny práce v období: každý úkol × každý student zapsaný v jeho třídě. */
export function buildPairs(input: StatsInput, from: string): Pair[] {
  const fromMs = new Date(from).getTime();
  const acts = new Map(input.activities.map((a) => [a.id, a]));
  const known = new Set(input.students.map((s) => s.id));
  const work = new Map(input.work.map((w) => [`${w.assignmentId}:${w.studentId}`, w]));
  const out: Pair[] = [];
  for (const a of input.assignments) {
    if (new Date(a.dueAt ?? a.createdAt).getTime() < fromMs) continue;
    const act = acts.get(a.activityId);
    if (!act) continue;
    for (const sid of act.studentIds) {
      if (!known.has(sid)) continue;
      out.push(pairOf(a, sid, work.get(`${a.id}:${sid}`), input.now));
    }
  }
  return out;
}

const rate = (n: number, d: number) => (d > 0 ? n / d : null);

export function summarize(pairs: Pair[]): Summary {
  let due = 0, handed = 0, onTime = 0, late = 0, missing = 0, returnedOpen = 0, waiting = 0, passed = 0, failed = 0;
  let pctSum = 0, pctN = 0, timed = 0;
  for (const p of pairs) {
    if (p.due) due++;
    if (p.handed) handed++;
    if (p.onTime === true) onTime++;
    if (p.onTime === false) late++;
    if (p.onTime !== null) timed++;
    if (p.state === "chybi") missing++;
    if (p.state === "vraceno") returnedOpen++;
    if (p.state === "odevzdano") waiting++;
    if (p.state === "splneno") passed++;
    if (p.state === "nesplneno") failed++;
    if (p.pct !== null) {
      pctSum += p.pct;
      pctN++;
    }
  }
  return {
    assigned: pairs.length,
    due,
    handed,
    onTime,
    late,
    missing,
    returnedOpen,
    waiting,
    passed,
    failed,
    pointsPct: pctN ? pctSum / pctN : null,
    handedRate: rate(handed, due),
    onTimeRate: rate(onTime, timed),
    passRate: rate(passed, passed + failed),
  };
}

export type Week = { monday: string; label: string; onTime: number; late: number; missing: number };

/** Týdenní průběh podle termínu: odevzdáno včas / pozdě / chybí (posledních `count` týdnů). */
export function weekly(pairs: Pair[], now: number, count = 10, from?: string): Week[] {
  const thisMonday = mondayOf(pragueNow(new Date(now)));
  const firstAllowed = from ? mondayOf(pragueNow(new Date(from))) : null;
  const weeks: Week[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addDays(thisMonday, -7 * i);
    if (firstAllowed && toIso(m) < toIso(firstAllowed)) continue;
    weeks.push({ monday: toIso(m), label: `${m.d}. ${m.m}.`, onTime: 0, late: 0, missing: 0 });
  }
  const byMonday = new Map(weeks.map((w) => [w.monday, w]));
  for (const p of pairs) {
    if (!p.assignment.dueAt || !p.due) continue;
    const w = byMonday.get(toIso(mondayOf(pragueNow(new Date(p.assignment.dueAt)))));
    if (!w) continue;
    if (p.onTime === true) w.onTime++;
    else if (p.onTime === false) w.late++;
    else if (p.state === "chybi" || p.state === "vraceno") w.missing++;
  }
  // Prázdné týdny na začátku (před prvním termínem) nemá smysl ukazovat.
  const first = weeks.findIndex((w) => w.onTime + w.late + w.missing > 0);
  return first > 0 ? weeks.slice(first) : weeks;
}

export type Attention = {
  student: StatStudent;
  summary: Summary;
  reasons: { label: string; tone: "late" | "wait" }[];
  score: number;
};

/** Studenti, kterým se nedaří: chybějící, nesplněné, vrácené nebo často pozdě odevzdané práce. */
export function needsAttention(students: StatStudent[], pairs: Pair[]): Attention[] {
  const by = groupBy(pairs, (p) => p.studentId);
  const out: Attention[] = [];
  for (const s of students) {
    const sm = summarize(by.get(s.id) ?? []);
    const reasons: Attention["reasons"] = [];
    if (sm.missing > 0) reasons.push({ label: `${sm.missing} ${plural(sm.missing, "práce chybí", "práce chybí", "prací chybí")}`, tone: "late" });
    if (sm.failed > 0) reasons.push({ label: `${sm.failed}× nesplněno`, tone: "late" });
    if (sm.returnedOpen > 0) reasons.push({ label: `${sm.returnedOpen}× vráceno k doplnění`, tone: "wait" });
    if (sm.late >= 2) reasons.push({ label: `${sm.late}× pozdě`, tone: "wait" });
    const score = sm.missing * 3 + sm.failed * 3 + sm.returnedOpen * 2 + sm.late;
    // Podle podílu, ne jen počtu — za pololetí se pár zaváhání nasbírá každému.
    const weak =
      (sm.handedRate !== null && sm.due >= 3 && sm.handedRate < 0.8) ||
      sm.missing >= 3 ||
      sm.failed >= 2 ||
      sm.returnedOpen >= 3 ||
      (sm.onTimeRate !== null && sm.handed >= 4 && sm.onTimeRate < 0.6);
    if (weak && reasons.length) out.push({ student: s, summary: sm, reasons, score });
  }
  return out.sort((a, b) => b.score - a.score || a.student.name.localeCompare(b.student.name, "cs"));
}

/** Studenti, kterým se daří: vše odevzdané, téměř vše včas, aspoň 3 práce. */
export function doingWell(students: StatStudent[], pairs: Pair[], limit = 5): { student: StatStudent; summary: Summary }[] {
  const by = groupBy(pairs, (p) => p.studentId);
  return students
    .map((s) => ({ student: s, summary: summarize(by.get(s.id) ?? []) }))
    .filter(({ summary: m }) => m.due >= 3 && m.handedRate === 1 && (m.onTimeRate ?? 0) >= 0.9 && m.failed === 0)
    .sort((a, b) => (b.summary.pointsPct ?? 0) - (a.summary.pointsPct ?? 0) || b.summary.handed - a.summary.handed)
    .slice(0, limit);
}

export function groupBy<T, K>(list: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of list) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

/** „87 %“, null → „–“ */
export function pct(v: number | null): string {
  return v === null ? "–" : `${Math.round(v * 100)} %`;
}

export const STATE_TEXT: Record<PairState, string> = {
  ceka: "Čeká na odevzdání",
  chybi: "Chybí",
  odevzdano: "Čeká na hodnocení",
  vraceno: "Vráceno k doplnění",
  splneno: "Splněno",
  nesplneno: "Nesplněno",
};
export const STATE_TONE: Record<PairState, string> = {
  ceka: "chip-info",
  chybi: "chip-late",
  odevzdano: "chip-wait",
  vraceno: "chip-wait",
  splneno: "chip-ok",
  nesplneno: "chip-late",
};
