// Naplní Supabase ukázkovými daty (uživatelé, kurzy, ateliéry, rozvrh, zápisy),
// aby se dala aplikace vyzkoušet naostro. Spuštění: npm run seed
//
// Potřebuje v .env.local: NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SECRET_KEY.
// Volitelně SEED_PASSWORD — pak se všichni ukázkoví uživatelé můžou přihlásit
// tímto heslem (jinak si heslo nastaví přes „Zapomenuté heslo?“).
// Skript je bezpečné spustit opakovaně: existující uživatele a kurzy přeskočí.

import { createClient } from "@supabase/supabase-js";
import { DEMO_ACTIVITIES, DEMO_USERS } from "../src/lib/demo-data.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SECRET_KEY v .env.local.");
  process.exit(1);
}
const password = process.env.SEED_PASSWORD;
const sb = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

async function existingUsers(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach((u) => u.email && map.set(u.email.toLowerCase(), u.id));
    if (data.users.length < 1000) return map;
  }
}

const byEmail = await existingUsers();
const idOf = new Map<string, string>(); // demo id → uuid

for (const u of DEMO_USERS) {
  let id = byEmail.get(u.email);
  if (!id) {
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
      ...(password ? { password } : {}),
      user_metadata: { full_name: u.name },
      app_metadata: { role: u.role, grade: u.grade ? String(u.grade) : undefined, staff_note: u.role === "student" ? undefined : u.group },
    });
    if (error || !data.user) throw new Error(`${u.email}: ${error?.message}`);
    id = data.user.id;
    console.log(`+ uživatel ${u.email}`);
  }
  idOf.set(u.id, id);
  await sb.from("profiles").update({ bio: u.bio ?? null, activated: u.active }).eq("id", id);
}

for (const a of DEMO_ACTIVITIES) {
  const { data: found } = await sb.from("activities").select("id").eq("slug", a.id).maybeSingle();
  if (found) continue;
  const { data: row, error } = await sb
    .from("activities")
    .insert({
      slug: a.id,
      kind: a.kind,
      title: a.title,
      teacher_id: idOf.get(a.teacherId),
      location: a.location,
      starts_on: a.startsOn,
      ends_on: a.endsOn,
      // Ukázkové odkazy nevedou na skutečné schůzky — Meet si vloží vyučující.
      meet_url: null,
      capacity: a.capacity ?? null,
      allowed_grades: a.allowedGrades,
      tone: a.tone,
      project_name: a.project?.name ?? null,
      milestones_done: a.project?.milestonesDone ?? 0,
      milestones_total: a.project?.milestonesTotal ?? 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(`${a.id}: ${error.message}`);
  const slots = a.slots.map((s) => ({ activity_id: row.id, weekday: s.day, starts_at: s.start, ends_at: s.end }));
  const enrollments = a.studentIds.map((sid) => ({ activity_id: row.id, student_id: idOf.get(sid) }));
  const r1 = await sb.from("activity_slots").insert(slots);
  const r2 = await sb.from("enrollments").insert(enrollments);
  if (r1.error || r2.error) throw new Error(`${a.id}: ${(r1.error ?? r2.error)!.message}`);
  console.log(`+ ${a.kind} ${a.title}`);
}

console.log("Hotovo.");
