import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { STATE_CHIP, STATE_LABEL, isOpen, isPublished } from "@/lib/assignments";
import { requireUser } from "@/lib/auth";
import { tasksForStudent, tasksForTeacher } from "@/lib/data-assignments";
import { plural } from "@/lib/format";
import { KIND_LABEL } from "@/lib/links";
import { canTeach, initials } from "@/lib/roles";
import { formatDue, formatShortDate } from "@/lib/time";
import { TaskList, type TaskRow } from "./TaskList";

export const metadata: Metadata = { title: "Úkoly" };

export default async function TasksPage() {
  const user = await requireUser();
  const teaching = canTeach(user.role);
  const avatar = { initials: initials(user.name), name: user.name };

  if (teaching) {
    const tasks = await tasksForTeacher(user);
    const toReview = tasks.reduce((n, t) => n + t.toReview, 0);
    const rows: TaskRow[] = tasks.map(({ assignment: a, students, submitted, toReview }) => ({
      id: a.id,
      title: a.title,
      course: `${KIND_LABEL[a.activityKind]} ${a.activityTitle}`,
      meta:
        a.kind === "material"
          ? "Materiál"
          : a.dueAt
            ? `termín ${formatDue(a.dueAt)}`
            : "bez termínu",
      group: a.kind === "material" ? "material" : toReview > 0 ? "opravit" : "ukol",
      tone: !isPublished(a) ? "info" : a.kind === "material" ? "info" : toReview > 0 ? "primary" : submitted === students && students > 0 ? "ok" : "wait",
      chip: !isPublished(a)
        ? `Naplánováno na ${formatDue(a.publishAt!)}`
        : a.kind === "material"
          ? "Materiál"
          : toReview > 0
            ? `${toReview} k opravení`
            : `odevzdalo ${submitted} z ${students}`,
      action: toReview > 0 ? "Opravit" : "Otevřít",
      primary: toReview > 0,
    }));
    return (
      <>
        <PageHeader
          title="Úkoly"
          subtitle={
            tasks.length === 0
              ? "Pohled učitele: zadávání a kontrola úkolů"
              : `${toReview} ${plural(toReview, "práce čeká", "práce čekají", "prací čeká")} na hodnocení`
          }
          avatar={avatar}
        >
          <Link href="/ukoly/novy" className="btn btn-primary">
            <Icon name="plus" size={16} strokeWidth={2.8} />
            Zadat úkol
          </Link>
        </PageHeader>
        <TaskList
          rows={rows}
          filters={[
            { key: "vse", label: "Vše" },
            { key: "opravit", label: "K opravení", dot: "#3B6FE0" },
            { key: "ukol", label: "Ostatní úkoly", dot: "#F0A63A" },
            { key: "material", label: "Materiály", dot: "#8A94AD" },
          ]}
          empty="Zatím jsi nezadal žádný úkol. Úkol zadáš tlačítkem Zadat úkol nebo v detailu třídy."
        />
      </>
    );
  }

  // Nahoře to, co je potřeba udělat (podle termínu), dole hotové (nejnovější první).
  const tasks = (await tasksForStudent(user)).sort((x, y) => {
    const xo = isOpen(x.state) ? 0 : 1;
    const yo = isOpen(y.state) ? 0 : 1;
    if (xo !== yo) return xo - yo;
    const xd = x.assignment.dueAt ?? "9999";
    const yd = y.assignment.dueAt ?? "9999";
    return xo === 0 ? xd.localeCompare(yd) : yd.localeCompare(xd);
  });
  const open = tasks.filter((t) => isOpen(t.state)).length;
  const late = tasks.filter((t) => t.state === "pozde").length;
  const rows: TaskRow[] = tasks.map(({ assignment: a, state, work }) => {
    const sub = work?.submission;
    const meta =
      state === "splneno" || state === "nesplneno" || state === "odevzdano"
        ? sub?.submittedAt
          ? `odevzdáno ${formatShortDate(sub.submittedAt)}`
          : "ohodnoceno"
        : state === "vraceno" && work?.review
          ? `vráceno ${formatShortDate(work.review.reviewedAt)}`
          : a.dueAt
            ? formatDue(a.dueAt)
            : "bez termínu";
    const group = state === "pozde" ? "pozde" : isOpen(state) ? "ceka" : "hotovo";
    const points =
      work?.review?.points !== null && work?.review?.points !== undefined && a.maxPoints ? ` · ${work.review.points}/${a.maxPoints} b.` : "";
    return {
      id: a.id,
      title: a.title,
      course: `${KIND_LABEL[a.activityKind]} ${a.activityTitle}`,
      meta,
      group,
      tone: STATE_CHIP[state].replace("chip-", "") as TaskRow["tone"],
      chip: STATE_LABEL[state] + points,
      action: state === "ceka" ? "Odevzdat" : state === "pozde" ? "Odevzdat pozdě" : state === "vraceno" ? "Doplnit" : "Zobrazit",
      primary: state === "ceka" || state === "vraceno",
      danger: state === "pozde",
    };
  });

  return (
    <>
      <PageHeader
        title="Úkoly"
        subtitle={tasks.length === 0 ? "Zatím žádné úkoly" : `${open} ${plural(open, "otevřený", "otevřené", "otevřených")} · ${late} po termínu`}
        avatar={avatar}
      />
      <TaskList
        rows={rows}
        filters={[
          { key: "vse", label: "Vše" },
          { key: "ceka", label: "Čeká", dot: "#F0A63A" },
          { key: "pozde", label: "Po termínu", dot: "#C93B3B" },
          { key: "hotovo", label: "Hotovo", dot: "#1F8A5B" },
        ]}
        empty="Zatím ti nikdo nezadal žádný úkol."
      />
    </>
  );
}
