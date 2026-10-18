import Link from "next/link";
import { Icon } from "./Icon";
import { activityHref } from "@/lib/links";
import { hourRange, type AllDayEntry, type ScheduleEntry } from "@/lib/schedule";
import { DAYS_SHORT, addDays, formatRange, formatWeekRange, sameDate, toIso, toMinutes, type PlainDate, type PragueNow } from "@/lib/time";
import styles from "./ScheduleWeek.module.css";

const PX_PER_MIN = 1; // 60 px na hodinu, stejně jako v návrhu

export function ScheduleWeek({
  entries,
  allDay = [],
  monday,
  now,
  title = "Rozvrh týdne",
  blockedDays = [],
}: {
  /** Dny týdne expedic, kdy uživatel sám na expedici nejede (výuka neprobíhá). */
  blockedDays?: number[];
  entries: ScheduleEntry[];
  /** Vícedenní akce bez rozvrhu (expedice) — celodenní pruh nad hodinami */
  allDay?: AllDayEntry[];
  monday: PlainDate;
  now: PragueNow;
  title?: string;
}) {
  const { from, to } = hourRange(entries);
  const height = (to - from) * 60 * PX_PER_MIN;
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const prev = toIso(addDays(monday, -7));
  // Souvislé úseky blokovaných dnů → jeden pruh „Týden expedic“.
  const blockedRuns: number[][] = [];
  for (const d of blockedDays) {
    const last = blockedRuns.at(-1);
    if (last && last.at(-1) === d - 1) last.push(d);
    else blockedRuns.push([d]);
  }
  const laneCount = allDay.length + blockedRuns.length;
  const next = toIso(addDays(monday, 7));

  return (
    <section aria-label={title} className={`card ${styles.card}`}>
      <div className={styles.top}>
        <h2 className="section-title">{title}</h2>
        <div className={styles.weekNav}>
          <Link href={`/?tyden=${prev}`} scroll={false} aria-label="Předchozí týden" className={styles.navBtn}>
            <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
          </Link>
          <div className={styles.weekLabel}>{formatWeekRange(monday)}</div>
          <Link href={`/?tyden=${next}`} scroll={false} aria-label="Další týden" className={styles.navBtn}>
            <Icon name="chevronRight" size={16} strokeWidth={2.2} />
          </Link>
        </div>
      </div>

      <div className={styles.scroller}>
        <div className={styles.grid}>
          <div style={{ gridRow: 1 }} />
          {days.map((d, i) => {
            const today = sameDate(d, now);
            return (
              <div key={i} className={styles.dayHead} data-today={today} style={{ gridRow: 1 }}>
                {DAYS_SHORT[i]}
                <span>{d.d}</span>
              </div>
            );
          })}

          {laneCount > 0 && (
            <div className={styles.allDay}>
              <div className={styles.allDayLabel}>celý den</div>
              {allDay.map((e, i) => (
                <Link
                  key={e.activity.id}
                  href={activityHref(e.activity)}
                  className={styles.allDayEntry}
                  data-kind={e.activity.kind}
                  style={{ gridColumn: `${e.days[0] + 1} / ${e.days[e.days.length - 1] + 2}`, gridRow: i + 1 }}
                  title={[e.activity.title, e.activity.location].filter(Boolean).join(" · ")}
                >
                  <span className={styles.entryTitle}>{e.activity.title}</span>
                  {e.activity.location && <span className={styles.entryTime}>{e.activity.location}</span>}
                </Link>
              ))}
              {blockedRuns.map((run, i) => (
                <div
                  key={`blok-${run[0]}`}
                  className={styles.allDayEntry}
                  data-kind="blocked"
                  style={{ gridColumn: `${run[0] + 1} / ${run[run.length - 1] + 2}`, gridRow: allDay.length + i + 1 }}
                >
                  <span className={styles.entryTitle}>Týden expedic</span>
                  <span className={styles.entryTime}>Kurzy, ateliéry ani události neprobíhají</span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.hours} style={{ height, gridRow: 3 }}>
            {Array.from({ length: to - from }, (_, i) => (
              <div key={i} className={styles.hour} style={{ top: i * 60 * PX_PER_MIN }}>
                {from + i}:00
              </div>
            ))}
          </div>

          {days.map((d, i) => {
            const today = sameDate(d, now);
            const dayEntries = entries.filter((e) => e.slot.day === i + 1);
            return (
              <div key={i} className={styles.dayCol} data-today={today} style={{ height, gridRow: 3 }}>
                {dayEntries.map((e) => {
                  const top = (toMinutes(e.slot.start) - from * 60) * PX_PER_MIN;
                  const h = (toMinutes(e.slot.end) - toMinutes(e.slot.start)) * PX_PER_MIN;
                  return (
                    <Link
                      key={`${e.activity.id}-${e.slot.day}-${e.slot.start}`}
                      href={activityHref(e.activity)}
                      className={styles.entry}
                      data-kind={e.activity.kind}
                      data-live={e.live}
                      data-short={h <= 60}
                      title={`${e.activity.title}, ${formatRange(e.slot)}`}
                      style={{ top: top + 2, height: h - 4 }}
                    >
                      <span className={styles.entryTitle}>
                        {e.activity.kind === "atelier" ? `Ateliér: ${e.activity.title}` : e.activity.title}
                      </span>
                      <span className={styles.entryTime}>{formatRange(e.slot)}</span>
                      {e.live && <span className="sr-only"> (právě probíhá)</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.legend}>
        <span><i data-kind="kurz" />Kurz</span>
        <span><i data-kind="atelier" />Ateliér</span>
        <span><i data-kind="ostatni" />Událost</span>
        <span><i data-kind="expedice" />Expedice</span>
        <span><i data-kind="live" />Právě probíhá</span>
      </div>
    </section>
  );
}
