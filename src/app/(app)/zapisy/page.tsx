import type { Metadata } from "next";
import { EnrollBoard, type EnrollItem } from "./EnrollBoard";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { getUsersByIds, listActivities } from "@/lib/data";
import { enrollmentOverview } from "@/lib/data-enroll";
import { ENROLL_KINDS, clashWith, enrollWindow } from "@/lib/enroll";
import { activityHref } from "@/lib/links";
import { activityRange, describeWhen, hasEnded, hasStarted } from "@/lib/periods";
import { canTeach, initials } from "@/lib/roles";
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
      <EnrollBoard items={items} student={student} serverNow={now} initialTab={typeof tab === "string" ? tab : undefined} />
    </>
  );
}
