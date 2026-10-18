import Link from "next/link";
import { Icon } from "./Icon";
import { activityHref } from "@/lib/links";
import { hourRange, type ScheduleEntry } from "@/lib/schedule";
import { DAYS_SHORT, addDays, formatRange, formatWeekRange, sameDate, toIso, toMinutes, type PlainDate, type PragueNow } from "@/lib/time";
import styles from "./ScheduleWeek.module.css";

const PX_PER_MIN = 1; // 60 px na hodinu, stejně jako v návrhu

export function ScheduleWeek({
  entries,
  monday,
  now,
  title = "Rozvrh týdne",
}: {
  entries: ScheduleEntry[];
  monday: PlainDate;
  now: PragueNow;
  title?: string;
}) {
  const { from, to } = hourRange(entries);
  const height = (to - from) * 60 * PX_PER_MIN;
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const prev = toIso(addDays(monday, -7));
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
          <div />
          {days.map((d, i) => {
            const today = sameDate(d, now);
            return (
              <div key={i} className={styles.dayHead} data-today={today}>
                {DAYS_SHORT[i]}
                <span>{d.d}</span>
              </div>
            );
          })}

          <div className={styles.hours} style={{ height }}>
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
              <div key={i} className={styles.dayCol} data-today={today} style={{ height }}>
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
        <span><i data-kind="ostatni" />Ostatní</span>
        <span><i data-kind="live" />Právě probíhá</span>
      </div>
    </section>
  );
}
