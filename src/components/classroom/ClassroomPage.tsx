import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "../Icon";
import { MeetLink } from "../MeetLink";
import { Milestones, kindTone } from "../ClassCard";
import { ClassTabs, type ClassView } from "./ClassTabs";
import { requireUser } from "@/lib/auth";
import { canOpenActivity, getActivity, getClassroom, getUsersByIds, listActivities, listStaff, teachesActivity } from "@/lib/data";
import { classChat, classPosts } from "@/lib/data-communication";
import { isSupabase } from "@/lib/config";
import type { Person } from "./people";
import { plural } from "@/lib/format";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { initials } from "@/lib/roles";
import { currentOrNext, expeditionBlocker } from "@/lib/schedule";
import { describeWhen } from "@/lib/periods";
import { DAYS_SHORT, formatRange, isoWeekdayOf, pragueNow, toIso } from "@/lib/time";
import { STATE_CHIP, STATE_LABEL, isHandedIn, isOpen, isPublished, needsReview, workState } from "@/lib/assignments";
import { assignmentsForActivity, workMap } from "@/lib/data-assignments";
import { formatDue, formatStamp } from "@/lib/time";
import type { Activity, ActivityKind, User } from "@/lib/types";
import { signupBoards } from "@/lib/data-signups";
import { tripDays } from "@/lib/signups";
import { finalForActivity } from "@/lib/data-final";
import { statsInput } from "@/lib/data-stats";
import { FINAL_CHIP, FINAL_LABEL, isGradable } from "@/lib/final-reviews";
import { buildPairs, pct, schoolYearStart, summarize } from "@/lib/stats";
import type { FinalView } from "./FinalReviews";
import finalStyles from "./final.module.css";
import styles from "./classroom.module.css";

/** Detail třídy ve stylu Google Classroomu (návrh: design/Trida.dc.html). */
export async function ClassroomPage({
  id,
  kinds,
  back,
  tab,
}: {
  id: string;
  kinds: ActivityKind[];
  back: { href: string; label: string };
  /** Záložka, která se má otevřít (např. „work“ po návratu z úkolu) */
  tab?: string;
}) {
  const user = await requireUser();
  const activity = await getActivity(id);
  if (!activity || !canOpenActivity(user, activity)) notFound();
  // Stará adresa (např. událost pod /kurzy) → správná sekce.
  if (!kinds.includes(activity.kind)) redirect(activityHref(activity) + (tab ? `?tab=${tab}` : ""));

  const now = pragueNow();
  const stamp = new Date();
  const [content, posts, chat, staff] = await Promise.all([getClassroom(activity), classPosts(activity), classChat(activity), listStaff()]);
  const [teacher, ...coTeachers] = await getUsersByIds([activity.teacherId, ...(activity.coTeacherIds ?? [])]);
  const students = await getUsersByIds(activity.studentIds);
  const person = (u: User | undefined): Person =>
    u ? { id: u.id, name: u.name, initials: initials(u.name), role: u.role } : { id: "?", name: "Neznámý uživatel", initials: "?", role: "student" };
  // Kdo může ve třídě psát: studenti, vyučující a vedení školy.
  const people: Record<string, Person> = {};
  [...students, ...staff, user].forEach((u) => (people[u.id] = person(u)));
  const byId = (uid: string) => people[uid] ?? person(undefined);

  const isTeacher = teachesActivity(user, activity);
  const next = currentOrNext([activity], now, expeditionBlocker(await listActivities()));
  const feminine = teacher && /(ová|á)$/.test(teacher.name);
  const lectorWord = activity.kind === "atelier" ? (feminine ? "lektorce" : "lektorovi") : feminine ? "vyučující" : "vyučujícímu";

  const work = await classWork(activity, user, isTeacher, teacher?.name ?? "Vyučující");
  const gradable = isGradable(activity.kind);
  const final = gradable ? await finalForActivity(activity.id) : null;
  const finalView = gradable && isTeacher && final ? await buildFinalView(activity, students, final, stamp) : undefined;
  // Student vidí svoje hodnocení až po uzavření třídy (v Supabase to hlídá i RLS).
  const mine = final?.closure && !isTeacher ? (final.reviews.get(user.id) ?? null) : null;
  const mineBy = mine ? (await getUsersByIds([mine.reviewedBy]))[0] : undefined;

  // Nástěnka: příspěvky a nové úkoly/materiály podle času, nejnovější nahoře.
  const stream: ClassView["stream"] = [
    ...posts.map((p) => ({
      at: p.createdAt,
      item: {
        type: "post" as const,
        id: p.id,
        author: byId(p.authorId),
        when: formatStamp(p.createdAt, stamp),
        body: p.body,
        links: p.links,
        files: p.files,
        canDelete: isTeacher || p.authorId === user.id,
        comments: p.comments.map((c) => ({
          id: c.id,
          author: byId(c.authorId),
          body: c.body,
          when: formatStamp(c.createdAt, stamp),
          canDelete: isTeacher || c.authorId === user.id,
        })),
      },
    })),
    ...work.stream.map((e) => ({ at: e.at, item: e.item })),
  ]
    .sort((x, y) => y.at.localeCompare(x.at))
    .map((x) => x.item);

  const view: ClassView = {
    me: person(user),
    teacher: person(teacher),
    teacherLabel:
      activity.kind === "atelier"
        ? feminine
          ? "Lektorka ateliéru"
          : "Lektor ateliéru"
        : activity.kind === "kurz"
          ? "Vyučující kurzu"
          : activity.kind === "expedice"
            ? "Vede expedici"
            : "Vede událost",
    coTeachers: coTeachers.sort((a, b) => a.name.localeCompare(b.name, "cs")).map(person),
    stream,
    canManage: isTeacher,
    work: { topics: work.topics, newHref: isTeacher ? `/ukoly/novy?trida=${activity.id}` : null },

    students: students.map(person),
    chat: chat.map((m) => ({ ...m, when: formatStamp(m.createdAt, stamp) })),
    people,
    upcoming: [...content.upcoming, ...work.upcoming],
    next: next
      ? {
          label: next.live
            ? `Právě probíhá · ${formatRange(next.slot)}`
            : `${DAYS_SHORT[isoWeekdayOf(next.date) - 1]} ${next.date.d}. ${next.date.m}. · ${formatRange(next.slot)}`,
          live: next.live,
        }
      : null,
    location: activity.location,
    meetUrl: activity.meetUrl,
    canEditMeet: isTeacher,
    slug: activity.id,
    dbId: activity.dbId,
    live: isSupabase,
    kindLabel: activity.kind === "atelier" ? "ateliéru" : "kurzu",
    final: finalView,
    signups:
      activity.kind === "expedice"
        ? { boards: await signupBoards(activity), days: tripDays(activity.startsOn, activity.endsOn) }
        : undefined,
  };

  return (
    <>
      <Link href={back.href} className={styles.back}>
        <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
        {back.label}
      </Link>

      <section className={styles.hero} data-tone={kindTone(activity)}>
        <div aria-hidden="true" className={`${styles.blob} ${styles.blob1}`} />
        <div aria-hidden="true" className={`${styles.blob} ${styles.blob2}`} />
        <div className={styles.heroText}>
          <div className={styles.heroMeta}>
            {[KIND_LABEL[activity.kind], describeWhen(activity), activity.location, activity.period?.name].filter(Boolean).join(" · ")}
          </div>
          <h1 className={styles.heroTitle}>{activity.title}</h1>
          <div className={styles.heroSub}>
            {teacher?.name} · {students.length} {plural(students.length, "student", "studenti", "studentů")}
          </div>
        </div>
        <div className={styles.heroActions}>
          {!isTeacher && (
            <Link href={`/zpravy?s=${activity.teacherId}`} className={`btn ${styles.heroBtn}`}>
              <Icon name="chat" size={18} />
              Napsat {lectorWord}
            </Link>
          )}
          {isTeacher && (
            <Link href={`/ucitel/${activity.id}`} className={`btn ${styles.heroBtn}`}>
              Upravit a studenti
            </Link>
          )}
          <MeetLink
            url={activity.meetUrl}
            variant="white"
            label={isTeacher ? "Zahájit Meet" : "Připojit se přes Meet"}
          />
        </div>
      </section>

      {mine && (
        <section
          aria-label="Závěrečné hodnocení"
          className={`card ${finalStyles.mine}`}
          data-result={mine.result}
        >
          <div className={finalStyles.mineHead}>
            <h2 className={finalStyles.mineTitle}>Závěrečné hodnocení</h2>
            <span className={`chip ${FINAL_CHIP[mine.result]}`}>{FINAL_LABEL[mine.result]}</span>
          </div>
          {mine.feedback && <p className={finalStyles.mineText}>{mine.feedback}</p>}
          <span className={finalStyles.mineMeta}>
            {mineBy ? `${mineBy.name} · ` : ""}
            {formatStamp(mine.reviewedAt, stamp)}
          </span>
        </section>
      )}

      {activity.project && (
        <section aria-label="Projekt ateliéru" className={`card ${styles.project}`}>
          <Milestones
            label={activity.project.name ? `Projekt: ${activity.project.name}` : "Milníky ateliéru"}
            done={activity.project.milestonesDone}
            total={activity.project.milestonesTotal}
            tone={kindTone(activity)}
          />
        </section>
      )}

      <ClassTabs view={view} initialTab={tab} />
    </>
  );
}

/** Úkoly a materiály třídy pro záložku, nástěnku a „Nadcházející“. */
async function classWork(activity: Activity, user: User, isTeacher: boolean, teacherName: string) {
  // Naplánované úkoly vidí jen vyučující (naostro je studentům schová i RLS).
  const list = (await assignmentsForActivity(activity)).filter((a) => isTeacher || isPublished(a));
  const tasks = list.filter((a) => a.kind === "ukol");
  const works = await workMap(
    tasks.map((a) => a.id),
    isTeacher ? activity.studentIds : [user.id],
  );

  const items = list.map((a) => {
    const base = {
      id: a.id,
      kind: a.kind,
      title: a.title,
      meta:
        a.kind === "material"
          ? "Materiál"
          : ["Úkol", a.dueAt ? `termín ${formatDue(a.dueAt)}` : "bez termínu", a.maxPoints ? `${a.maxPoints} b.` : null].filter(Boolean).join(" · "),
    };
    if (a.kind === "material") return { ...base, chip: "Materiál", chipClass: "chip-info", open: false };
    if (isTeacher && !isPublished(a)) {
      return { ...base, chip: `Naplánováno na ${formatDue(a.publishAt!)}`, chipClass: "chip-info", open: false };
    }
    if (isTeacher) {
      const states = activity.studentIds.map((sid) => workState(a, works.get(`${a.id}:${sid}`) ?? null));
      const toReview = states.filter(needsReview).length;
      const done = states.filter(isHandedIn).length;
      return {
        ...base,
        chip: toReview > 0 ? `${toReview} k opravení` : `odevzdalo ${done} z ${states.length}`,
        chipClass: toReview > 0 ? "chip-primary" : "chip-info",
        open: true,
      };
    }
    const state = workState(a, works.get(`${a.id}:${user.id}`) ?? null);
    return { ...base, chip: STATE_LABEL[state], chipClass: STATE_CHIP[state], open: isOpen(state) };
  });

  // Seskupení podle témat; úkoly bez tématu na konec.
  const groups = new Map<string, typeof items>();
  for (const a of list) {
    const key = a.topic ?? "";
    groups.set(key, [...(groups.get(key) ?? []), items.find((i) => i.id === a.id)!]);
  }
  const topics = [...groups.entries()]
    .sort(([x], [y]) => (x === "" ? 1 : y === "" ? -1 : 0))
    .map(([name, its]) => ({ name: name || (groups.size > 1 ? "Ostatní" : "Úkoly a materiály"), items: its }));

  const now = Date.now();
  const upcoming = tasks
    .filter((a) => a.dueAt && new Date(a.dueAt).getTime() > now)
    .filter((a) => isTeacher || items.find((i) => i.id === a.id)?.open)
    .sort((x, y) => x.dueAt!.localeCompare(y.dueAt!))
    .slice(0, 4)
    .map((a) => ({
      title: a.title,
      when: formatDue(a.dueAt!),
      urgent: new Date(a.dueAt!).getTime() - now < 48 * 3600 * 1000,
      href: `/ukoly/${a.id}`,
    }));

  const stream = [...list]
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
    .slice(0, 10)
    .map((a) => ({
      at: a.createdAt,
      item: {
        type: a.kind === "ukol" ? ("task" as const) : ("material" as const),
        id: `zadani-${a.id}`,
        title: a.kind === "ukol" ? `${teacherName} zadal(a) nový úkol: ${a.title}` : `Nový materiál: ${a.title}`,
        meta: [
          isPublished(a) ? formatStamp(a.createdAt) : `naplánováno na ${formatDue(a.publishAt!)} (studenti zatím nevidí)`,
          a.dueAt ? `termín ${formatDue(a.dueAt)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/ukoly/${a.id}`,
      },
    }));

  return { topics, upcoming, stream };
}

/** Podklady pro záložku Závěrečné hodnocení: studenti, jejich hodnocení a přehled úkolů v této třídě. */
async function buildFinalView(
  activity: Activity,
  students: User[],
  final: Awaited<ReturnType<typeof finalForActivity>>,
  stamp: Date,
): Promise<FinalView> {
  const input = await statsInput().catch(() => null);
  const pairs = input ? buildPairs(input, schoolYearStart(input.now)).filter((p) => p.assignment.activityId === activity.id) : [];
  const reviewers = await getUsersByIds([...new Set([...final.reviews.values()].map((r) => r.reviewedBy))]);
  const nameOf = (id: string) => reviewers.find((u) => u.id === id)?.name ?? "";
  const today = toIso(pragueNow());
  const end = activity.endsOn ?? activity.period?.endsOn ?? null;
  return {
    closed: final.closure ? formatStamp(final.closure.closedAt, stamp) : null,
    ended: !!end && end < today,
    rows: [...students]
      .sort((a, b) => a.name.localeCompare(b.name, "cs"))
      .map((s) => {
        const r = final.reviews.get(s.id);
        const sm = summarize(pairs.filter((p) => p.studentId === s.id));
        return {
          student: { id: s.id, name: s.name, initials: initials(s.name), role: s.role },
          result: r?.result ?? null,
          feedback: r?.feedback ?? "",
          stamp: r ? `${nameOf(r.reviewedBy)} · ${formatStamp(r.reviewedAt, stamp)}` : null,
          tasks: sm.due > 0 ? { handed: sm.handed, due: sm.due, onTime: pct(sm.onTimeRate), points: pct(sm.pointsPct), missing: sm.missing } : null,
        };
      }),
  };
}
