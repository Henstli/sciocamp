import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { MeetLink } from "@/components/MeetLink";
import { PageHeader, Avatar } from "@/components/PageHeader";
import { ScheduleWeek } from "@/components/ScheduleWeek";
import { requireUser } from "@/lib/auth";
import { homeTasks } from "@/lib/data-assignments";
import { unreadMessages } from "@/lib/data-communication";
import { plural } from "@/lib/format";
import { activitiesForUser, getUserById, getUsersByIds, listActivities } from "@/lib/data";
import { activityHref } from "@/lib/links";
import { canTeach, firstNameVocative, initials } from "@/lib/roles";
import { blockedWeekdays, consultationEntries, currentOrNext, expeditionBlocker, weekAllDay, weekEntries } from "@/lib/schedule";
import { myConsultations } from "@/lib/data-consultations";
import {
  DAYS_SHORT,
  defaultWeekStart,
  formatLongDate,
  formatRange,
  formatDue,
  isoWeekdayOf,
  addDays,
  mondayOf,
  nowMs,
  parseIso,
  pragueNow,
  sameDate,
  toIso,
} from "@/lib/time";
import styles from "./home.module.css";
import { HomeSearch } from "@/components/search/HomeSearch";
import { buildSearchIndex } from "@/lib/search-index";
import { listProposals, listWishes, memberCount } from "@/lib/data-proposals";
import { CHOICE_LABEL, percentOf, votingDaysLeft, votingOpen } from "@/lib/proposals";

export const metadata: Metadata = { title: "Domov" };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const now = pragueNow();
  const { tyden } = await searchParams;
  const picked = parseIso(typeof tyden === "string" ? tyden : undefined);
  const monday = picked ? mondayOf(picked) : defaultWeekStart(now);

  const activities = await activitiesForUser(user);
  // Týden expedic platí pro celou školu — počítá se ze všech expedic.
  const blocked = expeditionBlocker(await listActivities());
  // Konzultace (pátek) v týdnu — student, vyučující i pozvaní.
  const consults = await myConsultations(user, toIso(monday), toIso(addDays(monday, 4)));
  const consultPeople = await getUsersByIds([...new Set(consults.flatMap((c) => [c.teacherId, c.studentId]))]);
  const personName = (id: string) => consultPeople.find((u) => u.id === id)?.name ?? "";
  const entries = [
    ...weekEntries(activities, monday, now, blocked),
    ...consultationEntries(
      consults.map((c) => ({
        ...c,
        title: `Konzultace: ${personName(c.teacherId === user.id ? c.studentId : c.teacherId)}`,
      })),
      monday,
      now,
    ),
  ];
  const allDay = weekAllDay(activities, monday);
  const blockedDays = blockedWeekdays(monday, blocked, allDay);
  const upcoming = currentOrNext(activities, now, blocked);
  const upcomingTeacher = upcoming ? await getUserById(upcoming.activity.teacherId) : null;
  const wishes = await listWishes(user);
  const openWishes = wishes.filter((w) => w.status === "open");
  const wishWaiting = openWishes.filter((w) => !w.voted).length;
  // Návrhy, o kterých se právě hlasuje: povinné a nehlasované nahoru, pak podle konce hlasování.
  const [proposals, members] = await Promise.all([listProposals(user), memberCount()]);
  const nowValue = nowMs();
  const votingNow = proposals
    .filter((p) => votingOpen(p, nowValue))
    .sort(
      (a, b) =>
        Number(!!b.mandatoryAt && !b.myChoice) - Number(!!a.mandatoryAt && !a.myChoice) ||
        Number(!b.myChoice) - Number(!a.myChoice) ||
        a.votingEndsAt.localeCompare(b.votingEndsAt),
    );
  const proposalsWaiting = votingNow.filter((p) => !p.myChoice).length;
  const tasks = await homeTasks(user);
  const messages = await unreadMessages(user);
  const senders = await getUsersByIds(messages.from.slice(0, 3));
  const teaching = canTeach(user.role);

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(now)}
        title={`Ahoj, ${firstNameVocative(user.name)}`}
        avatar={{ initials: initials(user.name), name: user.name }}
      >
        <HomeSearch items={await buildSearchIndex(user)} />
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

        <StatCard
          href="/hlasovani"
          icon="vote"
          title="Hlasování"
          value={wishWaiting}
          unit={`${plural(wishWaiting, "přání čeká", "přání čekají", "přání čeká")} na tvůj hlas`}
        >
          <div className={styles.chips}>
            <span className="chip chip-wait">{openWishes.length} {plural(openWishes.length, "otevřené", "otevřená", "otevřených")}</span>
            <span className="chip chip-ok">{wishes.filter((w) => w.status === "vypsano").length} schváleno</span>
          </div>
          {openWishes[0] && (
            <div className={styles.statFoot}>
              Nejžádanější: {openWishes[0].title} ({openWishes[0].voteCount})
            </div>
          )}
        </StatCard>

        {(
          <StatCard href="/zpravy" icon="chat" title="Zprávy" value={messages.unread} unit={plural(messages.unread, "nepřečtená zpráva", "nepřečtené zprávy", "nepřečtených zpráv")}>
            <div className={styles.people}>
              <div className={styles.faces}>
                {senders.map((s) => (
                  <span key={s.id} className={styles.face}>
                    <Avatar initials={initials(s.name)} userId={s.id} size={30} tone={s.role === "student" ? "student" : "ucitel"} />
                  </span>
                ))}
              </div>
              <div className={styles.statFoot}>{senders.length ? senders.map((s) => s.name).join(", ") : "Všechno máš přečtené."}</div>
            </div>
          </StatCard>
        )}
      </section>

      <div className={styles.columns}>
        <div className={styles.schedule}>
          <ScheduleWeek entries={entries} allDay={allDay} blockedDays={blockedDays} monday={monday} now={now} title={teaching ? "Můj rozvrh výuky" : "Rozvrh týdne"} />
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

          <section aria-label="Návrhy k hlasování" className={`card ${styles.panel}`}>
            <div className={styles.panelHead}>
              <h2 className="section-title">Návrhy</h2>
              <Link href="/navrhy">Vše</Link>
            </div>
            {votingNow.length === 0 && <p className={styles.itemMeta}>Teď se o žádném návrhu nehlasuje. Máš nápad, co ve škole zlepšit?</p>}
            {votingNow.slice(0, 3).map((p) => {
              const share = (n: number) => `${(n / Math.max(members, 1)) * 100}%`;
              const days = votingDaysLeft(p.votingEndsAt, nowValue);
              return (
                <Link key={p.id} href={`/navrhy/${p.id}`} className={styles.vote}>
                  <div className={styles.voteHead}>
                    <div className={styles.itemTitle}>{p.title}</div>
                    {p.mandatoryAt ? (
                      <span className="chip chip-primary">Povinné</span>
                    ) : (
                      <span className={`chip ${days === 0 ? "chip-late" : days <= 3 ? "chip-wait" : "chip-info"}`}>
                        {days === 0 ? "dnes končí" : `${days} ${plural(days, "den", "dny", "dní")}`}
                      </span>
                    )}
                  </div>
                  <div className={styles.pollBar}>
                    <span style={{ width: share(p.proCount), background: "var(--primary)" }} />
                    <span style={{ width: share(p.neutralCount), background: "#c3cad8" }} />
                    <span style={{ width: share(p.againstCount), background: "#c93b3b" }} />
                  </div>
                  <div className={styles.itemMeta}>
                    Pro {percentOf(p.proCount, members)} % · proti {percentOf(p.againstCount, members)} % ·{" "}
                    {p.myChoice ? `tvůj hlas: ${CHOICE_LABEL[p.myChoice].toLowerCase()}` : "ty zatím ne"}
                  </div>
                </Link>
              );
            })}
            <Link href="/navrhy" className="btn btn-primary">
              {proposalsWaiting > 0 ? "Jít hlasovat" : "Podat návrh"}
            </Link>
          </section>
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
