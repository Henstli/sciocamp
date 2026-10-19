// Data pro úkoly, odevzdání a hodnocení (etapa 2). Stejně jako data.ts:
// naostro čte ze Supabase jako přihlášený uživatel (RLS), jinak ukázková data.

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import { getActivity, isTeacherOf, listActivities } from "./data";
import { DEMO_ASSIGNMENTS, DEMO_COMMENTS, DEMO_WORK } from "./demo-assignments";
import { isHandedIn, needsReview, workState } from "./assignments";
import { canTeach } from "./roles";
import { createClient } from "./supabase/server";
import type { Activity, Assignment, Comment, LinkItem, Review, Submission, SubmissionFile, User, Work, WorkState } from "./types";

export const SUBMISSION_BUCKET = "odevzdani";
export const MATERIAL_BUCKET = "materialy";

type AssignmentRow = {
  id: string;
  kind: Assignment["kind"];
  title: string;
  instructions: string;
  topic: string | null;
  due_at: string | null;
  max_points: number | null;
  links: LinkItem[];
  created_at: string;
  team_work: boolean;
  team_mode: "teacher" | "students";
  team_max_size: number | null;
  activities: { slug: string; title: string; kind: Activity["kind"]; teacher_id: string };
};

const ASSIGNMENT_COLUMNS =
  "id, kind, title, instructions, topic, due_at, max_points, links, created_at, team_work, team_mode, team_max_size, activity_id, activities!inner(slug, title, kind, teacher_id)";

function toAssignment(r: AssignmentRow): Assignment {
  return {
    id: r.id,
    activityId: r.activities.slug,
    activityTitle: r.activities.title,
    activityKind: r.activities.kind,
    kind: r.kind,
    title: r.title,
    instructions: r.instructions,
    topic: r.topic,
    dueAt: r.due_at ? new Date(r.due_at).toISOString() : null,
    maxPoints: r.max_points,
    links: Array.isArray(r.links) ? r.links : [],
    createdAt: r.created_at,
    teamWork: r.team_work,
    teamMode: r.team_mode,
    teamMaxSize: r.team_max_size,
  };
}

async function demoAssignments(): Promise<Assignment[]> {
  const activities = await listActivities();
  return DEMO_ASSIGNMENTS.flatMap((a) => {
    const act = activities.find((x) => x.id === a.activityId);
    return act ? [{ ...a, activityTitle: act.title, activityKind: act.kind }] : [];
  });
}

/** Řazení: nejbližší termín nahoře, bez termínu a materiály na konci, pak nejnovější. */
function byDue(a: Assignment, b: Assignment) {
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

// ---------------------------------------------------------------------------
// Úkoly
// ---------------------------------------------------------------------------

export async function assignmentsForActivity(activity: Activity): Promise<Assignment[]> {
  if (!isSupabase) return (await demoAssignments()).filter((a) => a.activityId === activity.id).sort(byDue);
  const sb = await createClient();
  const { data, error } = await sb
    .from("assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("activities.slug", activity.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Nepodařilo se načíst úkoly: ${error.message}`);
  return (data as unknown as AssignmentRow[]).map(toAssignment).sort(byDue);
}

/** Student: úkoly ze všech jeho tříd. Vyučující: úkoly ze tříd, které učí. */
async function assignmentsForUserUncached(user: User): Promise<Assignment[]> {
  const teaching = canTeach(user.role);
  if (!isSupabase) {
    const activities = await listActivities();
    const mine = new Set(
      activities.filter((a) => (teaching ? isTeacherOf(a, user.id) : a.studentIds.includes(user.id))).map((a) => a.id),
    );
    return (await demoAssignments()).filter((a) => mine.has(a.activityId)).sort(byDue);
  }
  const sb = await createClient();
  let q = sb.from("assignments").select(ASSIGNMENT_COLUMNS);
  if (teaching) {
    // Hlavní vyučující i spoluvyučující (expedice, sdílené kurzy).
    const taught = (await listActivities()).filter((a) => isTeacherOf(a, user.id) && a.dbId).map((a) => a.dbId!);
    if (taught.length === 0) return [];
    q = q.in("activity_id", taught);
  }
  const { data, error } = await q;
  if (error) throw new Error(`Nepodařilo se načíst úkoly: ${error.message}`);
  let rows = (data as unknown as AssignmentRow[]).map(toAssignment);
  if (!teaching) {
    // RLS pustí studentovi jen úkoly jeho tříd; pro jistotu ještě podle zápisů.
    const enrolled = new Set((await listActivities()).filter((a) => a.studentIds.includes(user.id)).map((a) => a.id));
    rows = rows.filter((a) => enrolled.has(a.activityId));
  }
  return rows.sort(byDue);
}

async function getAssignmentUncached(id: string): Promise<Assignment | null> {
  if (!isSupabase) return (await demoAssignments()).find((a) => a.id === id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await createClient();
  const { data, error } = await sb.from("assignments").select(ASSIGNMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Nepodařilo se načíst úkol: ${error.message}`);
  return data ? toAssignment(data as unknown as AssignmentRow) : null;
}

export async function getAssignmentActivity(a: Assignment): Promise<Activity | null> {
  return getActivity(a.activityId);
}

// ---------------------------------------------------------------------------
// Práce studentů
// ---------------------------------------------------------------------------

type SubmissionRow = {
  assignment_id: string;
  student_id: string;
  status: Submission["status"];
  links: LinkItem[];
  note: string | null;
  submitted_at: string | null;
};
type ReviewRow = {
  assignment_id: string;
  student_id: string;
  result: Review["result"];
  points: number | null;
  feedback: string | null;
  request: string | null;
  reviewed_at: string;
  individual?: boolean;
};

function toSubmission(r: SubmissionRow, files: SubmissionFile[] = []): Submission {
  return {
    status: r.status,
    links: Array.isArray(r.links) ? r.links : [],
    note: r.note,
    submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
    files,
  };
}
function toReview(r: ReviewRow): Review {
  return {
    result: r.result,
    points: r.points,
    feedback: r.feedback,
    request: r.request,
    reviewedAt: new Date(r.reviewed_at).toISOString(),
    individual: r.individual,
  };
}

/**
 * Práce zadaných studentů u zadaných úkolů. Klíč „idÚkolu:idStudenta“.
 * Bez souborů — ty se načítají jen v detailu (getWork).
 */
export async function workMap(assignmentIds: string[], studentIds?: string[]): Promise<Map<string, Work>> {
  const map = new Map<string, Work>();
  if (assignmentIds.length === 0) return map;
  if (!isSupabase) {
    for (const [key, w] of Object.entries(DEMO_WORK)) {
      const [aid, sid] = key.split(":");
      if (assignmentIds.includes(aid) && (!studentIds || studentIds.includes(sid))) map.set(key, w);
    }
    return map;
  }
  const sb = await createClient();
  let sq = sb.from("submissions").select("assignment_id, student_id, status, links, note, submitted_at").in("assignment_id", assignmentIds);
  let rq = sb.from("reviews").select("assignment_id, student_id, result, points, feedback, request, reviewed_at, individual").in("assignment_id", assignmentIds);
  if (studentIds) {
    sq = sq.in("student_id", studentIds);
    rq = rq.in("student_id", studentIds);
  }
  const [subs, revs] = await Promise.all([sq, rq]);
  if (subs.error || revs.error) throw new Error("Nepodařilo se načíst odevzdané práce.");
  for (const s of subs.data as SubmissionRow[]) {
    map.set(`${s.assignment_id}:${s.student_id}`, { submission: toSubmission(s), review: null });
  }
  for (const r of revs.data as ReviewRow[]) {
    const key = `${r.assignment_id}:${r.student_id}`;
    map.set(key, { submission: map.get(key)?.submission ?? null, review: toReview(r) });
  }
  return map;
}

/** Práce jednoho studenta včetně souborů s dočasnými odkazy ke stažení. */
/**
 * Práce studenta včetně souborů. U týmového úkolu (`teamId`) jsou soubory
 * ve společné složce týmu (plus případně starší ve vlastní složce studenta).
 */
export async function getWork(assignmentId: string, studentId: string, teamId?: string | null): Promise<Work> {
  // Záznam a soubory naráz (každé volání je cesta do databáze / úložiště).
  const [map, teamFiles, ownFiles] = await Promise.all([
    workMap([assignmentId], [studentId]),
    isSupabase && teamId ? listFiles(assignmentId, teamId) : Promise.resolve([]),
    isSupabase ? listFiles(assignmentId, studentId) : Promise.resolve([]),
  ]);
  const base = map.get(`${assignmentId}:${studentId}`) ?? { submission: null, review: null };
  if (!isSupabase) return base;
  const files = [...teamFiles, ...ownFiles];
  if (!base.submission && files.length === 0) return base;
  return {
    review: base.review,
    submission: {
      ...(base.submission ?? { status: "rozpracovano", links: [], note: null, submittedAt: null }),
      files,
    },
  };
}

async function listFiles(assignmentId: string, folder: string): Promise<SubmissionFile[]> {
  return signedList(SUBMISSION_BUCKET, `${assignmentId}/${folder}`);
}

/** Soubory, které k úkolu nebo materiálu přiložil vyučující. */
async function assignmentFilesUncached(assignmentId: string): Promise<SubmissionFile[]> {
  if (!isSupabase) return [];
  return signedList(MATERIAL_BUCKET, assignmentId);
}

async function signedList(bucket: string, prefix: string): Promise<SubmissionFile[]> {
  const sb = await createClient();
  const { data, error } = await sb.storage.from(bucket).list(prefix, { sortBy: { column: "created_at", order: "asc" } });
  if (error || !data?.length) return [];
  const files = data.filter((f) => f.id);
  if (files.length === 0) return [];
  const paths = files.map((f) => `${prefix}/${f.name}`);
  const { data: signed } = await sb.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  return files.map((f, i) => ({
    path: paths[i],
    // Uložené jako „<čas>-<název>“ — čas na začátku jen zajišťuje jedinečnost.
    name: f.name.replace(/^\d{10,}-/, ""),
    size: (f.metadata as { size?: number } | null)?.size ?? null,
    url: signed?.[i]?.signedUrl ?? undefined,
  }));
}

export async function getComments(assignmentId: string, studentId: string): Promise<Comment[]> {
  if (!isSupabase) return DEMO_COMMENTS[`${assignmentId}:${studentId}`] ?? [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("assignment_comments")
    .select("id, author_id, body, created_at")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .order("created_at");
  if (error) return [];
  return data.map((c) => ({ id: c.id, authorId: c.author_id, body: c.body, createdAt: c.created_at }));
}

/** Počet soukromých komentářů podle studentů (pro přehled vyučujícího). */
export async function commentCounts(assignmentId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!isSupabase) {
    for (const [key, list] of Object.entries(DEMO_COMMENTS)) {
      const [aid, sid] = key.split(":");
      if (aid === assignmentId) map.set(sid, list.length);
    }
    return map;
  }
  const sb = await createClient();
  const { data } = await sb.from("assignment_comments").select("student_id").eq("assignment_id", assignmentId);
  for (const r of data ?? []) map.set(r.student_id, (map.get(r.student_id) ?? 0) + 1);
  return map;
}

// ---------------------------------------------------------------------------
// Souhrny pro seznam úkolů, Domov a menu
// ---------------------------------------------------------------------------

export type StudentTask = { assignment: Assignment; state: WorkState; work: Work | null };

/** Úkoly (bez materiálů) ze všech tříd studenta se stavem jeho práce. */
async function tasksForStudentUncached(user: User): Promise<StudentTask[]> {
  const tasks = (await assignmentsForUser(user)).filter((a) => a.kind === "ukol");
  const works = await workMap(
    tasks.map((a) => a.id),
    [user.id],
  );
  const now = Date.now();
  return tasks.map((a) => {
    const work = works.get(`${a.id}:${user.id}`) ?? null;
    return { assignment: a, work, state: workState(a, work, now) };
  });
}

export type TeacherTask = {
  assignment: Assignment;
  /** Zapsaných studentů ve třídě */
  students: number;
  /** Odevzdalo (včetně ohodnocených) */
  submitted: number;
  /** Čeká na hodnocení */
  toReview: number;
};

/** Úkoly a materiály ze tříd, které vyučující učí, s počty odevzdaných a neohodnocených prací. */
async function tasksForTeacherUncached(user: User): Promise<TeacherTask[]> {
  const list = await assignmentsForUser(user);
  if (list.length === 0) return [];
  const activities = await listActivities();
  const works = await workMap(list.filter((a) => a.kind === "ukol").map((a) => a.id));
  const now = Date.now();
  return list.map((a) => {
    const studentIds = activities.find((x) => x.id === a.activityId)?.studentIds ?? [];
    let submitted = 0;
    let toReview = 0;
    if (a.kind === "ukol") {
      for (const sid of studentIds) {
        const work = works.get(`${a.id}:${sid}`) ?? null;
        const state = workState(a, work, now);
        if (isHandedIn(state)) submitted++;
        if (needsReview(state)) toReview++;
      }
    }
    return { assignment: a, students: studentIds.length, submitted, toReview };
  });
}

export type HomeTasks = {
  /** Student: otevřené (čeká, po termínu, vráceno). Vyučující: prací k opravení. */
  headline: number;
  done: number;
  waiting: number;
  late: number;
  /** Vyučující: v kolika úkolech jsou práce k opravení */
  assignmentsToReview: number;
  deadlines: { id: string; title: string; meta: string; dueAt: string; urgent: boolean }[];
};

/** Souhrn úkolů pro Domov a odznaky v menu. */
async function homeTasksUncached(user: User): Promise<HomeTasks> {
  const now = Date.now();
  const soon = (iso: string) => new Date(iso).getTime() - now < 48 * 3600 * 1000;
  if (canTeach(user.role)) {
    const list = await tasksForTeacher(user);
    const toReview = list.reduce((n, t) => n + t.toReview, 0);
    const deadlines = list
      .filter((t) => t.assignment.kind === "ukol" && t.assignment.dueAt && new Date(t.assignment.dueAt).getTime() > now)
      .sort((x, y) => x.assignment.dueAt!.localeCompare(y.assignment.dueAt!))
      .slice(0, 3)
      .map((t) => ({
        id: t.assignment.id,
        title: t.assignment.title,
        meta: `${t.assignment.activityTitle} · odevzdalo ${t.submitted} z ${t.students}`,
        dueAt: t.assignment.dueAt!,
        urgent: soon(t.assignment.dueAt!),
      }));
    return {
      headline: toReview,
      done: 0,
      waiting: 0,
      late: 0,
      assignmentsToReview: list.filter((t) => t.toReview > 0).length,
      deadlines,
    };
  }
  const list = await tasksForStudent(user);
  const count = (pred: (s: WorkState) => boolean) => list.filter((t) => pred(t.state)).length;
  const deadlines = list
    .filter((t) => (t.state === "ceka" || t.state === "pozde" || t.state === "vraceno") && t.assignment.dueAt)
    .sort((x, y) => x.assignment.dueAt!.localeCompare(y.assignment.dueAt!))
    .slice(0, 3)
    .map((t) => ({
      id: t.assignment.id,
      title: t.assignment.title,
      meta: `${t.assignment.activityTitle}${t.state === "pozde" ? " · po termínu" : t.state === "vraceno" ? " · vráceno k doplnění" : ""}`,
      dueAt: t.assignment.dueAt!,
      urgent: t.state === "pozde" || soon(t.assignment.dueAt!),
    }));
  return {
    headline: count((s) => s === "ceka" || s === "pozde" || s === "vraceno"),
    done: count((s) => s === "odevzdano" || s === "splneno" || s === "nesplneno"),
    waiting: count((s) => s === "ceka" || s === "vraceno"),
    late: count((s) => s === "pozde"),
    assignmentsToReview: 0,
    deadlines,
  };
}

// Výsledky se v rámci jednoho požadavku sdílí (React cache) — stránka, menu
// i pomocné funkce se ptají na stejná data a do databáze se jde jen jednou.
export const assignmentsForUser = cache(assignmentsForUserUncached);
export const getAssignment = cache(getAssignmentUncached);
export const homeTasks = cache(homeTasksUncached);
export const tasksForStudent = cache(tasksForStudentUncached);
export const tasksForTeacher = cache(tasksForTeacherUncached);
export const assignmentFiles = cache(assignmentFilesUncached);
