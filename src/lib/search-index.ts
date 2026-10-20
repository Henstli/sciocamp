// Co se dá na Domově vyhledat — sestaví se na serveru pro přihlášeného.

import "server-only";
import { isTeacherOf, listActivities, listUsers } from "./data";
import { assignmentsForUser } from "./data-assignments";
import { listProposals, listWishes } from "./data-proposals";
import { KIND_LABEL as ACTIVITY_KIND, activityHref } from "./links";
import { describeWhen, hasEnded, hasStarted } from "./periods";
import { WISH_KIND_LABEL, proposalChip } from "./proposals";
import { canTeach, isAdmin, roleCaption } from "./roles";
import type { SearchItem } from "./search";
import { formatDue, todayIso } from "./time";
import type { User } from "./types";

export async function buildSearchIndex(user: User): Promise<SearchItem[]> {
  const today = todayIso();
  const [activities, users, assignments, proposals, wishes] = await Promise.all([
    listActivities(),
    listUsers(),
    assignmentsForUser(user),
    listProposals(user),
    listWishes(user),
  ]);

  // Aktivity: jen ty, které právě probíhají a člověk v nich je (učí nebo je zapsaný). Admin vidí všechny probíhající.
  const running = activities.filter(
    (a) =>
      hasStarted(a, today) &&
      !hasEnded(a, today) &&
      (isAdmin(user.role) || isTeacherOf(a, user.id) || a.studentIds.includes(user.id)),
  );
  const runningIds = new Set(running.map((a) => a.id));
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "";

  const items: SearchItem[] = [];
  for (const a of running) {
    items.push({
      kind: "activity",
      title: a.title,
      sub: `${ACTIVITY_KIND[a.kind]} · ${describeWhen(a)}`,
      href: activityHref(a),
      keywords: [nameOf(a.teacherId), ...(a.coTeacherIds ?? []).map(nameOf), a.description ?? ""].join(" "),
      tone: a.kind,
    });
  }

  // Úkoly a materiály z probíhajících aktivit.
  for (const t of assignments.filter((x) => runningIds.has(x.activityId))) {
    const what = t.kind === "material" ? "Materiál" : "Úkol";
    items.push({
      kind: "assignment",
      title: t.title,
      sub: `${what} · ${t.activityTitle}${t.dueAt ? ` · do ${formatDue(t.dueAt)}` : ""}`,
      href: `/ukoly/${t.id}`,
      keywords: t.topic ?? "",
    });
  }

  for (const u of users) {
    if (u.id === user.id) continue;
    items.push({
      kind: "person",
      title: u.name,
      sub: u.role === "student" ? u.group : roleCaption(u),
      href: `/lide/${u.id}`,
      keywords: u.email,
      userId: u.id,
    });
  }

  for (const p of proposals) {
    items.push({ kind: "proposal", title: p.title, sub: `Návrh · ${proposalChip(p, users.length).label}`, href: `/navrhy/${p.id}`, keywords: p.body });
  }
  for (const w of wishes) {
    const state = w.status === "open" ? `${w.voteCount} chce` : w.status === "vypsano" ? "schváleno" : "uzavřeno";
    items.push({ kind: "wish", title: w.title, sub: `Přání · ${WISH_KIND_LABEL[w.kind]} · ${state}`, href: `/hlasovani#prani-${w.id}`, keywords: w.body });
  }

  // Stránky aplikace (rychlý skok); klíčová slova pro běžné dotazy.
  const pages: [string, string, string][] = [
    ["Domov", "/", "rozvrh prehled"],
    ["Zápisy", "/zapisy", "zapis prihlaseni kurzy ateliery cekaci rada"],
    ["Úkoly", "/ukoly", "odevzdani hodnoceni body"],
    ["Hlasování", "/hlasovani", "prani chci to"],
    ["Zprávy", "/zpravy", "chat konverzace napsat"],
    ["Kurzy", "/kurzy", ""],
    ["Ateliéry", "/ateliery", ""],
    ["Události", "/udalosti", "konzultace seminar"],
    ["Expedice", "/expedice", "vylet vyjezd"],
    ["Návrhy", "/navrhy", "shromazdeni hlasovani"],
    ["Profil", "/profil", "muj profil"],
    ["Nastavení", "/nastaveni", "fotka telefon instagram barva o mne"],
  ];
  if (canTeach(user.role)) pages.push(["Moje třídy", "/ucitel", "vyuka nova aktivita"]);
  if (isAdmin(user.role)) pages.push(["Uživatelé a škola", "/admin", "sprava pozvanka kurzova obdobi terminy"]);
  for (const [title, href, keywords] of pages) items.push({ kind: "page", title, sub: "Stránka", href, keywords });

  return items;
}
