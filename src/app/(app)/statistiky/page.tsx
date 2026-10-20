import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { CompletionCard, LinkTabs, RateCell, StatTile, WeeklyChart } from "@/components/stats/StatBits";
import { StudentPicker } from "@/components/stats/StudentPicker";
import { CompletionTable } from "@/components/stats/CompletionTable";
import styles from "@/components/stats/stats.module.css";
import { requireTeacher } from "@/lib/auth";
import { canOpenActivity, isTeacherOf, listActivities } from "@/lib/data";
import { statsInput } from "@/lib/data-stats";
import { finalData } from "@/lib/data-final";
import { COMPLETION_KINDS, awaitingClosure, completionRows, completionSummary } from "@/lib/completion";
import { pragueNow, toIso } from "@/lib/time";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { initials } from "@/lib/roles";
import {
  RANGES,
  buildPairs,
  doingWell,
  groupBy,
  needsAttention,
  pct,
  plural,
  rangeStart,
  summarize,
  weekly,
  type RangeKey,
} from "@/lib/stats";

export const metadata: Metadata = { title: "Statistiky studentů" };

function readRange(v: string | string[] | undefined): RangeKey {
  return v === "mesic" || v === "rok" ? v : "pololeti";
}

export default async function StatsPage({ searchParams }: PageProps<"/statistiky">) {
  const user = await requireTeacher();
  const sp = await searchParams;
  const range = readRange(sp.obdobi);
  const [input, activities, final] = await Promise.all([statsInput(), listActivities(), finalData()]);
  const mineIds = new Set(activities.filter((a) => isTeacherOf(a, user.id)).map((a) => a.id));
  const scope = sp.rozsah === "moje" && mineIds.size > 0 ? "moje" : "skola";
  const from = rangeStart(range, input.now);

  let pairs = buildPairs(input, from);
  let students = input.students;
  if (scope === "moje") {
    pairs = pairs.filter((p) => mineIds.has(p.assignment.activityId));
    const inMine = new Set(activities.filter((a) => mineIds.has(a.id)).flatMap((a) => a.studentIds));
    students = students.filter((s) => inMine.has(s.id));
  }
  const all = summarize(pairs);

  // Splnění kurzů, ateliérů a expedic (závěrečné hodnocení)
  const today = toIso(pragueNow(new Date(input.now)));
  const fromDay = toIso(pragueNow(new Date(from)));
  const completion = completionRows(
    scope === "moje" ? activities.filter((a) => mineIds.has(a.id)) : activities,
    final.reviews,
    final.closures,
    fromDay,
    today,
    new Set(students.map((s) => s.id)),
  );
  const waiting = awaitingClosure(completion, today);
  const compByStudent = groupBy(completion, (r) => r.studentId);
  const weeks = weekly(pairs, input.now, range === "mesic" ? 5 : 12, from);
  const attention = needsAttention(students, pairs);
  const good = doingWell(students, pairs);
  const byStudent = groupBy(pairs, (p) => p.studentId);

  const query = (o: Partial<{ obdobi: string; rozsah: string }>) => {
    const q = new URLSearchParams();
    const r = o.obdobi ?? range;
    const s = o.rozsah ?? scope;
    if (r !== "pololeti") q.set("obdobi", r);
    if (s !== "skola") q.set("rozsah", s);
    const str = q.toString();
    return str ? `?${str}` : "";
  };
  const keep = query({});

  const gradeStudents = groupBy(students, (s) => s.grade ?? 0);
  const grades = [1, 2, 3, 4, 0]
    .map((g) => {
      const ids = new Set((gradeStudents.get(g) ?? []).map((s) => s.id));
      return { grade: g, students: ids.size, summary: summarize(pairs.filter((p) => ids.has(p.studentId))) };
    })
    .filter((g) => g.students > 0 && (g.grade !== 0 || g.summary.assigned > 0));

  const actMap = new Map(activities.map((a) => [a.id, a]));
  const classes = [...groupBy(pairs, (p) => p.assignment.activityId)]
    .map(([id, list]) => ({
      activity: actMap.get(id)!,
      tasks: new Set(list.map((p) => p.assignment.id)).size,
      summary: summarize(list),
    }))
    .filter((c) => c.activity)
    .sort((a, b) => (a.summary.handedRate ?? 1) - (b.summary.handedRate ?? 1) || b.summary.missing - a.summary.missing);

  const pickerStudents = students.map((s) => ({
    id: s.id,
    name: s.name,
    grade: s.grade,
    handedRate: summarize(byStudent.get(s.id) ?? []).handedRate,
  }));

  return (
    <>
      <PageHeader eyebrow="Výuka" title="Statistiky studentů" subtitle="Jak se studentům daří s úkoly — odevzdávání, termíny a hodnocení.">
        <StudentPicker students={pickerStudents} query={query({ rozsah: "skola" })} />
      </PageHeader>

      <div className={styles.toolbar}>
        <LinkTabs
          label="Období"
          items={RANGES.map((r) => ({ href: `/statistiky${query({ obdobi: r.key })}`, label: r.label, on: r.key === range }))}
        />
        {mineIds.size > 0 && (
          <LinkTabs
            label="Rozsah"
            items={[
              { href: `/statistiky${query({ rozsah: "skola" })}`, label: "Celá škola", on: scope === "skola" },
              { href: `/statistiky${query({ rozsah: "moje" })}`, label: "Moje třídy", on: scope === "moje" },
            ]}
          />
        )}
      </div>

      <h2 className={styles.sectionTitle}>Splnění kurzů, ateliérů a expedic</h2>
      {completion.length === 0 ? (
        <div className={`card ${styles.emptyCard}`}>V tomto období neběžel žádný kurz, ateliér ani expedice{scope === "moje" ? " ve tvých třídách" : ""}.</div>
      ) : (
        <>
          <section className={styles.kindCards} aria-label="Splnění podle druhu">
            {COMPLETION_KINDS.map((k) => (
              <CompletionCard key={k.kind} kind={k.kind} label={k.label} summary={completionSummary(completion.filter((r) => r.activity.kind === k.kind))} />
            ))}
          </section>

          {waiting.length > 0 && (
            <section className={`card ${styles.panel}`} aria-labelledby="st-uzavreni">
              <h2 id="st-uzavreni" className={styles.panelTitle}>
                Čeká na uzavření
                <span className={styles.count} data-tone="wait">{waiting.length}</span>
                <span className={styles.panelNote}>skončilo, ale studenti hodnocení ještě nevidí</span>
              </h2>
              <ul className={styles.waitList}>
                {waiting.map((w) => (
                  <li key={w.activity.id}>
                    <span className={styles.rowTitle}>
                      <i className={styles.kindDot} data-kind={w.activity.kind} aria-hidden="true" />
                      {canOpenActivity(user, w.activity) ? (
                        <Link href={`${activityHref(w.activity)}?tab=hodnoceni`}>{w.activity.title}</Link>
                      ) : (
                        w.activity.title
                      )}
                    </span>
                    <span className={styles.rowMeta}>
                      {KIND_LABEL[w.activity.kind]} · ohodnoceno {w.graded} z {w.total}
                      {mineIds.has(w.activity.id) && " · moje"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`card ${styles.panel}`} aria-labelledby="st-studenti">
            <h2 id="st-studenti" className={styles.panelTitle}>
              Studenti
              <span className={styles.panelNote}>splněno / nesplněno / čeká na hodnocení</span>
            </h2>
            <CompletionTable
              kinds={COMPLETION_KINDS.map((k) => ({ kind: k.kind, label: k.label }))}
              keep={keep}
              rows={[...students]
                .filter((s) => compByStudent.has(s.id) || byStudent.has(s.id))
                .sort((a, b) => (a.grade || 9) - (b.grade || 9) || a.name.localeCompare(b.name, "cs"))
                .map((s) => {
                  const rows = compByStudent.get(s.id) ?? [];
                  return {
                    id: s.id,
                    name: s.name,
                    grade: s.grade,
                    kinds: COMPLETION_KINDS.map((k) => completionSummary(rows.filter((r) => r.activity.kind === k.kind))),
                    handedRate: summarize(byStudent.get(s.id) ?? []).handedRate,
                  };
                })}
            />
          </section>
        </>
      )}

      <h2 className={styles.sectionTitle}>Úkoly</h2>
      {all.assigned === 0 ? (
        <div className={`card ${styles.emptyCard}`}>
          V tomto období zatím nebyl zadaný žádný úkol{scope === "moje" ? " ve tvých třídách" : ""}. Zkus delší období.
        </div>
      ) : (
        <>
          <section className={styles.tiles} aria-label="Souhrn">
            <StatTile
              label="Odevzdáno"
              value={pct(all.handedRate)}
              rate={all.handedRate}
              sub={`${all.handed} z ${all.due} prací po termínu`}
              hint="Podíl odevzdaných prací ze všech, kterým už prošel termín (nebo jsou odevzdané)."
            />
            <StatTile
              label="Včas"
              value={pct(all.onTimeRate)}
              rate={all.onTimeRate}
              sub={`${all.late} ${plural(all.late, "práce", "práce", "prací")} pozdě`}
              hint="Kolik odevzdaných prací přišlo do termínu."
            />
            <StatTile
              label="Splněno"
              value={pct(all.passRate)}
              rate={all.passRate}
              sub={`${all.passed} splněno · ${all.failed} nesplněno`}
              hint="Podíl splněných z ohodnocených prací."
            />
            <StatTile
              label="Průměr bodů"
              value={pct(all.pointsPct)}
              rate={all.pointsPct}
              sub="z maxima u bodovaných úkolů"
              hint="Průměr získaných bodů v procentech maxima (jen ohodnocené úkoly s body)."
            />
            <StatTile
              label="Chybí po termínu"
              value={String(all.missing)}
              tone={all.missing === 0 ? "ok" : "late"}
              sub={`${all.returnedOpen} vráceno k doplnění · ${all.waiting} čeká na hodnocení`}
              hint="Neodevzdané práce, kterým už prošel termín."
            />
          </section>

          <div className={styles.grid}>
            <section className={`card ${styles.panel}`} aria-labelledby="st-prubeh">
              <h2 id="st-prubeh" className={styles.panelTitle}>
                Průběh po týdnech
              </h2>
              <WeeklyChart weeks={weeks} title="Odevzdávání po týdnech" />
            </section>

            <section className={`card ${styles.panel}`} aria-labelledby="st-pozornost">
              <h2 id="st-pozornost" className={styles.panelTitle}>
                Potřebují pozornost
                {attention.length > 0 && <span className={styles.count}>{attention.length}</span>}
              </h2>
              {attention.length === 0 ? (
                <p className={styles.muted}>Nikdo teď nezaostává. 🎉</p>
              ) : (
                <PeopleList
                  rows={attention.map((a) => ({
                    id: a.student.id,
                    name: a.student.name,
                    meta: a.student.grade ? `${a.student.grade}. ročník · odevzdáno ${pct(a.summary.handedRate)}` : `odevzdáno ${pct(a.summary.handedRate)}`,
                    chips: a.reasons,
                  }))}
                  keep={keep}
                />
              )}
            </section>
          </div>

          <div className={styles.grid}>
            <section className={`card ${styles.panel}`} aria-labelledby="st-rocniky">
              <h2 id="st-rocniky" className={styles.panelTitle}>
                Podle ročníků
              </h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ročník</th>
                      <th>Odevzdáno</th>
                      <th>Včas</th>
                      <th>Body</th>
                      <th className={styles.num}>Chybí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grades.map((g) => (
                      <tr key={g.grade}>
                        <th scope="row">
                          <span className={styles.rowTitle}>{g.grade ? `${g.grade}. ročník` : "Bez ročníku"}</span>
                          <span className={styles.rowMeta}>
                            {g.students} {plural(g.students, "student", "studenti", "studentů")}
                          </span>
                        </th>
                        <td>
                          <RateCell value={g.summary.handedRate} detail={`${g.summary.handed} z ${g.summary.due}`} />
                        </td>
                        <td>
                          <RateCell value={g.summary.onTimeRate} />
                        </td>
                        <td>
                          <RateCell value={g.summary.pointsPct} />
                        </td>
                        <td className={styles.num}>
                          <MissingCount n={g.summary.missing} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`card ${styles.panel}`} aria-labelledby="st-dari">
              <h2 id="st-dari" className={styles.panelTitle}>
                Daří se jim
              </h2>
              {good.length === 0 ? (
                <p className={styles.muted}>Zatím nikdo nemá aspoň 3 práce, všechny odevzdané a skoro všechny včas.</p>
              ) : (
                <PeopleList
                  rows={good.map((g) => ({
                    id: g.student.id,
                    name: g.student.name,
                    meta: `${g.student.grade ? `${g.student.grade}. ročník · ` : ""}${g.summary.handed} prací, včas ${pct(g.summary.onTimeRate)}`,
                    chips: g.summary.pointsPct !== null ? [{ label: `body ${pct(g.summary.pointsPct)}`, tone: "ok" as const }] : [],
                  }))}
                  keep={keep}
                />
              )}
            </section>
          </div>

          <section className={`card ${styles.panel}`} aria-labelledby="st-tridy">
            <h2 id="st-tridy" className={styles.panelTitle}>
              Podle tříd
              <span className={styles.panelNote}>nejslabší nahoře</span>
            </h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Třída</th>
                    <th className={styles.num}>Úkolů</th>
                    <th>Odevzdáno</th>
                    <th>Včas</th>
                    <th>Splněno</th>
                    <th>Body</th>
                    <th className={styles.num}>Chybí</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(({ activity: a, tasks, summary: s }) => (
                    <tr key={a.id}>
                      <th scope="row">
                        <span className={styles.rowTitle}>
                          <i className={styles.kindDot} data-kind={a.kind} aria-hidden="true" />
                          {canOpenActivity(user, a) ? <Link href={activityHref(a)}>{a.title}</Link> : a.title}
                        </span>
                        <span className={styles.rowMeta}>
                          {KIND_LABEL[a.kind]}
                          {a.kind === "kurz" && a.period ? ` · ${a.period.name}` : ""} · {a.studentIds.length} {plural(a.studentIds.length, "student", "studenti", "studentů")}
                          {mineIds.has(a.id) && " · moje"}
                        </span>
                      </th>
                      <td className={styles.num}>{tasks}</td>
                      <td>
                        <RateCell value={s.handedRate} detail={`${s.handed} z ${s.due}`} />
                      </td>
                      <td>
                        <RateCell value={s.onTimeRate} />
                      </td>
                      <td>
                        <RateCell value={s.passRate} />
                      </td>
                      <td>
                        <RateCell value={s.pointsPct} />
                      </td>
                      <td className={styles.num}>
                        <MissingCount n={s.missing} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className={styles.footNote}>
        Počítají se zveřejněné úkoly (ne materiály) s termínem v období, u každého studenta zapsaného ve třídě. Barvy: zeleně
        aspoň 85 %, oranžově 70–84 %, červeně méně. Statistiky vidí jen vyučující a admin.
      </p>
    </>
  );
}

function MissingCount({ n }: { n: number }) {
  return n === 0 ? <span className={styles.zero}>0</span> : <span className="chip chip-late">{n}</span>;
}

function PeopleList({
  rows,
  keep,
}: {
  rows: { id: string; name: string; meta: string; chips: { label: string; tone: "late" | "wait" | "ok" }[] }[];
  keep: string;
}) {
  const shown = rows.slice(0, 6);
  const rest = rows.slice(6);
  const item = (r: (typeof rows)[number]) => (
    <li key={r.id}>
      <Link href={`/statistiky/${r.id}${keep}`} className={styles.person}>
        <Avatar initials={initials(r.name)} userId={r.id} size={36} />
        <span className={styles.personText}>
          <span className={styles.personName}>{r.name}</span>
          <span className={styles.personMeta}>{r.meta}</span>
          {r.chips.length > 0 && (
            <span className={styles.personChips}>
              {r.chips.map((c) => (
                <span key={c.label} className={`chip chip-${c.tone}`}>
                  {c.label}
                </span>
              ))}
            </span>
          )}
        </span>
        <Icon name="chevronRight" size={16} />
      </Link>
    </li>
  );
  return (
    <>
      <ul className={styles.people}>{shown.map(item)}</ul>
      {rest.length > 0 && (
        <details className={styles.more}>
          <summary>Zobrazit další ({rest.length})</summary>
          <ul className={styles.people}>{rest.map(item)}</ul>
        </details>
      )}
    </>
  );
}
