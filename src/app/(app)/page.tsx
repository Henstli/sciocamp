import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { MeetLink } from "@/components/MeetLink";
import { PageHeader, Avatar } from "@/components/PageHeader";
import { ScheduleWeek } from "@/components/ScheduleWeek";
import { requireUser } from "@/lib/auth";
import { homeTasks } from "@/lib/data-assignments";
import { plural } from "@/lib/format";
import { activitiesForUser, getHomeSummary, getUserById, getUsersByIds } from "@/lib/data";
import { activityHref } from "@/lib/links";
import { canTeach, firstNameVocative, initials } from "@/lib/roles";
import { currentOrNext, weekAllDay, weekEntries } from "@/lib/schedule";
import {
  DAYS_SHORT,
  defaultWeekStart,
  formatLongDate,
  formatRange,
  formatDue,
  isoWeekdayOf,
  mondayOf,
  parseIso,
  pragueNow,
  sameDate,
} from "@/lib/time";
import styles from "./home.module.css";

export const metadata: Metadata = { title: "Domov" };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const now = pragueNow();
  const { tyden } = await searchParams;
  const picked = parseIso(typeof tyden === "string" ? tyden : undefined);
  const monday = picked ? mondayOf(picked) : defaultWeekStart(now);

  const activities = await activitiesForUser(user);
  const entries = weekEntries(activities, monday, now);
  const allDay = weekAllDay(activities, monday);
  const upcoming = currentOrNext(activities, now);
  const upcomingTeacher = upcoming ? await getUserById(upcoming.activity.teacherId) : null;
  const home = await getHomeSummary();
  const tasks = await homeTasks(user);
  const senders = home ? await getUsersByIds(home.messages.from) : [];
  const teaching = canTeach(user.role);

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(now)}
        title={`Ahoj, ${firstNameVocative(user.name)}`}
        avatar={{ initials: initials(user.name), name: user.name }}
      >
        <label className={styles.search}>
          <Icon name="search" size={18} />
          <input type="search" aria-label="Hledat" placeholder="Hledat kurzy, úkoly, lidi…" />
        </label>
        <button type="button" aria-label="Oznámení" className={styles.bell}>
          <Icon name="bell" />
        </button>
      </PageHeader>

      {upcoming && (
        <div className={styles.banner} data-live={upcoming.live}>
          <div className={styles.bannerIcon}>
            <Icon name="video" size={22} />
          </div>
          <div className={styles.bannerText}>
            <div className={styles.bannerTitle}>
              {upcoming.live ? "Právě probíhá" : "Další hodina"}: {upcoming.activity.title}
            </div>
            <div className={styles.bannerMeta}>
              {!upcoming.live && !sameDate(upcoming.date, now) && `${DAYS_SHORT[isoWeekdayOf(upcoming.date) - 1]} ${upcoming.date.d}. ${upcoming.date.m}. · `}
              {formatRange(upcoming.slot)} · {upcomingTeacher?.name}
              {upcoming.activity.location ? ` · ${upcoming.activity.location}` : ""}
            </div>
          </div>
          <Link href={activityHref(upcoming.activity)} className="btn btn-outline">
            Otevřít třídu
          </Link>
          <MeetLink
            url={upcoming.activity.meetUrl}
            variant={upcoming.live ? "primary" : "soft"}
            label={upcoming.activity.teacherId === user.id ? "Zahájit Meet" : "Připojit se přes Meet"}
          />
        </div>
      )}

      <section aria-label="Přehled" className={styles.stats}>
        {teaching ? (
          <StatCard href="/ukoly" icon="monitor" title="K opravení" value={tasks.headline} unit={plural(tasks.headline, "odevzdaná práce", "odevzdané práce", "odevzdaných prací")}>
            <div className={styles.statFoot}>
              {tasks.headline === 0
                ? "Všechno je opravené."
                : `V ${tasks.assignmentsToReview} ${plural(tasks.assignmentsToReview, "úkolu", "úkolech", "úkolech")}`}
            </div>
          </StatCard>
        ) : (
          <StatCard href="/ukoly" icon="check" title="Úkoly" value={tasks.headline} unit={plural(tasks.headline, "otevřený úkol", "otevřené úkoly", "otevřených úkolů")}>
            {tasks.done + tasks.waiting + tasks.late > 0 && (
              <div className={styles.bar}>
                <div style={{ flex: tasks.done, background: "#1F8A5B" }} />
                <div style={{ flex: tasks.waiting, background: "#F0A63A" }} />
                <div style={{ flex: tasks.late, background: "#C93B3B" }} />
              </div>
            )}
            <div className={styles.legend}>
              <span><i style={{ background: "#1F8A5B" }} />{tasks.done} hotovo</span>
              <span><i style={{ background: "#F0A63A" }} />{tasks.waiting} čeká</span>
              <span><i style={{ background: "#C93B3B" }} />{tasks.late} po termínu</span>
            </div>
          </StatCard>
        )}

        {home && (
          <StatCard href="/hlasovani" icon="vote" title="Hlasování" value={home.polls.waiting} unit="čekají na tvůj hlas">
            <div className={styles.chips}>
              <span className="chip chip-wait">{home.polls.running} probíhající</span>
              <span className="chip chip-info">{home.polls.closed} ukončená</span>
            </div>
            <div className={styles.statFoot}>Nejbližší konec: {home.polls.nextEnd}</div>
          </StatCard>
        )}

        {home && (
          <StatCard href="/zpravy" icon="chat" title="Zprávy" value={home.messages.unread} unit="nepřečtené zprávy">
            <div className={styles.people}>
              <div className={styles.faces}>
                {senders.map((s) => (
                  <span key={s.id} className={styles.face}>
                    <Avatar initials={initials(s.name)} size={30} tone={s.role === "student" ? "student" : "ucitel"} />
                  </span>
                ))}
              </div>
              <div className={styles.statFoot}>{senders.map((s) => s.name).join(", ")}</div>
            </div>
          </StatCard>
        )}
      </section>

      <div className={styles.columns}>
        <div className={styles.schedule}>
          <ScheduleWeek entries={entries} allDay={allDay} monday={monday} now={now} title={teaching ? "Můj rozvrh výuky" : "Rozvrh týdne"} />
        </div>

        <div className={styles.side}>
          <section aria-label="Nejbližší termíny" className={`card ${styles.panel}`}>
            <div className={styles.panelHead}>
              <h2 className="section-title">Nejbližší termíny</h2>
              <Link href="/ukoly">Vše</Link>
            </div>
            {tasks.deadlines.length === 0 && <div className={styles.itemMeta}>Žádné blížící se termíny.</div>}
            {tasks.deadlines.map((d) => {
              const date = pragueNow(new Date(d.dueAt));
              return (
                <Link key={d.id} href={`/ukoly/${d.id}`} className={styles.deadline}>
                  <div className={styles.dateBox} data-urgent={d.urgent}>
                    {DAYS_SHORT[date.isoWeekday - 1].toUpperCase()}
                    <span>{date.d}</span>
                  </div>
                  <div>
                    <div className={styles.itemTitle}>{d.title}</div>
                    <div className={styles.itemMeta}>
                      {d.meta} · {formatDue(d.dueAt)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>

          {home && (
          <section aria-label="Probíhající hlasování" className={`card ${styles.panel}`}>
            <div className={styles.panelHead}>
              <h2 className="section-title">Hlasování</h2>
              <Link href="/hlasovani">Vše</Link>
            </div>
            {home.votes.map((v) => (
              <div key={v.title} className={styles.vote}>
                <div className={styles.voteHead}>
                  <div className={styles.itemTitle}>{v.title}</div>
                  <span className={`chip ${v.soon ? "chip-wait" : "chip-info"}`}>{v.ends}</span>
                </div>
                <div className={styles.progress}>
                  <div style={{ width: `${v.percent}%` }} />
                </div>
                <div className={styles.itemMeta}>Hlasovalo {v.percent} % · ty zatím ne</div>
              </div>
            ))}
            <Link href="/hlasovani" className="btn btn-primary">
              Jít hlasovat
            </Link>
          </section>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({
  href,
  icon,
  title,
  value,
  unit,
  children,
}: {
  href: string;
  icon: IconName;
  title: string;
  value: number;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`card ${styles.stat}`}>
      <div className={styles.statHead}>
        <div className={styles.statIcon}>
          <Icon name={icon} size={18} />
        </div>
        <div className={styles.statTitle}>{title}</div>
        <Icon name="chevronRight" size={18} className={styles.chev} />
      </div>
      <div className={styles.value}>
        <span>{value}</span>
        {unit}
      </div>
      {children}
    </Link>
  );
}
