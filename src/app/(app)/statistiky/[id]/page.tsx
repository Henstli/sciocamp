import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { profileHref } from "@/components/PageHeader";
import { CountCell, LinkTabs, RateCell, StatTile, WeeklyChart } from "@/components/stats/StatBits";
import styles from "@/components/stats/stats.module.css";
import { requireTeacher } from "@/lib/auth";
import { isTeacherOf, listActivities } from "@/lib/data";
import { statsInput } from "@/lib/data-stats";
import { finalData } from "@/lib/data-final";
import { COMPLETION_CHIP, COMPLETION_KINDS, COMPLETION_TEXT, completionRows, completionSummary } from "@/lib/completion";
import { formatDateRange, activityRange } from "@/lib/periods";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { initials, isAdmin } from "@/lib/roles";
import {
  RANGES,
  STATE_TEXT,
  STATE_TONE,
  buildPairs,
  groupBy,
  pct,
  plural,
  rangeStart,
  summarize,
  weekly,
  type Pair,
  type RangeKey,
} from "@/lib/stats";
import { formatDue, pragueNow, toIso } from "@/lib/time";

export const metadata: Metadata = { title: "Statistiky studenta" };

const PROBLEM: Record<Pair["state"], number> = { chybi: 0, vraceno: 1, nesplneno: 2, odevzdano: 3, ceka: 4, splneno: 5 };

export default async function StudentStatsPage({ params, searchParams }: PageProps<"/statistiky/[id]">) {
  const user = await requireTeacher();
  const { id } = await params;
  const sp = await searchParams;
  const range: RangeKey = sp.obdobi === "mesic" || sp.obdobi === "rok" ? sp.obdobi : "pololeti";
  const [input, activities, final] = await Promise.all([statsInput(), listActivities(), finalData()]);
  const student = input.students.find((s) => s.id === id);
  if (!student) notFound();

  const from = rangeStart(range, input.now);
  const school = buildPairs(input, from);
  const mine = school.filter((p) => p.studentId === id);
  const me = summarize(mine);
  const all = summarize(school);
  const weeks = weekly(mine, input.now, range === "mesic" ? 5 : 12, from);
  const actMap = new Map(activities.map((a) => [a.id, a]));
  const today = toIso(pragueNow(new Date(input.now)));
  const completion = completionRows(activities, final.reviews, final.closures, toIso(pragueNow(new Date(from))), today, new Set([id]))
    .sort((a, b) => (activityRange(b.activity).to ?? "9").localeCompare(activityRange(a.activity).to ?? "9"));
  const canOpen = (a: (typeof activities)[number]) => isAdmin(user.role) || isTeacherOf(a, user.id);
  const enrolled = activities.filter((a) => a.studentIds.includes(id));

  const perClass = [...groupBy(mine, (p) => p.assignment.activityId)]
    .map(([aid, list]) => ({ activity: actMap.get(aid)!, list, summary: summarize(list) }))
    .filter((c) => c.activity)
    .sort((a, b) => (a.summary.handedRate ?? 1) - (b.summary.handedRate ?? 1));

  const tasks = [...mine].sort(
    (a, b) =>
      PROBLEM[a.state] - PROBLEM[b.state] ||
      (b.assignment.dueAt ?? b.assignment.createdAt).localeCompare(a.assignment.dueAt ?? a.assignment.createdAt),
  );
  const canOpenTask = (p: Pair) => {
    const a = actMap.get(p.assignment.activityId);
    return !p.assignment.synthetic && !!a && (isAdmin(user.role) || isTeacherOf(a, user.id));
  };
  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  const kinds = groupBy(enrolled, (a) => a.kind);

  return (
    <>
      <Link href={`/statistiky${range !== "pololeti" ? `?obdobi=${range}` : ""}`} className={styles.back}>
        <Icon name="chevronLeft" size={16} />
        Statistiky studentů
      </Link>

      <section className={`card ${styles.student}`} aria-label="Student">
        <Avatar initials={initials(student.name)} userId={student.id} size={64} href={profileHref(student.id)} />
        <div className={styles.studentText}>
          <h1 className={styles.studentName}>{student.name}</h1>
          <span className={styles.studentMeta}>
            {student.grade ? `${student.grade}. ročník` : "Bez ročníku"}
            {(["kurz", "atelier", "expedice", "ostatni"] as const)
              .filter((k) => kinds.get(k)?.length)
              .map((k) => ` · ${KIND_LABEL[k]}: ${kinds.get(k)!.length}`)
              .join("")}
          </span>
        </div>
        <div className={styles.studentActions}>
          <Link href={profileHref(student.id)} className="btn btn-outline-primary">
            Profil
          </Link>
          <Link href={`/zpravy?s=${student.id}`} className="btn btn-primary">
            <Icon name="chat" size={16} />
            Napsat
          </Link>
        </div>
      </section>

      <div className={styles.toolbar}>
        <LinkTabs
          label="Období"
          items={RANGES.map((r) => ({
            href: `/statistiky/${id}${r.key !== "pololeti" ? `?obdobi=${r.key}` : ""}`,
            label: r.label,
            on: r.key === range,
          }))}
        />
      </div>

      <section className={`card ${styles.panel}`} aria-labelledby="ss-splneni">
        <h2 id="ss-splneni" className={styles.panelTitle}>
          Kurzy, ateliéry a expedice
        </h2>
        {completion.length === 0 ? (
          <p className={styles.muted}>V tomto období nebyl zapsaný v žádném kurzu, ateliéru ani expedici.</p>
        ) : (
          <>
            <div className={styles.compSummary}>
              {COMPLETION_KINDS.map((k) => (
                <span key={k.kind} className={styles.compKind}>
                  <span className={styles.rowTitle}>
                    <i className={styles.kindDot} data-kind={k.kind} aria-hidden="true" />
                    {k.label}
                  </span>
                  <CountCell summary={completionSummary(completion.filter((r) => r.activity.kind === k.kind))} />
                </span>
              ))}
            </div>
            <ul className={styles.tasks}>
              {completion.map((r) => {
                const range = activityRange(r.activity);
                return (
                  <li key={r.activity.id} className={styles.task}>
                    <span className={styles.taskText}>
                      <span className={`${styles.taskTitle} ${styles.rowTitle}`}>
                        <i className={styles.kindDot} data-kind={r.activity.kind} aria-hidden="true" />
                        {canOpen(r.activity) ? (
                          <Link href={`${activityHref(r.activity)}${r.state === "ceka" || r.review ? "?tab=hodnoceni" : ""}`}>{r.activity.title}</Link>
                        ) : (
                          r.activity.title
                        )}
                      </span>
                      <span className={styles.taskMeta}>
                        {KIND_LABEL[r.activity.kind]} · {formatDateRange(range.from, range.to)}
                        {r.review && !r.published && " · student hodnocení ještě nevidí (třída není uzavřená)"}
                      </span>
                      {r.review?.feedback && <span className={styles.feedbackText}>„{r.review.feedback}“</span>}
                    </span>
                    <span className={`chip ${COMPLETION_CHIP[r.state]}`}>{COMPLETION_TEXT[r.state]}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <h2 className={styles.sectionTitle}>Úkoly</h2>
      {me.assigned === 0 ? (
        <div className={`card ${styles.emptyCard}`}>V tomto období student nedostal žádný úkol. Zkus delší období.</div>
      ) : (
        <>
          <section className={styles.tiles} aria-label="Souhrn studenta">
            <StatTile
              label="Odevzdáno"
              value={pct(me.handedRate)}
              rate={me.handedRate}
              sub={`${me.handed} z ${me.due} prací po termínu`}
              compare={{ label: `škola ${pct(all.handedRate)}`, diff: diff(me.handedRate, all.handedRate) }}
            />
            <StatTile
              label="Včas"
              value={pct(me.onTimeRate)}
              rate={me.onTimeRate}
              sub={`${me.late}× pozdě`}
              compare={{ label: `škola ${pct(all.onTimeRate)}`, diff: diff(me.onTimeRate, all.onTimeRate) }}
            />
            <StatTile
              label="Splněno"
              value={pct(me.passRate)}
              rate={me.passRate}
              sub={`${me.passed} splněno · ${me.failed} nesplněno`}
              compare={{ label: `škola ${pct(all.passRate)}`, diff: diff(me.passRate, all.passRate) }}
            />
            <StatTile
              label="Průměr bodů"
              value={pct(me.pointsPct)}
              rate={me.pointsPct}
              sub="z maxima u bodovaných úkolů"
              compare={{ label: `škola ${pct(all.pointsPct)}`, diff: diff(me.pointsPct, all.pointsPct) }}
            />
            <StatTile
              label="Chybí po termínu"
              value={String(me.missing)}
              tone={me.missing === 0 ? "ok" : "late"}
              sub={`${me.returnedOpen} vráceno k doplnění · ${me.waiting} čeká na hodnocení`}
            />
          </section>

          <div className={styles.gridEven}>
            <section className={`card ${styles.panel}`} aria-labelledby="ss-prubeh">
              <h2 id="ss-prubeh" className={styles.panelTitle}>
                Průběh po týdnech
              </h2>
              <WeeklyChart weeks={weeks} title="Odevzdávání studenta po týdnech" />
            </section>

            <section className={`card ${styles.panel}`} aria-labelledby="ss-tridy">
              <h2 id="ss-tridy" className={styles.panelTitle}>
                Podle tříd
              </h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Třída</th>
                      <th>Odevzdáno</th>
                      <th>Body</th>
                      <th className={styles.num}>Chybí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perClass.map(({ activity: a, summary: s }) => (
                      <tr key={a.id}>
                        <th scope="row">
                          <span className={styles.rowTitle}>
                            <i className={styles.kindDot} data-kind={a.kind} aria-hidden="true" />
                            {isAdmin(user.role) || isTeacherOf(a, user.id) ? <Link href={activityHref(a)}>{a.title}</Link> : a.title}
                          </span>
                          <span className={styles.rowMeta}>
                            {s.handed} z {s.due} · včas {pct(s.onTimeRate)}
                          </span>
                        </th>
                        <td>
                          <RateCell value={s.handedRate} />
                        </td>
                        <td>
                          <RateCell value={s.pointsPct} />
                        </td>
                        <td className={styles.num}>
                          {s.missing === 0 ? <span className={styles.zero}>0</span> : <span className="chip chip-late">{s.missing}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className={`card ${styles.panel}`} aria-labelledby="ss-ukoly">
            <h2 id="ss-ukoly" className={styles.panelTitle}>
              Úkoly
              <span className={styles.panelNote}>
                {tasks.length} {plural(tasks.length, "úkol", "úkoly", "úkolů")} · nejdřív to, co chybí
              </span>
            </h2>
            <TaskRows rows={tasks.slice(0, 12)} canOpen={canOpenTask} now={input.now} classOf={(aid) => actMap.get(aid)?.title ?? ""} />
            {tasks.length > 12 && (
              <details className={styles.more}>
                <summary>Zobrazit další ({tasks.length - 12})</summary>
                <TaskRows rows={tasks.slice(12)} canOpen={canOpenTask} now={input.now} classOf={(aid) => actMap.get(aid)?.title ?? ""} />
              </details>
            )}
          </section>
        </>
      )}
    </>
  );
}

function TaskRows({
  rows,
  canOpen,
  now,
  classOf,
}: {
  rows: Pair[];
  canOpen: (p: Pair) => boolean;
  now: number;
  classOf: (activityId: string) => string;
}) {
  return (
    <ul className={styles.tasks}>
      {rows.map((p) => {
        const a = p.assignment;
        const title = canOpen(p) ? <Link href={`/ukoly/${a.id}?student=${p.studentId}`}>{a.title}</Link> : a.title;
        return (
          <li key={a.id} className={styles.task}>
            <span className={styles.taskText}>
              <span className={styles.taskTitle}>{title}</span>
              <span className={styles.taskMeta}>
                {classOf(a.activityId)} · {a.dueAt ? `termín ${formatDue(a.dueAt, new Date(now))}` : "bez termínu"}
                {p.onTime === false && " · odevzdáno pozdě"}
                {p.returned && p.state !== "vraceno" && " · po vrácení doplněno"}
              </span>
            </span>
            {a.maxPoints !== null && p.points !== null && (
              <span className={styles.taskPoints}>
                {p.points} / {a.maxPoints} b.
              </span>
            )}
            <span className={`chip ${STATE_TONE[p.state]}`}>{STATE_TEXT[p.state]}</span>
          </li>
        );
      })}
    </ul>
  );
}
