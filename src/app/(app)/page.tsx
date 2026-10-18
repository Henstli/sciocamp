import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { MeetLink } from "@/components/MeetLink";
import { PageHeader, Avatar } from "@/components/PageHeader";
import { ScheduleWeek } from "@/components/ScheduleWeek";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, getHomeSummary, getUserById, getUsersByIds } from "@/lib/data";
import { activityHref } from "@/lib/links";
import { canTeach, firstNameVocative, initials } from "@/lib/roles";
import { currentOrNext, weekEntries } from "@/lib/schedule";
import {
  DAYS_SHORT,
  defaultWeekStart,
  formatLongDate,
  formatRange,
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
  const upcoming = currentOrNext(activities, now);
  const upcomingTeacher = upcoming ? await getUserById(upcoming.activity.teacherId) : null;
  const home = await getHomeSummary();
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
              {formatRange(upcoming.slot)} · {upcomingTeacher?.name} · {upcoming.activity.room}
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

      {home && (
      <section aria-label="Přehled" className={styles.stats}>
        {teaching ? (
          <StatCard href="/ucitel" icon="monitor" title="K opravení" value={home.toGrade} unit="odevzdaných prací">
            <div className={styles.statFoot}>Hodnocení přijde v etapě 2</div>
          </StatCard>
        ) : (
          <StatCard href="/ukoly" icon="check" title="Úkoly" value={home.tasks.open} unit="otevřených úkolů">
            <div className={styles.bar}>
              <div style={{ flex: home.tasks.done, background: "#1F8A5B" }} />
              <div style={{ flex: home.tasks.waiting, background: "#F0A63A" }} />
              <div style={{ flex: home.tasks.late, background: "#C93B3B" }} />
            </div>
            <div className={styles.legend}>
              <span><i style={{ background: "#1F8A5B" }} />{home.tasks.done} hotovo</span>
              <span><i style={{ background: "#F0A63A" }} />{home.tasks.waiting} čeká</span>
              <span><i style={{ background: "#C93B3B" }} />{home.tasks.late} po termínu</span>
            </div>
          </StatCard>
        )}

        <StatCard href="/hlasovani" icon="vote" title="Hlasování" value={home.polls.waiting} unit="čekají na tvůj hlas">
          <div className={styles.chips}>
            <span className="chip chip-wait">{home.polls.running} probíhající</span>
            <span className="chip chip-info">{home.polls.closed} ukončená</span>
          </div>
          <div className={styles.statFoot}>Nejbližší konec: {home.polls.nextEnd}</div>
        </StatCard>

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
      </section>
      )}

      <div className={styles.columns}>
        <div className={styles.schedule}>
          <ScheduleWeek entries={entries} monday={monday} now={now} title={teaching ? "Můj rozvrh výuky" : "Rozvrh týdne"} />
        </div>

        {home && (
        <div className={styles.side}>
          <section aria-label="Nejbližší termíny" className={`card ${styles.panel}`}>
            <div className={styles.panelHead}>
              <h2 className="section-title">Nejbližší termíny</h2>
              <Link href="/ukoly">Vše</Link>
            </div>
            {home.deadlines.map((d) => {
              const date = parseIso(d.date)!;
              return (
                <div key={d.title} className={styles.deadline}>
                  <div className={styles.dateBox} data-urgent={d.urgent}>
                    {DAYS_SHORT[isoWeekdayOf(date) - 1].toUpperCase()}
                    <span>{date.d}</span>
                  </div>
                  <div>
                    <div className={styles.itemTitle}>{d.title}</div>
                    <div className={styles.itemMeta}>{d.meta}</div>
                  </div>
                </div>
              );
            })}
          </section>

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
        </div>
        )}
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
