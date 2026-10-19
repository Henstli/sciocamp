import type { Metadata } from "next";
import { EnrollBoard, type EnrollItem } from "./EnrollBoard";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { getUsersByIds, listActivities, listPeriods, listTerms } from "@/lib/data";
import { enrollmentOverview, openRounds } from "@/lib/data-enroll";
import type { AnnouncePanelData } from "./AnnouncePanel";
import { ENROLL_KINDS, clashWith, enrollWindow } from "@/lib/enroll";
import { activityHref } from "@/lib/links";
import { activityRange, describeWhen, hasEnded, hasStarted } from "@/lib/periods";
import { canTeach, initials, isAdmin } from "@/lib/roles";
import { isTeacherOf } from "@/lib/data";
import { nowMs, pragueNow, toIso } from "@/lib/time";

export const metadata: Metadata = { title: "Zápisy" };

export default async function EnrollPage({ searchParams }: PageProps<"/zapisy">) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const now = nowMs();
  const today = toIso(pragueNow(new Date(now)));
  const all = await listActivities();
  const overview = await enrollmentOverview(user);
  const student = user.role === "student";

  // V nabídce je, co má vyhlášený zápis a ještě neproběhlo. Po skončení zápisu
  // zůstane vidět, dokud aktivita nezačne (aby student viděl, kam se dostal).
  const offer = all.filter((a) => {
    if (!ENROLL_KINDS.includes(a.kind) || hasEnded(a, today)) return false;
    const w = enrollWindow(a);
    if (!w) return false;
    return Date.parse(w.closes) > now || !hasStarted(a, today);
  });
  const mine = all.filter((a) => a.studentIds.includes(user.id));
  const teachers = await getUsersByIds([...new Set(offer.map((a) => a.teacherId))]);
  const terms = await listTerms();

  const items: EnrollItem[] = offer.map((a) => {
    const info = overview.get(a.id) ?? { enrolled: a.studentIds.length, waiting: 0, myPosition: null };
    const t = teachers.find((u) => u.id === a.teacherId);
    const enrolled = a.studentIds.includes(user.id);
    const gradeOk = !a.allowedGrades || (user.grade !== null && a.allowedGrades.includes(user.grade));
    const range = activityRange(a);
    return {
      slug: a.id,
      kind: a.kind as EnrollItem["kind"],
      title: a.title,
      description: a.description ?? null,
      when: describeWhen(a),
      location: a.location,
      startsOn: range.from,
      endsOn: range.to,
      slots: a.slots,
      period: a.period,
      term: a.termId ? (terms.find((t) => t.id === a.termId)?.name ?? null) : null,
      teacher: t ? { id: t.id, name: t.name, initials: initials(t.name) } : null,
      enrolled,
      taken: info.enrolled,
      capacity: a.capacity ?? null,
      waiting: info.waiting,
      myPosition: info.myPosition,
      window: enrollWindow(a)!,
      group: a.kind === "kurz" && a.period ? { id: a.period.id, name: a.period.name } : null,
      clash: student && !enrolled ? clashWith(a, mine) : null,
      gradeNote: gradeOk ? null : `Jen pro ${a.allowedGrades!.map((g) => `${g}.`).join(", ")} ročník`,
      href: enrolled || canTeach(user.role) ? activityHref(a) : null,
    };
  });

  // Učitelé: vyhlášení zápisu do ateliérů a na expedice (hromadně, jedním termínem).
  let panels: Record<"atelier" | "expedice", AnnouncePanelData> | null = null;
  if (canTeach(user.role)) {
    const rounds = await openRounds();
    // Zápis kurzů, který ještě neskončil (nabídne se jako termín pro ateliéry a expedice).
    const coursePeriod = (await listPeriods())
      .filter((p) => p.publishedAt && p.enrollOpensAt && p.enrollClosesAt && Date.parse(p.enrollClosesAt) > now)
      .sort((a, b) => a.enrollOpensAt!.localeCompare(b.enrollOpensAt!))[0];
    const courseWindow = coursePeriod
      ? { name: coursePeriod.name, opensAt: coursePeriod.enrollOpensAt!, closesAt: coursePeriod.enrollClosesAt! }
      : null;
    const staff = await getUsersByIds([...new Set(all.map((a) => a.teacherId))]);
    const nameOf = (id: string) => staff.find((u) => u.id === id)?.name ?? "";
    const build = (kind: "atelier" | "expedice"): AnnouncePanelData => {
      const round = rounds.find((r) => r.kind === kind) ?? null;
      const pool = all.filter((a) => a.kind === kind && !hasEnded(a, today) && !(a.round && Date.parse(a.round.closesAt) > now));
      const item = (a: (typeof all)[number]) => ({
        slug: a.id,
        title: a.title,
        teacher: nameOf(a.teacherId),
        when: describeWhen(a),
        mine: isTeacherOf(a, user.id) || isAdmin(user.role),
      });
      return {
        kind,
        round: round
          ? {
              id: round.id,
              opensAt: round.opensAt,
              closesAt: round.closesAt,
              editable: isAdmin(user.role) || round.createdBy === user.id,
            }
          : null,
        ready: pool.filter((a) => a.announceReady).map(item),
        drafts: pool.filter((a) => !a.announceReady && a.published === false).map(item),
        courseWindow,
      };
    };
    panels = { atelier: build("atelier"), expedice: build("expedice") };
  }

  return (
    <>
      <PageHeader
        title="Zápisy"
        subtitle={
          student
            ? "Nabídka kurzů, ateliérů a expedic. Zapsat se můžeš, když zápis běží."
            : "Nabídka, do které se studenti zapisují. Obsazenost se ukazuje průběžně."
        }
        avatar={{ initials: initials(user.name), name: user.name }}
      />
      <EnrollBoard
        items={items}
        student={student}
        serverNow={now}
        initialTab={typeof tab === "string" ? tab : undefined}
        panels={panels}
      />
    </>
  );
}
