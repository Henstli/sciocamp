"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeacher } from "../auth";
import { isSupabase } from "../config";
import { getActivity, getUserById, getUsersByIds, listActivities, listPeriods, teachesActivity } from "../data";
import { atelierConflicts, formatDateRange } from "../periods";
import { normalizeMeetUrl } from "../meet";
import { isAdmin, canTeach } from "../roles";
import { createClient } from "../supabase/server";
import type { ActivityKind } from "../types";

export type ActivityFormState = { error?: string; info?: string; fieldErrors?: Record<string, string> };

type SlotInput = { day: number; start: string; end: string };

const KINDS: ActivityKind[] = ["kurz", "atelier", "ostatni"];
const TONE_BY_KIND = { kurz: "blue", atelier: "violet", ostatni: "teal" } as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** „Literatura ve filmu“ → „literatura-ve-filmu“ */
function slugify(title: string): string {
  return (
    title
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "aktivita"
  );
}

function parseForm(formData: FormData) {
  const fieldErrors: Record<string, string> = {};
  const kind = String(formData.get("kind") ?? "") as ActivityKind;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim().slice(0, 160) || null;
  const periodId = String(formData.get("periodId") ?? "").trim() || null;
  const startsRaw = String(formData.get("startsOn") ?? "").trim();
  const endsRaw = String(formData.get("endsOn") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const meetRaw = String(formData.get("meetUrl") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const grades = formData
    .getAll("grades")
    .map(Number)
    .filter((g) => g >= 1 && g <= 4)
    .sort();
  const projectName = String(formData.get("projectName") ?? "").trim() || null;
  const milestonesTotal = Number(formData.get("milestonesTotal") ?? 0) || 0;
  const milestonesDone = Number(formData.get("milestonesDone") ?? 0) || 0;

  if (!KINDS.includes(kind)) fieldErrors.kind = "Vyber typ.";
  if (title.length < 2) fieldErrors.title = "Vyplň název.";
  if (title.length > 120) fieldErrors.title = "Název je moc dlouhý.";

  let capacity: number | null = null;
  if (capacityRaw) {
    capacity = Number(capacityRaw);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) fieldErrors.capacity = "Kapacita musí být celé číslo 1–500.";
  }

  const meetUrl = meetRaw ? normalizeMeetUrl(meetRaw) : null;
  if (meetRaw && !meetUrl) fieldErrors.meetUrl = "Vlož odkaz na Google Meet, např. https://meet.google.com/abc-defg-hij.";

  let slots: SlotInput[] = [];
  try {
    slots = JSON.parse(String(formData.get("slots") ?? "[]"));
  } catch {
    fieldErrors.slots = "Rozvrh se nepodařilo přečíst.";
  }
  slots = slots.filter((s) => s && (s.start || s.end));
  for (const s of slots) {
    if (!(s.day >= 1 && s.day <= 5) || !TIME.test(s.start) || !TIME.test(s.end)) {
      fieldErrors.slots = "U každé hodiny vyplň začátek i konec ve 24h formátu, např. 9:00–11:30.";
      break;
    }
    if (s.end <= s.start) {
      fieldErrors.slots = "Konec hodiny musí být po začátku.";
      break;
    }
  }

  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  let startsOn: string | null = null;
  let endsOn: string | null = null;
  if (kind !== "kurz") {
    if (startsRaw && !ISO.test(startsRaw)) fieldErrors.startsOn = "Napiš datum jako 21. 10. 2026.";
    else startsOn = startsRaw || null;
    if (endsRaw && !ISO.test(endsRaw)) fieldErrors.endsOn = "Napiš datum jako 23. 10. 2026.";
    else endsOn = endsRaw || null;
    if (startsOn && endsOn && endsOn < startsOn) fieldErrors.endsOn = "Konec musí být stejný den nebo po začátku.";
    if (kind === "ostatni" && !startsOn && !periodId && slots.length === 0) {
      fieldErrors.startsOn = "Vyplň datum akce, nebo rozvrh.";
    }
  }

  if (milestonesTotal < 0 || milestonesTotal > 20 || milestonesDone < 0 || milestonesDone > milestonesTotal) {
    fieldErrors.milestones = "Hotových milníků nemůže být víc než všech (max. 20).";
  }

  return {
    fieldErrors,
    values: {
      kind,
      title,
      description,
      location,
      block_id: periodId,
      starts_on: startsOn,
      ends_on: endsOn,
      capacity,
      meet_url: meetUrl,
      allowed_grades: grades.length && grades.length < 4 ? grades : null,
      tone: TONE_BY_KIND[kind] ?? "blue",
      project_name: kind === "atelier" ? projectName : null,
      milestones_total: kind === "atelier" && projectName ? milestonesTotal : 0,
      milestones_done: kind === "atelier" && projectName ? milestonesDone : 0,
    },
    teacherId,
    slots,
  };
}

/** Založí novou aktivitu, nebo upraví existující (podle pole „slug“). */
export async function saveActivity(_prev: ActivityFormState, formData: FormData): Promise<ActivityFormState> {
  const user = await requireTeacher();
  const editingSlug = String(formData.get("slug") ?? "") || null;
  const { fieldErrors, values, teacherId, slots } = parseForm(formData);
  if (Object.keys(fieldErrors).length) return { error: "Zkontroluj zvýrazněná pole.", fieldErrors };

  // Období: kurz a ateliér ho musí mít (pokud admin nějaká založil), data ateliéru musí ležet uvnitř.
  const periods = await listPeriods();
  const period = periods.find((p) => p.id === values.block_id) ?? null;
  if (values.block_id && !period) return { error: "Vybrané období neexistuje.", fieldErrors: { periodId: "Vyber období." } };
  if (!period && periods.length > 0 && values.kind !== "ostatni") {
    return { error: "Zkontroluj zvýrazněná pole.", fieldErrors: { periodId: "Vyber kurzové období." } };
  }
  if (period && values.kind === "atelier") {
    const outside = (d: string | null) => d && (d < period.startsOn || d > period.endsOn);
    if (outside(values.starts_on) || outside(values.ends_on)) {
      const range = formatDateRange(period.startsOn, period.endsOn);
      return { error: "Zkontroluj zvýrazněná pole.", fieldErrors: { startsOn: `Ateliér musí být v rámci období (${range}).` } };
    }
  }

  const existing = editingSlug ? await getActivity(editingSlug) : null;
  if (editingSlug && (!existing || !teachesActivity(user, existing))) return { error: "Tuhle aktivitu upravovat nemůžeš." };

  // Vyučujícího vybírá jen admin; učitel zakládá vždy za sebe a třídu nepředává.
  let teacher = existing?.teacherId ?? user.id;
  if (isAdmin(user.role) && teacherId) {
    const t = await getUserById(teacherId);
    if (!t || !canTeach(t.role)) return { error: "Vybraný vyučující neexistuje.", fieldErrors: { teacherId: "Vyber vyučujícího." } };
    teacher = t.id;
  }

  if (!isSupabase) return { info: "Ukázkový režim: změny se neukládají." };

  const sb = await createClient();
  let activityId: string;
  let slug = editingSlug;

  if (editingSlug) {
    const { data, error } = await sb
      .from("activities")
      .update({ ...values, teacher_id: teacher })
      .eq("slug", editingSlug)
      .select("id")
      .single();
    if (error || !data) {
      // Nové termíny ateliéru by se překrývaly s jiným ateliérem zapsaných studentů.
      if (error?.code === "23P01") return { error: error.message, fieldErrors: { startsOn: "Termín se překrývá s jiným ateliérem studentů." } };
      return { error: "Změny se nepodařilo uložit." };
    }
    activityId = data.id;
  } else {
    // Najdi volnou adresu: literatura-ve-filmu, literatura-ve-filmu-2, …
    const base = slugify(values.title);
    const { data: taken } = await sb.from("activities").select("slug").like("slug", `${base}%`);
    const used = new Set((taken ?? []).map((r) => r.slug));
    slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;

    const { data, error } = await sb
      .from("activities")
      .insert({ ...values, slug, teacher_id: teacher })
      .select("id")
      .single();
    if (error || !data) return { error: `Aktivitu se nepodařilo založit${error?.message ? `: ${error.message}` : "."}` };
    activityId = data.id;
  }

  // Rozvrh: nahradíme celý.
  const del = await sb.from("activity_slots").delete().eq("activity_id", activityId);
  if (del.error) return { error: "Rozvrh se nepodařilo uložit." };
  if (slots.length) {
    const ins = await sb
      .from("activity_slots")
      .insert(slots.map((s) => ({ activity_id: activityId, weekday: s.day, starts_at: s.start, ends_at: s.end })));
    if (ins.error) return { error: "Rozvrh se nepodařilo uložit." };
  }

  if (!editingSlug) redirect(`/ucitel/${slug}?nova=1`);
  refresh();
  return { info: "Uloženo." };
}

export async function deleteActivity(slug: string): Promise<{ error?: string }> {
  const user = await requireTeacher();
  const activity = await getActivity(slug);
  if (!activity || !teachesActivity(user, activity)) return { error: "Tuhle aktivitu smazat nemůžeš." };
  if (!isSupabase) return { error: "Ukázkový režim: mazání se neukládá." };
  const sb = await createClient();
  const { data, error } = await sb.from("activities").delete().eq("slug", slug).select("id");
  if (error || !data?.length) return { error: "Aktivitu se nepodařilo smazat." };
  redirect("/ucitel?smazano=1");
}

export type EnrollState = { error?: string; info?: string };

/** Zapíše a odepíše studenty. */
export async function updateEnrollments(slug: string, add: string[], remove: string[]): Promise<EnrollState> {
  const user = await requireTeacher();
  const activity = await getActivity(slug);
  if (!activity || !teachesActivity(user, activity)) return { error: "Tuhle třídu upravovat nemůžeš." };
  if (!isSupabase) return { info: "Ukázkový režim: zápisy se neukládají." };

  // Ateliér: student smí být v jednu dobu jen v jednom (hlídá i databáze).
  const conflicts = atelierConflicts(activity, await listActivities());
  const blocked = add.filter((id) => conflicts[id]);
  if (blocked.length) {
    const names = (await getUsersByIds(blocked)).map((u) => `${u.name} (${conflicts[u.id]})`);
    return { error: `V té době už jsou v jiném ateliéru: ${names.join(", ")}.` };
  }

  const sb = await createClient();
  const { data: row } = await sb.from("activities").select("id").eq("slug", slug).single();
  if (!row) return { error: "Třída nenalezena." };

  if (remove.length) {
    const { error } = await sb.from("enrollments").delete().eq("activity_id", row.id).in("student_id", remove);
    if (error) return { error: "Studenty se nepodařilo odepsat." };
  }
  if (add.length) {
    const { error } = await sb
      .from("enrollments")
      .upsert(add.map((id) => ({ activity_id: row.id, student_id: id })), { ignoreDuplicates: true });
    if (error) return { error: error.code === "23P01" ? error.message : "Studenty se nepodařilo zapsat." };
  }
  refresh();
  const parts = [add.length && `zapsáno ${add.length}`, remove.length && `odepsáno ${remove.length}`].filter(Boolean);
  return { info: parts.length ? `Hotovo: ${parts.join(", ")}.` : "Nic se nezměnilo." };
}
