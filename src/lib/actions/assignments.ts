"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { linkTitle, normalizeLink } from "../assignments";
import { requireTeacher, requireUser } from "../auth";
import { isSupabase } from "../config";
import { getActivity, teachesActivity } from "../data";
import { getAssignment } from "../data-assignments";
import { createClient } from "../supabase/server";
import { pragueLocalToIso } from "../time";
import type { LinkItem, ReviewResult } from "../types";

const DEMO = "Ukázkový režim: změny se neukládají.";

export type FormState = { error?: string; info?: string; fieldErrors?: Record<string, string> };

/** Odkazy z formuláře: jeden na řádek, volitelně „Název | https://…“. */
function parseLinks(raw: string): { links: LinkItem[]; bad: string | null } {
  const links: LinkItem[] = [];
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [maybeTitle, maybeUrl] = line.includes("|") ? line.split("|").map((x) => x.trim()) : [null, line];
    const url = normalizeLink(maybeUrl ?? "");
    if (!url) return { links, bad: line };
    links.push({ title: maybeTitle || linkTitle(url), url });
  }
  return { links: links.slice(0, 20), bad: null };
}

// ---------------------------------------------------------------------------
// Vyučující: zadání úkolů a materiálů
// ---------------------------------------------------------------------------

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
      if (!dueAt) fieldErrors.due = "Neplatný termín.";
    }
    if (pointsRaw) {
      maxPoints = Number(pointsRaw);
      if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 1000) fieldErrors.maxPoints = "Body musí být celé číslo 1–1000.";
    }
  }
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };

  // Oprávnění: vyučující dané třídy nebo admin.
  const existing = editingId ? await getAssignment(editingId) : null;
  const slug = existing?.activityId ?? String(formData.get("activity") ?? "");
  const activity = await getActivity(slug);
  if ((editingId && !existing) || !activity || !teachesActivity(user, activity)) return { error: "Do téhle třídy úkoly zadávat nemůžeš." };

  if (!isSupabase) return { info: DEMO };

  const sb = await createClient();
  const values = { kind, title, instructions, topic, due_at: dueAt, max_points: maxPoints, links };
  if (editingId) {
    const { error } = await sb.from("assignments").update(values).eq("id", editingId);
    if (error) return { error: `Úkol se nepodařilo uložit: ${error.message}` };
    redirect(`/ukoly/${editingId}?ulozeno=1`);
  }
  const { data: row } = await sb.from("activities").select("id").eq("slug", slug).single();
  if (!row) return { error: "Třída nenalezena." };
  const { data, error } = await sb.from("assignments").insert({ ...values, activity_id: row.id }).select("id").single();
  if (error || !data) return { error: `Úkol se nepodařilo zadat: ${error?.message ?? ""}` };
  redirect(`/ukoly/${data.id}?nove=1`);
}

export async function deleteAssignment(id: string): Promise<{ error?: string }> {
  const user = await requireTeacher();
  const a = await getAssignment(id);
  const activity = a ? await getActivity(a.activityId) : null;
  if (!a || !activity || !teachesActivity(user, activity)) return { error: "Tenhle úkol smazat nemůžeš." };
  if (!isSupabase) return { error: DEMO };
  const sb = await createClient();
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
