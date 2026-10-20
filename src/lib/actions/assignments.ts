"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { linkTitle, normalizeLink, parseLinks } from "../assignments";
import { requireTeacher, requireUser } from "../auth";
import { isSupabase } from "../config";
import { getActivity, teachesActivity } from "../data";
import { getAssignment } from "../data-assignments";
import { createClient } from "../supabase/server";
import { pragueLocalToIso } from "../time";
import type { LinkItem, ReviewResult } from "../types";

const DEMO = "Ukázkový režim: změny se neukládají.";

export type FormState = {
  error?: string;
  info?: string;
  fieldErrors?: Record<string, string>;
  /** Nově založený úkol, ke kterému prohlížeč ještě nahraje soubory. */
  createdId?: string;
}

// ---------------------------------------------------------------------------
// Vyučující: zadání úkolů a materiálů
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Týmy úkolu (rozděluje vyučující)
// ---------------------------------------------------------------------------

type TeamDraft = { id?: string; name: string; memberIds: string[] };

/** Zkontroluje týmy z formuláře: názvy, jen zapsaní studenti, každý nejvýš v jednom týmu. */
function cleanTeams(drafts: TeamDraft[], enrolled: string[]): { list: TeamDraft[] } | { error: string } {
  const list = drafts
    .slice(0, 40)
    .map((t) => ({
      id: typeof t.id === "string" && /^[0-9a-f-]{36}$/i.test(t.id) ? t.id : undefined,
      name: String(t.name ?? "").trim().slice(0, 80),
      memberIds: [...new Set((t.memberIds ?? []).map(String))],
    }))
    .filter((t) => t.name || t.memberIds.length);
  if (list.some((t) => !t.name)) return { error: "Každý tým potřebuje název." };
  const seen = new Set<string>();
  for (const t of list) {
    for (const id of t.memberIds) {
      if (!enrolled.includes(id)) return { error: "V týmu je někdo, kdo není ve třídě zapsaný." };
      if (seen.has(id)) return { error: "Student může být jen v jednom týmu." };
      seen.add(id);
    }
  }
  return { list };
}

/** Uloží týmy úkolu tak, jak je vyučující poskládal (smazané zmizí, nové přibudou). */
async function syncTeams(assignmentId: string, teams: TeamDraft[]): Promise<string | null> {
  const sb = await createClient();
  const { data: existing } = await sb.from("teams").select("id").eq("assignment_id", assignmentId);
  const keep = new Set(teams.map((t) => t.id).filter(Boolean));
  const remove = (existing ?? []).map((t) => t.id).filter((id) => !keep.has(id));
  if (remove.length && (await sb.from("teams").delete().in("id", remove)).error) return "Týmy se nepodařilo uložit.";
  // Členství nejdřív smazat, aby šlo studenty přesouvat mezi týmy.
  if ((await sb.from("team_members").delete().eq("assignment_id", assignmentId)).error) return "Týmy se nepodařilo uložit.";
  for (const t of teams) {
    let id = t.id && (existing ?? []).some((e) => e.id === t.id) ? t.id : undefined;
    if (id) {
      if ((await sb.from("teams").update({ name: t.name }).eq("id", id)).error) return "Týmy se nepodařilo uložit.";
    } else {
      const { data, error } = await sb.from("teams").insert({ assignment_id: assignmentId, name: t.name }).select("id").single();
      if (error || !data) return "Týmy se nepodařilo uložit.";
      id = data.id;
    }
    if (t.memberIds.length) {
      const { error } = await sb.from("team_members").insert(t.memberIds.map((sid) => ({ team_id: id, student_id: sid })));
      if (error) return "Členy týmu se nepodařilo uložit.";
    }
  }
  return null;
}

export async function saveAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeacher();
  const editingId = String(formData.get("id") ?? "") || null;
  const kind = formData.get("kind") === "material" ? "material" : "ukol";
  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim() || null;
  const dueRaw = String(formData.get("due") ?? "").trim();
  const pointsRaw = String(formData.get("maxPoints") ?? "").trim();
  const { links, bad } = parseLinks(String(formData.get("links") ?? ""));

  const fieldErrors: Record<string, string> = {};
  if (title.length < 2) fieldErrors.title = "Vyplň název.";
  if (title.length > 200) fieldErrors.title = "Název je moc dlouhý.";
  if (bad) fieldErrors.links = `Tohle není platný odkaz: ${bad}`;
  let dueAt: string | null = null;
  let maxPoints: number | null = null;
  if (kind === "ukol") {
    if (dueRaw) {
      dueAt = pragueLocalToIso(dueRaw);
      if (!dueAt) fieldErrors.due = "Napiš datum jako 21. 10. 2026 a čas jako 23:59.";
    }
    if (pointsRaw) {
      maxPoints = Number(pointsRaw);
      if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 1000) fieldErrors.maxPoints = "Body musí být celé číslo 1–1000.";
    }
  }
  const teamWork = kind === "ukol" && formData.get("teamWork") === "1";
  const teamMode = formData.get("teamMode") === "students" ? "students" : "teacher";
  const sizeRaw = String(formData.get("teamMaxSize") ?? "").trim();
  let teamMaxSize: number | null = null;
  if (teamWork && teamMode === "students" && sizeRaw) {
    teamMaxSize = Number(sizeRaw);
    if (!Number.isInteger(teamMaxSize) || teamMaxSize < 2 || teamMaxSize > 20) fieldErrors.teamMaxSize = "Velikost týmu 2–20.";
  }
  let teamDrafts: TeamDraft[] | null = null;
  if (teamWork && teamMode === "teacher") {
    try {
      teamDrafts = JSON.parse(String(formData.get("teams") ?? "[]")) as TeamDraft[];
      if (!Array.isArray(teamDrafts)) throw new Error();
    } catch {
      fieldErrors.teams = "Týmy se nepodařilo přečíst.";
    }
  }
  // Naplánované zveřejnění (jen u úkolu, který studenti ještě nevidí).
  const publishRaw = String(formData.get("publishAt") ?? "").trim();
  let publishAt: string | null = null;
  if (publishRaw === "neplatne") fieldErrors.publishAt = "Napiš datum jako 21. 10. 2026 a čas jako 8:00.";
  else if (publishRaw) {
    publishAt = pragueLocalToIso(publishRaw);
    if (!publishAt) fieldErrors.publishAt = "Napiš datum jako 21. 10. 2026 a čas jako 8:00.";
    else if (new Date(publishAt).getTime() <= Date.now()) fieldErrors.publishAt = "Čas zveřejnění musí být v budoucnu (nebo zvol Hned).";
  }
  if (publishAt && dueAt && dueAt <= publishAt) fieldErrors.due = "Termín musí být až po zveřejnění.";
  const values = {
    kind,
    title,
    instructions,
    topic,
    due_at: dueAt,
    max_points: maxPoints,
    links,
    team_work: teamWork,
    team_mode: teamMode,
    team_max_size: teamMaxSize,
  };

  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };

  // Oprávnění: vyučující dané třídy nebo admin.
  const existing = editingId ? await getAssignment(editingId) : null;
  const slug = existing?.activityId ?? String(formData.get("activity") ?? "");
  const activity = await getActivity(slug);
  if ((editingId && !existing) || !activity || !teachesActivity(user, activity)) return { error: "Do téhle třídy úkoly zadávat nemůžeš." };

  const teams = teamDrafts ? cleanTeams(teamDrafts, activity.studentIds) : null;
  if (teams && "error" in teams) return { error: teams.error, fieldErrors: { teams: teams.error } };

  if (!isSupabase) return { info: DEMO };

  const sb = await createClient();
  if (editingId) {
    // Už zveřejněný úkol se znovu neschovává; naplánovaný jde přeplánovat, nebo zveřejnit hned.
    const wasScheduled = !!existing?.publishAt && new Date(existing.publishAt).getTime() > Date.now();
    const { error } = await sb
      .from("assignments")
      .update(wasScheduled && publishAt ? { ...values, publish_at: publishAt } : values)
      .eq("id", editingId);
    if (!error && wasScheduled && !publishAt) await sb.rpc("publish_assignment_now", { assignment: editingId });
    if (error) return { error: `Úkol se nepodařilo uložit: ${error.message}` };
    if (teams) {
      const problem = await syncTeams(editingId, teams.list);
      if (problem) return { error: problem };
    }
    redirect(`/ukoly/${editingId}?ulozeno=1`);
  }
  const { data: row } = await sb.from("activities").select("id").eq("slug", slug).single();
  if (!row) return { error: "Třída nenalezena." };
  const { data, error } = await sb.from("assignments").insert({ ...values, publish_at: publishAt, activity_id: row.id }).select("id").single();
  if (error || !data) return { error: `Úkol se nepodařilo zadat: ${error?.message ?? ""}` };
  if (teams) {
    const problem = await syncTeams(data.id, teams.list);
    if (problem) return { error: `Úkol je zadaný, ale ${problem.charAt(0).toLowerCase()}${problem.slice(1)}` };
  }
  if (formData.get("withFiles") === "1") return { createdId: data.id };
  redirect(`/ukoly/${data.id}?nove=1`);
}

export async function deleteAssignment(id: string): Promise<{ error?: string }> {
  const user = await requireTeacher();
  const a = await getAssignment(id);
  const activity = a ? await getActivity(a.activityId) : null;
  if (!a || !activity || !teachesActivity(user, activity)) return { error: "Tenhle úkol smazat nemůžeš." };
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  // Soubory vyučujícího smazat dřív než úkol (oprávnění k nim se odvozuje od úkolu).
  const { data: files } = await sb.storage.from("materialy").list(id);
  if (files?.length) await sb.storage.from("materialy").remove(files.map((f) => `${id}/${f.name}`));
  const { error } = await sb.from("assignments").delete().eq("id", id);
  if (error) return { error: "Úkol se nepodařilo smazat." };
  // Soubory odevzdaných prací smaže vyučující nemůže (Storage je studentův); zůstanou do úklidu adminem.
  redirect(`${activity.kind === "atelier" ? "/ateliery" : "/kurzy"}/${activity.id}?tab=work`);
}

export async function reviewWork(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeacher();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const result = String(formData.get("result") ?? "") as ReviewResult;
  const pointsRaw = String(formData.get("points") ?? "").trim();
  const feedback = String(formData.get("feedback") ?? "").trim() || null;
  const request = String(formData.get("request") ?? "").trim() || null;
  // Týmový úkol: hodnotit celý tým, nebo jen tohoto studenta.
  const individual = formData.get("scope") === "individual";

  const a = await getAssignment(assignmentId);
  const activity = a ? await getActivity(a.activityId) : null;
  if (!a || !activity || !teachesActivity(user, activity)) return { error: "Tenhle úkol hodnotit nemůžeš." };
  if (!activity.studentIds.includes(studentId)) return { error: "Student není v této třídě zapsaný." };

  const fieldErrors: Record<string, string> = {};
  if (!["splneno", "nesplneno", "vraceno"].includes(result)) fieldErrors.result = "Vyber výsledek.";
  if (result === "vraceno" && !request) fieldErrors.request = "Napiš, co má student doplnit.";
  let points: number | null = null;
  if (pointsRaw) {
    points = Number(pointsRaw);
    if (a.maxPoints === null) fieldErrors.points = "Úkol je bez bodů.";
    else if (!Number.isInteger(points) || points < 0 || points > a.maxPoints) fieldErrors.points = `Body 0–${a.maxPoints}.`;
  }
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj hodnocení.", fieldErrors };

  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("reviews").upsert({
    assignment_id: assignmentId,
    student_id: studentId,
    result,
    points,
    feedback,
    request: result === "vraceno" ? request : null,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    individual: !!a.teamWork && individual,
  });
  if (error) return { error: `Hodnocení se nepodařilo uložit: ${error.message}` };
  refresh();
  return { info: result === "vraceno" ? "Vráceno studentovi k doplnění." : "Hodnocení je uložené." };
}

/** Zrušení hodnocení (např. omylem uzavřená práce). */
export async function clearReview(assignmentId: string, studentId: string): Promise<{ error?: string }> {
  const user = await requireTeacher();
  const a = await getAssignment(assignmentId);
  const activity = a ? await getActivity(a.activityId) : null;
  if (!a || !activity || !teachesActivity(user, activity)) return { error: "Nemůžeš." };
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("reviews").delete().eq("assignment_id", assignmentId).eq("student_id", studentId);
  if (error) return { error: "Hodnocení se nepodařilo zrušit." };
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Student: odevzdání
// ---------------------------------------------------------------------------

async function studentContext(assignmentId: string) {
  const user = await requireUser();
  const a = await getAssignment(assignmentId);
  const activity = a ? await getActivity(a.activityId) : null;
  if (!a || a.kind !== "ukol" || !activity || !activity.studentIds.includes(user.id)) return null;
  return { user, a };
}

export async function addSubmissionLink(assignmentId: string, raw: string): Promise<FormState> {
  const ctx = await studentContext(assignmentId);
  if (!ctx) return { error: "K tomuhle úkolu nic odevzdat nemůžeš." };
  const url = normalizeLink(raw);
  if (!url) return { error: "Vlož celý odkaz, např. na Google Dokument." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { data: cur } = await sb
    .from("submissions")
    .select("links")
    .eq("assignment_id", assignmentId)
    .eq("student_id", ctx.user.id)
    .maybeSingle();
  const links = [...((cur?.links as LinkItem[]) ?? []), { title: linkTitle(url), url }].slice(0, 20);
  const { error } = await sb
    .from("submissions")
    .upsert({ assignment_id: assignmentId, student_id: ctx.user.id, links }, { onConflict: "assignment_id,student_id" });
  if (error) return { error: "Odkaz se nepodařilo přidat. Pokud je práce ohodnocená, už ji měnit nejde." };
  refresh();
  return {};
}

export async function removeSubmissionLink(assignmentId: string, index: number): Promise<FormState> {
  const ctx = await studentContext(assignmentId);
  if (!ctx) return { error: "Nemůžeš." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { data: cur } = await sb
    .from("submissions")
    .select("links")
    .eq("assignment_id", assignmentId)
    .eq("student_id", ctx.user.id)
    .maybeSingle();
  const links = ((cur?.links as LinkItem[]) ?? []).filter((_, i) => i !== index);
  const { error } = await sb.from("submissions").update({ links }).eq("assignment_id", assignmentId).eq("student_id", ctx.user.id);
  if (error) return { error: "Odkaz se nepodařilo odebrat." };
  refresh();
  return {};
}

export async function setSubmitted(assignmentId: string, submitted: boolean, note?: string): Promise<FormState> {
  const ctx = await studentContext(assignmentId);
  if (!ctx) return { error: "K tomuhle úkolu nic odevzdat nemůžeš." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("submissions").upsert(
    {
      assignment_id: assignmentId,
      student_id: ctx.user.id,
      status: submitted ? "odevzdano" : "rozpracovano",
      ...(note !== undefined ? { note: note.trim() || null } : {}),
    },
    { onConflict: "assignment_id,student_id" },
  );
  if (error) return { error: "Nepodařilo se uložit. Ohodnocenou práci už měnit nejde." };
  refresh();
  return { info: submitted ? "Odevzdáno." : "Odevzdání je zrušené, práci můžeš upravit." };
}

/** Po nahrání nebo smazání souboru v prohlížeči jen obnoví stránku. */
export async function filesChanged(): Promise<void> {
  refresh();
}

// ---------------------------------------------------------------------------
// Soukromé komentáře
// ---------------------------------------------------------------------------

export async function addComment(assignmentId: string, studentId: string, body: string): Promise<FormState> {
  const user = await requireUser();
  const text = body.trim();
  if (!text) return { error: "Napiš komentář." };
  if (text.length > 4000) return { error: "Komentář je moc dlouhý." };
  const a = await getAssignment(assignmentId);
  const activity = a ? await getActivity(a.activityId) : null;
  if (!a || !activity) return { error: "Úkol nenalezen." };
  const allowed = user.id === studentId ? activity.studentIds.includes(user.id) : teachesActivity(user, activity);
  if (!allowed) return { error: "Sem psát nemůžeš." };
  if (!isSupabase) return { info: DEMO };
  const sb = await createClient();
  const { error } = await sb.from("assignment_comments").insert({ assignment_id: assignmentId, student_id: studentId, author_id: user.id, body: text });
  if (error) return { error: "Komentář se nepodařilo odeslat." };
  refresh();
  return {};
}

/** Vyučující naplánovaný úkol zveřejní hned. */
export async function publishAssignmentNow(id: string): Promise<{ error?: string }> {
  await requireTeacher();
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
  const { error } = await sb.rpc("publish_assignment_now", { assignment: id });
  if (error) return { error: "Úkol se nepodařilo zveřejnit." };
  refresh();
  return {};
}
