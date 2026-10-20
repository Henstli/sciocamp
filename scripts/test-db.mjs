// Test databázových migrací a oprávnění (RLS) v PGlite — Postgres běžící
// přímo v Node, bez Dockeru a bez Supabase. Spouští se: npm run test:db
//
// Supabase si napodobíme minimálně: schéma auth s tabulkou users,
// funkci auth.uid() a role anon / authenticated / service_role.

import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_app_meta_data jsonb default '{}'::jsonb,
    raw_user_meta_data jsonb default '{}'::jsonb,
    last_sign_in_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  -- Minimální napodobenina Supabase Storage
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text default nullif(current_setting('request.jwt.claim.sub', true), ''), created_at timestamptz default now(), metadata jsonb);
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Supabase Realtime
  create publication supabase_realtime;
`);

const dir = new URL("../supabase/migrations/", import.meta.url).pathname;
for (const file of readdirSync(dir).sort()) {
  await db.exec(readFileSync(join(dir, file), "utf8"));
}

// Supabase dává rolím přístup ke schématu public; tady to musíme udělat sami.
await db.exec(`
  grant usage on schema public to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to service_role;
`);

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

/** Spustí dotaz jako přihlášený uživatel (nebo anon, když uid = null). */
async function as(uid, sql, params = []) {
  await db.exec("reset role");
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function createUser(email, appMeta = {}, userMeta = {}) {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3) returning id`,
    [email, appMeta, userMeta],
  );
  return rows[0].id;
}

console.log("Databáze ScioCamp:");

const admin = await createUser("miroslav.pavel@scioskola.cz", { role: "admin" }, { full_name: "Miroslav Pavel" });
const teacher = await createUser("anezka.jakubcova@scioskola.cz", { role: "ucitel" }, { full_name: "Anežka Jakubcová" });
const teacher2 = await createUser("tereza.hankova@scioskola.cz", { role: "ucitel" }, { full_name: "Tereza Hanková" });
const student = await createUser("simon.liska@scioskola.cz", { role: "student", grade: "3" }, { full_name: "Šimon Samuel Liška" });
const student2 = await createUser("eliot.komarek@scioskola.cz", { grade: "4" }, { full_name: "Eliot Komárek" });
const outsider = await createUser("cizi.student@scioskola.cz", {}, { full_name: "Cizí Student" });

const { rows: [course] } = await db.query(
  `insert into public.activities (slug, kind, title, teacher_id, location, meet_url, published)
   values ('literatura-ve-filmu', 'kurz', 'Literatura ve filmu', $1, 'učebna 204', 'https://meet.google.com/abc-defg-hij', true) returning id`,
  [teacher],
);
const { rows: [atelier] } = await db.query(
  `insert into public.activities (slug, kind, title, teacher_id, allowed_grades, published)
   values ('prezentacni-schopnosti', 'atelier', 'Prezentační schopnosti', $1, '{3,4}', true) returning id`,
  [teacher2],
);
await db.query(`insert into public.activity_slots (activity_id, weekday, starts_at, ends_at) values ($1, 2, '11:30', '12:30')`, [course.id]);
await db.query(`insert into public.enrollments (activity_id, student_id) values ($1, $2), ($1, $3)`, [course.id, student, student2]);

await test("profil se založí s rolí a ročníkem z app_metadata", async () => {
  const { rows } = await db.query(`select role, grade, full_name from public.profiles where id = $1`, [student]);
  assert.deepEqual(rows[0], { role: "student", grade: 3, full_name: "Šimon Samuel Liška" });
  const t = await db.query(`select role, grade from public.profiles where id = $1`, [teacher]);
  assert.deepEqual(t.rows[0], { role: "ucitel", grade: null });
});

await test("bez role v app_metadata je z uživatele student", async () => {
  const { rows } = await db.query(`select role, grade from public.profiles where id = $1`, [student2]);
  assert.deepEqual(rows[0], { role: "student", grade: 4 });
});

await test("roli si nelze nastavit přes user_metadata", async () => {
  const id = await createUser("hacker@scioskola.cz", {}, { full_name: "X", role: "admin" });
  const { rows } = await db.query(`select role from public.profiles where id = $1`, [id]);
  assert.equal(rows[0].role, "student");
});

await test("cizí doména se do auth.users nedostane", async () => {
  await assert.rejects(() => createUser("nekdo@gmail.com"), /školním účtem/);
  await assert.rejects(() => createUser("nekdo@scioskola.cz.evil.com"), /školním účtem/);
});

await test("první přihlášení aktivuje účet", async () => {
  await db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [student]);
  const { rows } = await db.query(`select activated from public.profiles where id = $1`, [student]);
  assert.equal(rows[0].activated, true);
});

await test("anonym nevidí nic", async () => {
  await assert.rejects(() => as(null, `select * from public.profiles`));
});

await test("student vidí nabídku aktivit a adresář", async () => {
  assert.equal((await as(student, `select id from public.activities`)).length, 2);
  assert.ok((await as(student, `select id from public.profiles`)).length >= 5);
});

await test("student vidí spolužáky ve svém kurzu, ale ne cizí zápisy", async () => {
  const mine = await as(student, `select student_id from public.enrollments`);
  assert.equal(mine.length, 2);
  const other = await as(outsider, `select student_id from public.enrollments`);
  assert.equal(other.length, 0);
});

await test("student nemůže měnit roli ani Meet", async () => {
  await assert.rejects(() => as(student, `update public.profiles set role = 'admin' where id = $1`, [student]));
  const rows = await as(student, `update public.activities set meet_url = 'https://meet.google.com/xxx-yyyy-zzz' returning id`);
  assert.equal(rows.length, 0);
});

await test("student si může upravit „o mně“", async () => {
  const rows = await as(student, `update public.profiles set bio = 'Ahoj' where id = $1 returning bio`, [student]);
  assert.equal(rows[0].bio, "Ahoj");
  const others = await as(student, `update public.profiles set bio = 'X' where id = $1 returning id`, [student2]);
  assert.equal(others.length, 0);
});

await test("učitelka mění Meet jen u své třídy", async () => {
  const own = await as(teacher, `update public.activities set meet_url = 'https://meet.google.com/new-link-abc' where id = $1 returning id`, [course.id]);
  assert.equal(own.length, 1);
  const foreign = await as(teacher, `update public.activities set meet_url = 'https://meet.google.com/new-link-abc' where id = $1 returning id`, [atelier.id]);
  assert.equal(foreign.length, 0);
});

await test("učitelka nemůže předat svou třídu jinému", async () => {
  await assert.rejects(() => as(teacher, `update public.activities set teacher_id = $1 where id = $2`, [teacher2, course.id]));
});

await test("Meet musí být odkaz na meet.google.com", async () => {
  await assert.rejects(() => as(teacher, `update public.activities set meet_url = 'https://evil.example/x' where id = $1`, [course.id]));
});

await test("admin mění cokoli u aktivit a zapisuje studenty", async () => {
  const rows = await as(admin, `update public.activities set meet_url = null where id = $1 returning id`, [atelier.id]);
  assert.equal(rows.length, 1);
  const ins = await as(admin, `insert into public.enrollments (activity_id, student_id) values ($1, $2) returning student_id`, [atelier.id, student]);
  assert.equal(ins.length, 1);
});

await test("učitel zapisuje jen do své třídy", async () => {
  await assert.rejects(() => as(teacher, `insert into public.enrollments (activity_id, student_id) values ($1, $2)`, [atelier.id, student2]));
});

await test("učitel založí vlastní aktivitu, ale ne za jiného", async () => {
  const own = await as(teacher, `insert into public.activities (slug, kind, title, teacher_id) values ('moje-nova', 'kurz', 'Moje nová', $1) returning id`, [teacher]);
  assert.equal(own.length, 1);
  await assert.rejects(() => as(teacher, `insert into public.activities (slug, kind, title, teacher_id) values ('cizi-nova', 'kurz', 'Cizí', $1)`, [teacher2]));
  await assert.rejects(() => as(student, `insert into public.activities (slug, kind, title, teacher_id) values ('studentova', 'kurz', 'X', $1)`, [student]));
});

await test("učitel smaže jen svou aktivitu", async () => {
  const foreign = await as(teacher, `delete from public.activities where id = $1 returning id`, [atelier.id]);
  assert.equal(foreign.length, 0);
  const own = await as(teacher, `delete from public.activities where slug = 'moje-nova' returning id`);
  assert.equal(own.length, 1);
  const byStudent = await as(student, `delete from public.activities where id = $1 returning id`, [course.id]);
  assert.equal(byStudent.length, 0);
});

await test("učitel upravuje rozvrh jen u své třídy", async () => {
  const own = await as(teacher, `insert into public.activity_slots (activity_id, weekday, starts_at, ends_at) values ($1, 3, '09:00', '10:00') returning id`, [course.id]);
  assert.equal(own.length, 1);
  await assert.rejects(() => as(teacher, `insert into public.activity_slots (activity_id, weekday, starts_at, ends_at) values ($1, 3, '09:00', '10:00')`, [atelier.id]));
});

await test("zablokovaný uživatel přijde o přístup", async () => {
  await db.query(`update public.profiles set blocked = true where id = $1`, [student2]);
  assert.equal((await as(student2, `select id from public.activities`)).length, 0);
  await db.query(`update public.profiles set blocked = false where id = $1`, [student2]);
});

await test("ročník mají jen studenti", async () => {
  await assert.rejects(() => db.query(`update public.profiles set grade = 2 where id = $1`, [teacher]));
});

// ---------------------------------------------------------------------------
// Etapa 2: úkoly, odevzdání, hodnocení
// ---------------------------------------------------------------------------

const { rows: [task] } = await db.query(
  `insert into public.assignments (activity_id, title, max_points, due_at, created_by) values ($1, 'Recenze', 20, now() + interval '1 day', $2) returning id`,
  [course.id, teacher],
);

await test("úkol vidí zapsaný student a vyučující, cizí student ne", async () => {
  assert.equal((await as(student, `select id from public.assignments`)).length, 1);
  assert.equal((await as(teacher, `select id from public.assignments`)).length, 1);
  assert.equal((await as(outsider, `select id from public.assignments`)).length, 0);
  assert.equal((await as(teacher2, `select id from public.assignments`)).length, 0);
});

await test("úkol zadá jen vyučující třídy nebo admin", async () => {
  await assert.rejects(() => as(student, `insert into public.assignments (activity_id, title, created_by) values ($1, 'X', $2)`, [course.id, student]));
  await assert.rejects(() => as(teacher2, `insert into public.assignments (activity_id, title, created_by) values ($1, 'X', $2)`, [course.id, teacher2]));
  const ok = await as(admin, `insert into public.assignments (activity_id, title, kind, created_by) values ($1, 'Materiál', 'material', $2) returning id`, [course.id, admin]);
  assert.equal(ok.length, 1);
});

await test("student odevzdá svou práci, cizí ne", async () => {
  const rows = await as(student, `insert into public.submissions (assignment_id, student_id, status) values ($1, $2, 'odevzdano') returning submitted_at`, [task.id, student]);
  assert.ok(rows[0].submitted_at, "čas odevzdání nastaví databáze");
  await assert.rejects(() => as(student, `insert into public.submissions (assignment_id, student_id) values ($1, $2)`, [task.id, student2]));
  await assert.rejects(() => as(outsider, `insert into public.submissions (assignment_id, student_id) values ($1, $2)`, [task.id, outsider]));
});

await test("spolužák nevidí cizí odevzdání, vyučující ano", async () => {
  assert.equal((await as(student2, `select * from public.submissions`)).length, 0);
  assert.equal((await as(teacher, `select * from public.submissions`)).length, 1);
});

await test("student si nemůže zapsat hodnocení", async () => {
  await assert.rejects(() => as(student, `insert into public.reviews (assignment_id, student_id, result, points, reviewed_by) values ($1, $2, 'splneno', 20, $2)`, [task.id, student]));
});

await test("body nesmí přesáhnout maximum, vrácení musí mít požadavek", async () => {
  await assert.rejects(() => as(teacher, `insert into public.reviews (assignment_id, student_id, result, points, reviewed_by) values ($1, $2, 'splneno', 25, $3)`, [task.id, student, teacher]), /maximem/);
  await assert.rejects(() => as(teacher, `insert into public.reviews (assignment_id, student_id, result, reviewed_by) values ($1, $2, 'vraceno', $3)`, [task.id, student, teacher]));
});

await test("vrácenou práci student upraví, uzavřenou už ne", async () => {
  const [before] = await as(student, `select submitted_at from public.submissions where assignment_id = $1`, [task.id]);
  // Úprava odevzdané práce bez vrácení čas odevzdání neposune.
  const edited = await as(student, `update public.submissions set note = 'oprava překlepu' where assignment_id = $1 and student_id = $2 returning submitted_at`, [task.id, student]);
  assert.equal(edited[0].submitted_at.getTime(), before.submitted_at.getTime());
  await as(teacher, `insert into public.reviews (assignment_id, student_id, result, request, reviewed_by) values ($1, $2, 'vraceno', 'Doplň zdroje', $3)`, [task.id, student, teacher]);
  const again = await as(student, `update public.submissions set status = 'odevzdano', note = 'doplněno' where assignment_id = $1 and student_id = $2 returning note, submitted_at`, [task.id, student]);
  assert.equal(again.length, 1);
  assert.ok(again[0].submitted_at > before.submitted_at, "znovu odevzdáno po vrácení má nový čas");
  const [rev] = await as(teacher, `select reviewed_at from public.reviews where assignment_id = $1`, [task.id]);
  assert.ok(again[0].submitted_at >= rev.reviewed_at, "nové odevzdání je až po vrácení");
  await as(teacher, `update public.reviews set result = 'splneno', points = 18, request = null, feedback = 'Výborně' where assignment_id = $1 and student_id = $2`, [task.id, student]);
  const locked = await as(student, `update public.submissions set note = 'změna' where assignment_id = $1 and student_id = $2 returning note`, [task.id, student]);
  assert.equal(locked.length, 0);
  const mine = await as(student, `select result, points, feedback from public.reviews`);
  assert.deepEqual(mine, [{ result: "splneno", points: 18, feedback: "Výborně" }]);
});

await test("učitel jiné třídy nehodnotí", async () => {
  const rows = await as(teacher2, `update public.reviews set points = 0 returning points`);
  assert.equal(rows.length, 0);
  await assert.rejects(() => as(teacher2, `insert into public.reviews (assignment_id, student_id, result, reviewed_by) values ($1, $2, 'nesplneno', $3)`, [task.id, student2, teacher2]));
});

await test("hodnotit jde jen zapsané studenty", async () => {
  await assert.rejects(() => as(teacher, `insert into public.reviews (assignment_id, student_id, result, reviewed_by) values ($1, $2, 'nesplneno', $3)`, [task.id, outsider, teacher]));
});

await test("soukromé komentáře vidí jen student a vyučující", async () => {
  await as(student, `insert into public.assignment_comments (assignment_id, student_id, author_id, body) values ($1, $2, $2, 'Můžu odkaz?')`, [task.id, student]);
  await as(teacher, `insert into public.assignment_comments (assignment_id, student_id, author_id, body) values ($1, $2, $3, 'Jasně')`, [task.id, student, teacher]);
  assert.equal((await as(student, `select * from public.assignment_comments`)).length, 2);
  assert.equal((await as(student2, `select * from public.assignment_comments`)).length, 0);
  assert.equal((await as(teacher, `select * from public.assignment_comments`)).length, 2);
  await assert.rejects(() => as(student2, `insert into public.assignment_comments (assignment_id, student_id, author_id, body) values ($1, $2, $3, 'X')`, [task.id, student, student2]));
});

await test("soubory: student nahrává jen do své složky, vyučující čte", async () => {
  const mine = `${task.id}/${student2}/esej.pdf`;
  await as(student2, `insert into storage.objects (bucket_id, name) values ('odevzdani', $1)`, [mine]);
  await assert.rejects(() => as(student2, `insert into storage.objects (bucket_id, name) values ('odevzdani', $1)`, [`${task.id}/${student}/podvrh.pdf`]));
  await assert.rejects(() => as(outsider, `insert into storage.objects (bucket_id, name) values ('odevzdani', $1)`, [`${task.id}/${outsider}/x.pdf`]));
  assert.equal((await as(student, `select name from storage.objects where name = $1`, [mine])).length, 0);
  assert.equal((await as(teacher, `select name from storage.objects where name = $1`, [mine])).length, 1);
  // Šimon má práci uzavřenou — nahrát už nesmí.
  await assert.rejects(() => as(student, `insert into storage.objects (bucket_id, name) values ('odevzdani', $1)`, [`${task.id}/${student}/pozde.pdf`]));
});

await test("soubory k úkolu: nahrává vyučující, čtou zapsaní studenti", async () => {
  const file = `${task.id}/1760000000000-podklady.pdf`;
  await assert.rejects(() => as(student, `insert into storage.objects (bucket_id, name) values ('materialy', $1)`, [`${task.id}/podvrh.pdf`]));
  await assert.rejects(() => as(teacher2, `insert into storage.objects (bucket_id, name) values ('materialy', $1)`, [`${task.id}/cizi.pdf`]));
  await as(teacher, `insert into storage.objects (bucket_id, name) values ('materialy', $1)`, [file]);
  assert.equal((await as(student, `select name from storage.objects where bucket_id = 'materialy'`)).length, 1);
  assert.equal((await as(outsider, `select name from storage.objects where bucket_id = 'materialy'`)).length, 0);
  assert.equal((await as(teacher2, `select name from storage.objects where bucket_id = 'materialy'`)).length, 0);
  assert.equal((await as(student, `delete from storage.objects where bucket_id = 'materialy' returning name`)).length, 0);
  assert.equal((await as(teacher, `delete from storage.objects where bucket_id = 'materialy' returning name`)).length, 1);
});

await test("student je v jednu dobu jen v jednom ateliéru, kurzů může mít víc", async () => {
  const { rows: [blok] } = await db.query(`insert into public.blocks (name, starts_on, ends_on) values ('Kurzové období 2', '2026-11-02', '2026-12-18') returning id`);
  const mk = async (slug, kind, s, e) =>
    (await db.query(
      `insert into public.activities (slug, kind, title, teacher_id, block_id, starts_on, ends_on) values ($1, $2, $1, $3, $4, $5, $6) returning id`,
      [slug, kind, teacher2, blok.id, s, e],
    )).rows[0].id;
  const enroll = (activity) => as(admin, `insert into public.enrollments (activity_id, student_id) values ($1, $2) returning student_id`, [activity, student2]);
  const a1 = await mk("atelier-a", "atelier", "2026-11-02", "2026-11-20");
  const a2 = await mk("atelier-b", "atelier", "2026-11-23", "2026-12-11");
  const a3 = await mk("atelier-c", "atelier", "2026-11-16", "2026-11-27");
  assert.equal((await enroll(a1)).length, 1);
  assert.equal((await enroll(a2)).length, 1, "navazující ateliér jde");
  await assert.rejects(() => enroll(a3), /ateliéru „atelier-a“/);
  // Ateliér bez vlastních dat trvá celé období → překrývá se.
  const a4 = await mk("atelier-d", "atelier", null, null);
  await assert.rejects(() => enroll(a4));
  // Kurzy ve stejném období se nehlídají.
  const k1 = await mk("kurz-x", "kurz", null, null);
  const k2 = await mk("kurz-y", "kurz", null, null);
  assert.equal((await enroll(k1)).length, 1);
  assert.equal((await enroll(k2)).length, 1);
  // Posunutí termínu, které by vytvořilo překryv, databáze nepustí.
  await assert.rejects(() => db.query(`update public.activities set starts_on = '2026-11-10' where id = $1`, [a2]), /překrýval/);
  await db.query(`update public.activities set ends_on = '2026-12-18' where id = $1`, [a2]);
});

await test("místo je nepovinné a data aktivity musí dávat smysl", async () => {
  const ok = await as(teacher, `insert into public.activities (slug, kind, title, teacher_id) values ('online-kurz', 'kurz', 'Online', $1) returning location`, [teacher]);
  assert.equal(ok[0].location, null);
  await assert.rejects(() =>
    as(teacher, `insert into public.activities (slug, kind, title, teacher_id, starts_on, ends_on) values ('spatne', 'ostatni', 'X', $1, '2026-11-10', '2026-11-09')`, [teacher]),
  );
});

// ---------------------------------------------------------------------------
// Etapa 3: nástěnka, chat, zprávy, notifikace
// ---------------------------------------------------------------------------

await test("nástěnka: píše vyučující třídy, čte a komentuje jen třída", async () => {
  const [post] = await as(teacher, `insert into public.posts (activity_id, body) values ($1, 'Zítra začínáme dřív.') returning id`, [course.id]);
  await assert.rejects(() => as(student, `insert into public.posts (activity_id, body) values ($1, 'Ahoj')`, [course.id]));
  await assert.rejects(() => as(teacher2, `insert into public.posts (activity_id, body) values ($1, 'Cizí')`, [course.id]));
  assert.equal((await as(admin, `insert into public.posts (activity_id, body) values ($1, 'Od vedení') returning id`, [course.id])).length, 1);
  assert.equal((await as(student, `select id from public.posts where activity_id = $1`, [course.id])).length, 2);
  assert.equal((await as(outsider, `select id from public.posts`)).length, 0);
  assert.equal((await as(teacher2, `select id from public.posts`)).length, 0);
  await as(student, `insert into public.post_comments (post_id, body) values ($1, 'Díky!')`, [post.id]);
  await assert.rejects(() => as(outsider, `insert into public.post_comments (post_id, body) values ($1, 'Já taky')`, [post.id]));
  // Student nemůže smazat cizí komentář ani příspěvek, vyučující může.
  const [c2] = await as(student2, `insert into public.post_comments (post_id, body) values ($1, 'Super') returning id`, [post.id]);
  assert.equal((await as(student, `delete from public.post_comments where id = $1 returning id`, [c2.id])).length, 0);
  assert.equal((await as(student, `delete from public.posts where id = $1 returning id`, [post.id])).length, 0);
  assert.equal((await as(teacher, `delete from public.post_comments where id = $1 returning id`, [c2.id])).length, 1);
});

await test("nástěnka: notifikace studentům a autorovi příspěvku", async () => {
  const before = (await as(student, `select id from public.notifications where kind = 'oznameni'`)).length;
  const teacherBefore = (await as(teacher, `select id from public.notifications where kind = 'oznameni'`)).length;
  const [post] = await as(teacher, `insert into public.posts (activity_id, body) values ($1, 'Nový rozpis') returning id`, [course.id]);
  const mine = await as(student, `select title, href from public.notifications where kind = 'oznameni'`);
  assert.equal(mine.length, before + 1);
  assert.equal(mine.at(-1).href, "/kurzy/literatura-ve-filmu");
  assert.equal((await as(teacher, `select id from public.notifications where kind = 'oznameni'`)).length, teacherBefore, "autor sám sobě ne");
  await as(student, `insert into public.post_comments (post_id, body) values ($1, 'Ok')`, [post.id]);
  assert.ok((await as(teacher, `select title from public.notifications where kind = 'komentar'`)).some((n) => n.title.includes("okomentoval")));
  // Cizí notifikace nikdo nevidí a sám si je nikdo nezaloží.
  assert.equal((await as(student2, `select id from public.notifications where user_id = $1`, [student])).length, 0);
  await assert.rejects(() => as(student, `insert into public.notifications (user_id, kind, title) values ($1, 'x', 'x')`, [student2]));
  await assert.rejects(() => as(student, `select public.notify(array[$1::uuid], 'x', 'x', null, null)`, [student2]));
});

await test("chat třídy: jen pro třídu, mazat smí autor a vyučující", async () => {
  const [m] = await as(student, `insert into public.class_messages (activity_id, body) values ($1, 'Ahoj všichni') returning id`, [course.id]);
  await assert.rejects(() => as(outsider, `insert into public.class_messages (activity_id, body) values ($1, 'Haló')`, [course.id]));
  assert.equal((await as(student2, `select id from public.class_messages`)).length, 1);
  assert.equal((await as(outsider, `select id from public.class_messages`)).length, 0);
  assert.equal((await as(student2, `delete from public.class_messages where id = $1 returning id`, [m.id])).length, 0);
  assert.equal((await as(teacher, `delete from public.class_messages where id = $1 returning id`, [m.id])).length, 1);
});

await test("zprávy: konverzace dvou lidí, třetí nic nevidí", async () => {
  const [{ start_conversation: conv }] = await as(student, `select public.start_conversation($1)`, [teacher]);
  const [{ start_conversation: again }] = await as(teacher, `select public.start_conversation($1)`, [student]);
  assert.equal(conv, again, "stejná dvojice = stejná konverzace");
  await assert.rejects(() => as(student, `select public.start_conversation($1)`, [student]));
  await as(student, `insert into public.messages (conversation_id, body) values ($1, 'Dobrý den')`, [conv]);
  await as(teacher, `insert into public.messages (conversation_id, body) values ($1, 'Dobrý den, Šimone')`, [conv]);
  assert.equal((await as(student2, `select id from public.messages`)).length, 0);
  await assert.rejects(() => as(student2, `insert into public.messages (conversation_id, body) values ($1, 'Vlezu')`, [conv]));
  await assert.rejects(() => as(student, `insert into public.messages (conversation_id, body, file_path) values ($1, '', 'jina-slozka/x.pdf')`, [conv]));
  // Nepřečtené: student má 1 (od učitele), učitel 0 (svou zprávu má přečtenou).
  const [s] = await as(student, `select other_id, unread, last_body from public.my_conversations()`);
  assert.equal(s.other_id, teacher);
  assert.equal(s.unread, 1);
  assert.equal(s.last_body, "Dobrý den, Šimone");
  assert.equal((await as(teacher, `select unread from public.my_conversations()`))[0].unread, 0);
  await as(student, `update public.conversation_members set last_read_at = now() + interval '1 second' where conversation_id = $1 and user_id = $2`, [conv, student]);
  assert.equal((await as(student, `select unread from public.my_conversations()`))[0].unread, 0);
  // Cizí řádek „přečteno“ změnit nejde.
  assert.equal((await as(student, `update public.conversation_members set last_read_at = now() where user_id = $1 returning user_id`, [teacher])).length, 0);
  // Přílohy: jen účastníci.
  await as(student, `insert into storage.objects (bucket_id, name) values ('zpravy', $1)`, [`${conv}/1-a.pdf`]);
  await assert.rejects(() => as(student2, `insert into storage.objects (bucket_id, name) values ('zpravy', $1)`, [`${conv}/1-b.pdf`]));
  assert.equal((await as(student2, `select name from storage.objects where bucket_id = 'zpravy'`)).length, 0);
  assert.equal((await as(teacher, `select name from storage.objects where bucket_id = 'zpravy'`)).length, 1);
});

await test("notifikace: nový úkol, odevzdání, hodnocení a komentář", async () => {
  const [a] = await as(teacher, `insert into public.assignments (activity_id, title, created_by) values ($1, 'Esej o filmu', $2) returning id`, [course.id, teacher]);
  const got = async (uid, kind) => (await as(uid, `select title, href from public.notifications where kind = $1 and href like $2`, [kind, `/ukoly/${a.id}%`]));
  assert.equal((await got(student, "ukol")).length, 1);
  assert.equal((await got(student2, "ukol")).length, 1);
  await as(student, `insert into public.submissions (assignment_id, student_id, status) values ($1, $2, 'odevzdano')`, [a.id, student]);
  assert.equal((await got(teacher, "odevzdani")).length, 1);
  await as(teacher, `insert into public.reviews (assignment_id, student_id, result, request, reviewed_by) values ($1, $2, 'vraceno', 'Doplň závěr.', $3)`, [a.id, student, teacher]);
  const r = await got(student, "hodnoceni");
  assert.equal(r.length, 1);
  assert.match(r[0].title, /vrácený/);
  // Znovuodevzdání po vrácení učitele znovu upozorní.
  await as(student, `update public.submissions set note = 'doplněno', status = 'odevzdano' where assignment_id = $1 and student_id = $2`, [a.id, student]);
  assert.equal((await got(teacher, "odevzdani")).length, 2);
  await as(student, `insert into public.assignment_comments (assignment_id, student_id, author_id, body) values ($1, $2, $2, 'Je to dobře?')`, [a.id, student]);
  assert.equal((await got(teacher, "komentar")).length, 1);
  // Označit přečtené smí jen svoje.
  assert.equal((await as(student, `update public.notifications set read_at = now() returning id`)).length >= 1, true);
  assert.equal((await as(student, `update public.notifications set title = 'x' returning id`).catch(() => "zamítnuto")), "zamítnuto");
});

await test("příspěvky: přílohy nahrává vyučující, čte třída", async () => {
  await as(teacher, `insert into storage.objects (bucket_id, name) values ('prispevky', $1)`, [`${course.id}/1-rozpis.pdf`]);
  await assert.rejects(() => as(student, `insert into storage.objects (bucket_id, name) values ('prispevky', $1)`, [`${course.id}/2-x.pdf`]));
  assert.equal((await as(student, `select name from storage.objects where bucket_id = 'prispevky'`)).length, 1);
  assert.equal((await as(outsider, `select name from storage.objects where bucket_id = 'prispevky'`)).length, 0);
});

// ---------------------------------------------------------------------------
// Expedice, události, spoluvyučující
// ---------------------------------------------------------------------------

await test("expedice: student jen na jedné naráz, spoluvyučující spravuje", async () => {
  const mk = async (slug, lead) =>
    (await db.query(
      `insert into public.activities (slug, kind, title, teacher_id, starts_on, ends_on) values ($1, 'expedice', $1, $2, '2026-11-16', '2026-11-20') returning id`,
      [slug, lead],
    )).rows[0].id;
  const e1 = await mk("expedice-sumava", teacher);
  const e2 = await mk("expedice-krkonose", teacher2);
  // Spoluvyučující: učitel ano, student ne.
  await as(teacher, `insert into public.activity_teachers (activity_id, teacher_id) values ($1, $2)`, [e1, teacher2]);
  await assert.rejects(() => as(teacher, `insert into public.activity_teachers (activity_id, teacher_id) values ($1, $2)`, [e1, student]), /učitel nebo admin/);
  await assert.rejects(() => as(student, `insert into public.activity_teachers (activity_id, teacher_id) values ($1, $2)`, [e2, teacher]));
  // Spoluvyučující zapisuje studenty a mění Meet.
  assert.equal((await as(teacher2, `insert into public.enrollments (activity_id, student_id) values ($1, $2) returning student_id`, [e1, student])).length, 1);
  assert.equal((await as(teacher2, `update public.activities set meet_url = 'https://meet.google.com/aaa-bbbb-ccc' where id = $1 returning id`, [e1])).length, 1);
  // Druhá expedice ve stejném týdnu nejde.
  await assert.rejects(() => as(teacher2, `insert into public.enrollments (activity_id, student_id) values ($1, $2)`, [e2, student]), /expedici „expedice-sumava“/);
  // Spoluvyučující dostává notifikace o odevzdání.
  const [a] = await as(teacher, `insert into public.assignments (activity_id, title, created_by) values ($1, 'Deník z cesty', $2) returning id`, [e1, teacher]);
  await as(student, `insert into public.submissions (assignment_id, student_id, status) values ($1, $2, 'odevzdano')`, [a.id, student]);
  assert.equal((await as(teacher2, `select id from public.notifications where kind = 'odevzdani' and href like $1`, [`/ukoly/${a.id}%`])).length, 1);
  assert.equal((await as(teacher, `select id from public.notifications where kind = 'odevzdani' and href like $1`, [`/ukoly/${a.id}%`])).length, 1);
  // Odkaz na expedici vede do sekce Expedice.
  const [{ class_href }] = await db.query(`select public.class_href($1)`, [e1]).then((r) => r.rows);
  assert.equal(class_href, "/expedice/expedice-sumava");
});

await test("chat třídy: přílohy jen pro třídu, zprávy notifikují příjemce", async () => {
  await as(student, `insert into storage.objects (bucket_id, name) values ('chat', $1)`, [`${course.id}/1-foto.jpg`]);
  await assert.rejects(() => as(outsider, `insert into storage.objects (bucket_id, name) values ('chat', $1)`, [`${course.id}/1-x.jpg`]));
  assert.equal((await as(student2, `select name from storage.objects where bucket_id = 'chat'`)).length, 1);
  assert.equal((await as(outsider, `select name from storage.objects where bucket_id = 'chat'`)).length, 0);
  // Spolužák cizí soubor nesmaže, autor a vyučující ano.
  assert.equal((await as(student2, `delete from storage.objects where bucket_id = 'chat' returning name`)).length, 0);
  assert.equal((await as(student, `delete from storage.objects where bucket_id = 'chat' returning name`)).length, 1);
  // Zpráva jen s přílohou.
  const [m] = await as(student, `insert into public.class_messages (activity_id, file_path, file_name) values ($1, $2, 'foto.jpg') returning body`, [course.id, `${course.id}/2-foto.jpg`]);
  assert.equal(m.body, "");
  await assert.rejects(() => as(student, `insert into public.class_messages (activity_id, body) values ($1, '   ')`, [course.id]));
  await assert.rejects(() => as(student, `insert into public.class_messages (activity_id, file_path) values ($1, 'jina/x.jpg')`, [course.id]));

  // Soukromé zprávy: příjemce má jednu nepřečtenou notifikaci na konverzaci.
  const [{ start_conversation: conv }] = await as(student2, `select public.start_conversation($1)`, [teacher2]);
  await as(student2, `insert into public.messages (conversation_id, body) values ($1, 'Dobrý den')`, [conv]);
  await as(student2, `insert into public.messages (conversation_id, body) values ($1, 'Mám dotaz k expedici')`, [conv]);
  const n = await as(teacher2, `select title, body, href from public.notifications where kind = 'zprava'`);
  assert.equal(n.length, 1);
  assert.equal(n[0].body, "Mám dotaz k expedici");
  assert.equal(n[0].href, `/zpravy?k=${conv}`);
  assert.equal((await as(student2, `select id from public.notifications where kind = 'zprava'`)).length, 0, "odesílatel nic");
});

await test("telefon: učitele vidí všichni, studenta jen učitelé a admin", async () => {
  await as(teacher, `insert into public.profile_contacts (user_id, phone) values ($1, '+420 777 111 222')`, [teacher]);
  await as(student, `insert into public.profile_contacts (user_id, phone) values ($1, '777 333 444')`, [student]);
  await assert.rejects(() => as(student, `insert into public.profile_contacts (user_id, phone) values ($1, '777 000 000')`, [student2]));
  await assert.rejects(() => as(student2, `insert into public.profile_contacts (user_id, phone) values ($1, 'zavolej mi')`, [student2]));
  const seen = async (uid) => (await as(uid, `select user_id from public.profile_contacts`)).map((r) => r.user_id).sort();
  assert.deepEqual(await seen(student2), [teacher], "student vidí jen učitele");
  assert.deepEqual(await seen(student), [teacher, student].sort(), "student vidí sebe a učitele");
  assert.deepEqual(await seen(teacher2), [teacher, student].sort(), "učitel vidí všechny");
  assert.equal((await as(student2, `update public.profile_contacts set phone = '777 999 999' returning user_id`)).length, 0);
  assert.equal((await as(outsider, `select user_id from public.profile_contacts`)).length, 1);
});

await test("týmy úkolu: rozděluje vyučující, student jen v jednom týmu", async () => {
  const [a] = await as(teacher, `insert into public.assignments (activity_id, title, created_by, team_work, max_points) values ($1, 'Týmová prezentace', $2, true, 10) returning id`, [course.id, teacher]);
  const [tA] = await as(teacher, `insert into public.teams (assignment_id, name) values ($1, 'Tým A') returning id`, [a.id]);
  const [tB] = await as(teacher, `insert into public.teams (assignment_id, name) values ($1, 'Tým B') returning id`, [a.id]);
  await assert.rejects(() => as(student, `insert into public.teams (assignment_id, name) values ($1, 'Můj')`, [a.id]));
  await assert.rejects(() => as(teacher2, `insert into public.teams (assignment_id, name) values ($1, 'Cizí')`, [a.id]));
  await as(teacher, `insert into public.team_members (team_id, student_id) values ($1, $2), ($1, $3)`, [tA.id, student, student2]);
  await assert.rejects(() => as(teacher, `insert into public.team_members (team_id, student_id) values ($1, $2)`, [tB.id, student]), /duplicate|unique/);
  await assert.rejects(() => as(teacher, `insert into public.team_members (team_id, student_id) values ($1, $2)`, [tB.id, outsider]), /zapsaný ve třídě/);
  // V režimu „rozdělí vyučující“ se student sám nepřidá.
  await assert.rejects(() => as(student, `select public.join_team($1)`, [tB.id]), /rozděluje vyučující/);
  assert.equal((await as(student2, `select student_id from public.team_members where assignment_id = $1`, [a.id])).length, 2);
  assert.equal((await as(outsider, `select id from public.teams`)).length, 0);
});

await test("týmový úkol: společná práce a soubory, hodnocení týmu i jednotlivce", async () => {
  const [a] = await as(teacher, `select id from public.assignments where title = 'Týmová prezentace'`);
  const [{ id: team }] = await as(teacher, `select id from public.teams where name = 'Tým A'`);
  await as(student, `insert into public.submissions (assignment_id, student_id, status, note) values ($1, $2, 'odevzdano', 'Za tým A')`, [a.id, student]);
  const [eliot] = await as(student2, `select status, note from public.submissions where assignment_id = $1`, [a.id]);
  assert.deepEqual(eliot, { status: "odevzdano", note: "Za tým A" });
  const n = await as(teacher, `select title from public.notifications where kind = 'odevzdani' and href like $1`, [`/ukoly/${a.id}%`]);
  assert.equal(n.length, 1);
  assert.match(n[0].title, /Tým A/);
  await as(student2, `insert into storage.objects (bucket_id, name) values ('odevzdani', $1)`, [`${a.id}/${team}/slajdy.pdf`]);
  assert.equal((await as(student, `select name from storage.objects where name = $1`, [`${a.id}/${team}/slajdy.pdf`])).length, 1);
  await assert.rejects(() => as(outsider, `insert into storage.objects (bucket_id, name) values ('odevzdani', $1)`, [`${a.id}/${team}/x.pdf`]));
  // Hodnocení celého týmu.
  await as(teacher, `insert into public.reviews (assignment_id, student_id, result, points, feedback, reviewed_by) values ($1, $2, 'splneno', 9, 'Výborně', $3)`, [a.id, student, teacher]);
  assert.deepEqual((await as(student2, `select result, points from public.reviews where assignment_id = $1`, [a.id]))[0], { result: "splneno", points: 9 });
  // Individuální úprava jednoho člena (nepracoval) …
  await as(teacher, `update public.reviews set result = 'nesplneno', points = 2, individual = true where assignment_id = $1 and student_id = $2`, [a.id, student2]);
  assert.equal((await as(student, `select points from public.reviews where assignment_id = $1`, [a.id]))[0].points, 9, "ostatní beze změny");
  // … a pozdější přehodnocení týmu ji nepřepíše.
  await as(teacher, `update public.reviews set points = 10 where assignment_id = $1 and student_id = $2`, [a.id, student]);
  assert.equal((await as(student2, `select points from public.reviews where assignment_id = $1`, [a.id]))[0].points, 2);
});

await test("týmy: studenti se rozdělí sami (max. velikost, odchod, prázdný tým zmizí)", async () => {
  const [a] = await as(teacher, `insert into public.assignments (activity_id, title, created_by, team_work, team_mode, team_max_size) values ($1, 'Projekt ve dvojicích', $2, true, 'students', 2) returning id`, [course.id, teacher]);
  const [{ create_own_team: t1 }] = await as(student, `select public.create_own_team($1, 'Šimonův tým')`, [a.id]);
  await assert.rejects(() => as(student, `select public.create_own_team($1, 'Druhý')`, [a.id]), /Už jsi v týmu/);
  await as(student2, `select public.join_team($1)`, [t1]);
  // Třetí do dvojice nesmí (outsider ani není ve třídě).
  await assert.rejects(() => as(outsider, `select public.join_team($1)`, [t1]));
  const extra = await createUser("treti.student@scioskola.cz", {}, { full_name: "Třetí Student" });
  await db.query(`insert into public.enrollments (activity_id, student_id) values ($1, $2)`, [course.id, extra]);
  await assert.rejects(() => as(extra, `select public.join_team($1)`, [t1]), /plný/);
  // Odchod: tým zůstane, dokud v něm někdo je.
  await as(student2, `select public.leave_team($1)`, [t1]);
  await as(student, `select public.leave_team($1)`, [t1]);
  assert.equal((await db.query(`select 1 from public.teams where id = $1`, [t1])).rows.length, 0);
});

await test("týmový chat: jen tým a vyučující", async () => {
  const [{ id: team }] = await as(teacher, `select id from public.teams where name = 'Tým A'`);
  const [{ id: teamB }] = await as(teacher, `select id from public.teams where name = 'Tým B'`);
  await as(student, `insert into public.team_messages (team_id, body) values ($1, 'Kdo dělá úvod?')`, [team]);
  await assert.rejects(() => as(student, `insert into public.team_messages (team_id, body) values ($1, 'Vlezu k vám')`, [teamB]));
  assert.equal((await as(student2, `select id from public.team_messages`)).length, 1);
  assert.equal((await as(teacher, `select id from public.team_messages`)).length, 1);
  assert.equal((await as(outsider, `select id from public.team_messages`)).length, 0);
  await as(student, `insert into storage.objects (bucket_id, name) values ('tymy', $1)`, [`${team}/1-osnova.pdf`]);
  await assert.rejects(() => as(student, `insert into storage.objects (bucket_id, name) values ('tymy', $1)`, [`${teamB}/1-x.pdf`]));
  // Odepsaný student vypadne z týmu.
  await db.query(`delete from public.enrollments where activity_id = $1 and student_id = $2`, [course.id, student2]);
  assert.equal((await db.query(`select 1 from public.team_members where student_id = $1`, [student2])).rows.length, 0);
  await db.query(`insert into public.enrollments (activity_id, student_id) values ($1, $2)`, [course.id, student2]);
});


// ---------------------------------------------------------------------------
// Zápisy
// ---------------------------------------------------------------------------

const { rows: [{ id: block2 }] } = await db.query(
  `insert into public.blocks (name, starts_on, ends_on, enroll_opens_at, enroll_closes_at)
   values ('Období 2', current_date + 30, current_date + 90, now() - interval '1 hour', now() + interval '1 day') returning id`,
);

async function newCourse(slug, weekday, from, to, capacity = null, extra = {}) {
  const [row] = await as(
    teacher,
    `insert into public.activities (slug, kind, title, teacher_id, block_id, capacity, allowed_grades)
     values ($1, 'kurz', $1, $2, $3, $4, $5) returning id`,
    [slug, teacher, extra.block ?? block2, capacity, extra.grades ?? null],
  );
  await as(teacher, `insert into public.activity_slots (activity_id, weekday, starts_at, ends_at) values ($1, $2, $3, $4)`, [row.id, weekday, from, to]);
  return row.id;
}

await test("zápisy: nový kurz je rozpracovaný, studenti ho nevidí a nezapíšou se", async () => {
  const id = await newCourse("chemie-leku", 3, "10:00", "11:00", 1);
  assert.equal((await as(student, `select id from public.activities where id = $1`, [id])).length, 0);
  assert.equal((await as(teacher2, `select id from public.activities where id = $1`, [id])).length, 1);
  await assert.rejects(() => as(student, `select public.enroll_self($1)`, [id]), /neprobíhá/);
});

await test("zápisy: učitel potvrdí hotovo, admin zveřejní období a studenti dostanou oznámení", async () => {
  await as(teacher, `insert into public.block_ready (block_id) values ($1)`, [block2]);
  await assert.rejects(() => as(teacher, `insert into public.block_ready (block_id, teacher_id) values ($1, $2)`, [block2, teacher2]));
  assert.equal((await as(student, `select * from public.block_ready`)).length, 0);
  await assert.rejects(() => as(teacher, `select public.publish_block($1)`, [block2]), /admin/);
  const before = (await db.query(`select count(*)::int n from public.notifications where user_id = $1`, [student])).rows[0].n;
  await as(admin, `select public.publish_block($1)`, [block2]);
  const [{ id }] = await as(student, `select id from public.activities where slug = 'chemie-leku'`);
  assert.ok(id);
  const after = (await db.query(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'zapis'`, [student])).rows[0].n;
  assert.ok(after > 0 && after + before > before);
});

await test("zápisy: kapacitu nejde překročit, plný kurz má čekací řadu", async () => {
  const [{ id }] = await as(student, `select id from public.activities where slug = 'chemie-leku'`);
  await as(student, `select public.enroll_self($1)`, [id]);
  await assert.rejects(() => as(student2, `select public.enroll_self($1)`, [id]), /plno/);
  await as(student2, `select public.join_waitlist($1)`, [id]);
  const [row] = await as(student2, `select enrolled, waiting, my_position from public.enrollment_overview() where activity_id = $1`, [id]);
  assert.deepEqual(row, { enrolled: 1, waiting: 1, my_position: 1 });
  // Do enrollments napřímo student nezapíše.
  await assert.rejects(() => as(student2, `insert into public.enrollments (activity_id, student_id) values ($1, $2)`, [id, student2]));
  // Na čekačku jen u plného kurzu.
  const free = await newCourse("jak-cist-film", 4, "12:00", "13:00", 10, { grades: [3, 4] });
  await as(admin, `select public.publish_block($1)`, [block2]);
  await assert.rejects(() => as(student, `select public.join_waitlist($1)`, [free]), /volné/);
});

await test("zápisy: nejde se zapsat na nic, co se časově kříží", async () => {
  const clash = await newCourse("cestomanie", 3, "10:30", "11:30", 20);
  await as(admin, `select public.publish_block($1)`, [block2]);
  await assert.rejects(() => as(student, `select public.enroll_self($1)`, [clash]), /Kříží se s „chemie-leku“/);
  // Jiný den nevadí.
  const other = await newCourse("komplexni-cisla", 5, "10:00", "11:00", 20);
  await as(admin, `select public.publish_block($1)`, [block2]);
  await as(student, `select public.enroll_self($1)`, [other]);
});

await test("zápisy: odhlášení posune prvního z čekačky a ten dostane notifikaci", async () => {
  const [{ id }] = await as(student, `select id from public.activities where slug = 'chemie-leku'`);
  await as(student, `select public.leave_self($1)`, [id]);
  const enrolled = (await db.query(`select student_id from public.enrollments where activity_id = $1`, [id])).rows.map((r) => r.student_id);
  assert.deepEqual(enrolled, [student2]);
  assert.equal((await db.query(`select 1 from public.waitlist where activity_id = $1`, [id])).rows.length, 0);
  const n = await db.query(`select title from public.notifications where user_id = $1 and kind = 'zapis' and title like 'Uvolnilo%'`, [student2]);
  assert.equal(n.rows.length, 1);
});

await test("zápisy: z čekačky se přeskočí ten, komu se kurz mezitím kříží", async () => {
  const [{ id }] = await as(student, `select id from public.activities where slug = 'chemie-leku'`);
  // student2 je zapsaný (kapacita 1); student a třetí čekají, student si mezitím zapíše kolizní kurz.
  const extra = (await db.query(`select id from public.profiles where email = 'treti.student@scioskola.cz'`)).rows[0].id;
  await as(student, `select public.join_waitlist($1)`, [id]);
  await as(extra, `select public.join_waitlist($1)`, [id]);
  const [{ id: clash }] = await as(student, `select id from public.activities where slug = 'cestomanie'`);
  await as(student, `select public.enroll_self($1)`, [clash]);
  await as(student2, `select public.leave_self($1)`, [id]);
  const enrolled = (await db.query(`select student_id from public.enrollments where activity_id = $1`, [id])).rows.map((r) => r.student_id);
  assert.deepEqual(enrolled, [extra]);
  assert.equal((await as(student, `select my_position from public.enrollment_overview() where activity_id = $1`, [id]))[0].my_position, 1);
  await as(student, `select public.leave_waitlist($1)`, [id]);
  assert.equal((await as(student, `select my_position from public.enrollment_overview() where activity_id = $1`, [id]))[0].my_position, null);
});

await test("zápisy: ročník, role a termín zápisu", async () => {
  const [{ id: film }] = await as(student, `select id from public.activities where slug = 'jak-cist-film'`);
  await assert.rejects(() => as(outsider, `select public.enroll_self($1)`, [film]), /ročník/);
  await assert.rejects(() => as(teacher, `select public.enroll_self($1)`, [film]), /jen studenti/);
  await as(student, `select public.enroll_self($1)`, [film]);
  // Po konci zápisu se student sám neodhlásí, vyučující ho odepsat může.
  await db.query(`update public.blocks set enroll_closes_at = now() - interval '1 minute', enroll_opens_at = now() - interval '2 hours' where id = $1`, [block2]);
  await assert.rejects(() => as(student, `select public.leave_self($1)`, [film]), /skončil/);
  await assert.rejects(() => as(student2, `select public.enroll_self($1)`, [film]), /neprobíhá/);
  await as(teacher, `delete from public.enrollments where activity_id = $1 and student_id = $2`, [film, student]);
});

await test("zápisová kola: ateliéry vyhlašují učitelé hromadně, jeden ateliér naráz", async () => {
  const mk = async (slug, from, to, owner = teacher2) => {
    const [row] = await as(
      owner,
      `insert into public.activities (slug, kind, title, teacher_id, starts_on, ends_on, capacity)
       values ($1, 'atelier', $1, $2, current_date + $3::int, current_date + $4::int, 10) returning id`,
      [slug, owner, from, to],
    );
    return row.id;
  };
  const kid = await createUser("ateliery.student@scioskola.cz", { grade: "2" }, { full_name: "Nový Student" });
  const a1 = await mk("sachy-2", 40, 60);
  const a2 = await mk("pamet-2", 40, 60);
  const a3 = await mk("foto-2", 70, 80);
  const mine = await mk("debata-2", 70, 80, teacher);
  // Rozpracovaný ateliér studenti nevidí.
  assert.equal((await as(kid, `select id from public.activities where id = $1`, [a1])).length, 0);
  // Cizí nepřipravený ateliér vyhlásit nejde, připravený ano.
  await assert.rejects(() => as(teacher, `select public.announce_round('atelier', now() - interval '1 hour', now() + interval '1 day', $1)`, [[a1, mine]]), /vyhlásit nejde/);
  await as(teacher2, `update public.activities set announce_ready = true where id = any($1)`, [[a1, a2]]);
  const before = (await db.query(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'zapis'`, [kid])).rows[0].n;
  const [{ announce_round: round }] = await as(
    teacher,
    `select public.announce_round('atelier', now() - interval '1 hour', now() + interval '1 day', $1)`,
    [[a1, a2, mine]],
  );
  const after = (await db.query(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'zapis'`, [kid])).rows[0].n;
  assert.equal(after - before, 1, "jedno oznámení za celé kolo");
  // Další kolo ateliérů, dokud tohle neskončí, vyhlásit nejde.
  await as(teacher2, `update public.activities set announce_ready = true where id = $1`, [a3]);
  await assert.rejects(() => as(teacher2, `select public.announce_round('atelier', now(), now() + interval '2 days', $1)`, [[a3]]), /už je vyhlášený/);
  await as(teacher2, `select public.join_round($1, $2)`, [round, a3]);
  // Student: dva souběžné ateliéry ne, pozdější ano.
  await as(kid, `select public.enroll_self($1)`, [a1]);
  await assert.rejects(() => as(kid, `select public.enroll_self($1)`, [a2]), /Kříží se/);
  await as(kid, `select public.enroll_self($1)`, [a3]);
  // Běžící zápis nejde stáhnout; termín mění autor kola nebo admin.
  await assert.rejects(() => as(teacher2, `select public.leave_round($1)`, [a1]), /běží/);
  await assert.rejects(() => as(teacher2, `select public.update_round($1, now() - interval '1 hour', now() + interval '3 days')`, [round]), /vyhlásil/);
  await assert.rejects(() => as(student, `select public.announce_round('atelier', now(), now() + interval '1 day', $1)`, [[a1]]), /učitelé/);
});

await test("zápisová kola: před otevřením jde nabídku stáhnout, prázdné kolo zmizí", async () => {
  const [row] = await as(
    teacher2,
    `insert into public.activities (slug, kind, title, teacher_id, starts_on, ends_on, announce_ready)
     values ('vlci-2', 'expedice', 'Za vlky', $1, current_date + 100, current_date + 104, true) returning id`,
    [teacher2],
  );
  const [{ announce_round: round }] = await as(
    teacher2,
    `select public.announce_round('expedice', now() + interval '1 day', now() + interval '2 days', $1)`,
    [[row.id]],
  );
  await assert.rejects(() => as(student, `select public.enroll_self($1)`, [row.id]), /neprobíhá/);
  await as(teacher2, `select public.update_round($1, now() + interval '2 days', now() + interval '3 days')`, [round]);
  await as(teacher2, `select public.leave_round($1)`, [row.id]);
  assert.equal((await db.query(`select 1 from public.enroll_rounds where id = $1`, [round])).rows.length, 0);
  const [a] = (await db.query(`select published, announce_ready, round_id from public.activities where id = $1`, [row.id])).rows;
  assert.deepEqual(a, { published: false, announce_ready: true, round_id: null });
});

await test("termíny: zadává admin, ateliér z termínu převezme data a období", async () => {
  await assert.rejects(() => as(teacher, `insert into public.activity_terms (kind, starts_on, ends_on) values ('atelier', current_date + 30, current_date + 50)`));
  const [{ id: term }] = await as(
    admin,
    `insert into public.activity_terms (kind, name, starts_on, ends_on) values ('atelier', 'Ateliéry 1', current_date + 35, current_date + 55) returning id`,
  );
  const [{ id: week }] = await as(
    admin,
    `insert into public.activity_terms (kind, starts_on, ends_on) values ('expedice', current_date + 60, current_date + 64) returning id`,
  );
  assert.equal((await as(student, `select id from public.activity_terms`)).length, 2);
  const [a] = await as(
    teacher,
    `insert into public.activities (slug, kind, title, teacher_id, term_id) values ('keramika', 'atelier', 'Keramika', $1, $2)
     returning starts_on = current_date + 35 as from_ok, ends_on = current_date + 55 as to_ok, block_id`,
    [teacher, term],
  );
  assert.equal(a.from_ok && a.to_ok, true);
  const [{ id: expected }] = (await db.query(`select public.block_of(current_date + 35) as id`)).rows;
  assert.ok(a.block_id && a.block_id === expected, "období podle termínu");
  // Termín expedice se k ateliéru nehodí.
  await assert.rejects(() => as(teacher, `update public.activities set term_id = $1 where slug = 'keramika'`, [week]), /jiný druh/);
  // Posunutý termín posune ateliér.
  await as(admin, `update public.activity_terms set starts_on = current_date + 36 where id = $1`, [term]);
  const [moved] = (await db.query(`select starts_on = current_date + 36 as ok from public.activities where slug = 'keramika'`)).rows;
  assert.equal(moved.ok, true);
});

await test("zveřejnění období může vyhlásit i připravené ateliéry a expedice", async () => {
  const { rows: [{ id: block3 }] } = await db.query(
    `insert into public.blocks (name, starts_on, ends_on, enroll_opens_at, enroll_closes_at)
     values ('Období 3', current_date + 120, current_date + 180, now() + interval '2 days', now() + interval '4 days') returning id`,
  );
  await as(teacher, `update public.activities set announce_ready = true where slug = 'keramika'`);
  const [{ id: exp }] = await as(
    teacher2,
    `insert into public.activities (slug, kind, title, teacher_id, starts_on, ends_on, announce_ready)
     values ('hory-3', 'expedice', 'Hory', $1, current_date + 150, current_date + 154, true) returning id`,
    [teacher2],
  );
  const [{ publish_block: res }] = await as(admin, `select public.publish_block($1, true, true)`, [block3]);
  const [, ateliers, expeditions] = res.split(":").map(Number);
  // (připravené z dřívějších testů se zařadí taky)
  assert.ok(ateliers >= 1 && expeditions >= 1);
  // Ateliér šel do běžícího kola ateliérů, expedice do nového kola s termínem kurzů.
  const [k] = (await db.query(`select round_id is not null as in_round, published from public.activities where slug = 'keramika'`)).rows;
  assert.deepEqual(k, { in_round: true, published: true });
  const [e] = (await db.query(
    `select r.opens_at = b.enroll_opens_at as same from public.activities a join public.enroll_rounds r on r.id = a.round_id, public.blocks b
     where a.id = $1 and b.id = $2`,
    [exp, block3],
  )).rows;
  assert.equal(e.same, true);
});

await test("události pro všechny: zapíšou se všichni studenti i vyučující, i nově založení", async () => {
  const [ev] = await as(
    admin,
    `insert into public.activities (slug, kind, title, teacher_id, starts_on, ends_on, for_all_students, for_all_staff, published)
     values ('tridnicky-den', 'ostatni', 'Třídnický den', $1, current_date, current_date + 200, true, true, true) returning id`,
    [admin],
  );
  const students = (await db.query(`select count(*)::int n from public.profiles where role = 'student' and not blocked`)).rows[0].n;
  const enrolled = (await db.query(`select count(*)::int n from public.enrollments where activity_id = $1`, [ev.id])).rows[0].n;
  assert.equal(enrolled, students);
  const staff = (await db.query(`select count(*)::int n from public.profiles where role in ('ucitel', 'admin') and not blocked and id <> $1`, [admin])).rows[0].n;
  const co = (await db.query(`select count(*)::int n from public.activity_teachers where activity_id = $1`, [ev.id])).rows[0].n;
  assert.equal(co, staff);
  // Nově založený student i učitel se doplní sami.
  const fresh = await createUser("novacek@scioskola.cz", { grade: "1" }, { full_name: "Nováček" });
  const freshT = await createUser("nova.ucitelka@scioskola.cz", { role: "ucitel" }, { full_name: "Nová Učitelka" });
  assert.equal((await db.query(`select 1 from public.enrollments where activity_id = $1 and student_id = $2`, [ev.id, fresh])).rows.length, 1);
  assert.equal((await db.query(`select 1 from public.activity_teachers where activity_id = $1 and teacher_id = $2`, [ev.id, freshT])).rows.length, 1);
  // Jen pro maturanty: první ročník se nedoplní.
  const [m] = await as(
    admin,
    `insert into public.activities (slug, kind, title, teacher_id, starts_on, ends_on, for_all_students, allowed_grades)
     values ('maturitni-ples', 'ostatni', 'Ples', $1, current_date, current_date + 30, true, '{4}') returning id`,
    [admin],
  );
  assert.equal((await db.query(`select 1 from public.enrollments where activity_id = $1 and student_id = $2`, [m.id, fresh])).rows.length, 0);
});

await test("sociální sítě: každý vyplní své, vidí je všichni ve škole", async () => {
  await as(student, `insert into public.profile_socials (user_id, instagram, discord) values ($1, 'simon.liska', 'simonl')`, [student]);
  await assert.rejects(() => as(student, `insert into public.profile_socials (user_id, instagram) values ($1, 'cizi')`, [teacher]));
  await assert.rejects(() => as(student, `update public.profile_socials set instagram = 'x y' where user_id = $1`, [student]));
  assert.equal((await as(teacher2, `select instagram from public.profile_socials where user_id = $1`, [student]))[0].instagram, "simon.liska");
  await assert.rejects(() => as(null, `select * from public.profile_socials`));
  await as(teacher, `update public.profile_socials set instagram = 'hack' where user_id = $1`, [student]);
  assert.equal((await db.query(`select instagram from public.profile_socials where user_id = $1`, [student])).rows[0].instagram, "simon.liska");
});

await test("profilové fotky: každý nahraje a nastaví jen svou, vidí je škola", async () => {
  await as(student, `insert into storage.objects (bucket_id, name) values ('avatary', $1)`, [`${student}/1.jpg`]);
  await assert.rejects(() => as(student, `insert into storage.objects (bucket_id, name) values ('avatary', $1)`, [`${teacher}/1.jpg`]));
  await as(student, `update public.profiles set avatar_path = $2 where id = $1`, [student, `${student}/1.jpg`]);
  // Cizí cesta neprojde (kontrola sloupce), cizí profil nejde upravit (RLS).
  await assert.rejects(() => as(student, `update public.profiles set avatar_path = $2 where id = $1`, [student, `${teacher}/1.jpg`]));
  const r = await as(student, `update public.profiles set avatar_path = null where id = $1 returning id`, [teacher]);
  assert.equal(r.length, 0);
  assert.equal((await as(teacher2, `select name from storage.objects where bucket_id = 'avatary'`)).length, 1);
  await assert.rejects(() => as(student, `update public.profiles set role = 'admin' where id = $1`, [student]));
});

await test("barva profilu: každý mění jen svou a jen z nabídky", async () => {
  await as(student, `update public.profiles set banner_color = 'ruzova' where id = $1`, [student]);
  await assert.rejects(() => as(student, `update public.profiles set banner_color = 'neon' where id = $1`, [student]));
  const r = await as(student, `update public.profiles set banner_color = 'zelena' where id = $1 returning id`, [teacher]);
  assert.equal(r.length, 0);
});

await test("návrhy: hlasování pro/proti/jedno, práh v procentech, rozhodnutí a oznámení", async () => {
  const [p] = await as(student, `insert into public.proposals (title, body, category, goal, need_percent_proposed)
    values ('Začínat v onlinu v 10:00', 'Ráno je to brzo.', 'rozvrh', 'schvaleni', 30) returning id, need_percent`);
  // Autor hlasuje pro rovnou (počet doplní trigger až po vložení).
  assert.equal((await db.query(`select pro_count from public.proposals where id = $1`, [p.id])).rows[0].pro_count, 1);
  assert.equal(p.need_percent, null);
  await assert.rejects(() => as(student, `insert into public.proposals (title, goal, need_percent_proposed) values ('Moc', 'schvaleni', 150)`));
  await assert.rejects(() => as(student, `insert into public.proposals (title, goal, need_percent_proposed, category) values ('Budova', 'schvaleni', 10, 'prostory')`));
  // Učitelé dostali oznámení o novém návrhu.
  assert.equal((await db.query(`select 1 from public.notifications where user_id = $1 and kind = 'navrh'`, [teacher])).rows.length, 1);
  // Stav ani práh si autor sám nastavit nemůže; svůj hlas pro nezmění ani neodebere.
  await assert.rejects(() => as(student, `update public.proposals set status = 'schvaleno' where id = $1`, [p.id]));
  await assert.rejects(() => as(student, `update public.proposals set need_percent = 1 where id = $1`, [p.id]));
  await assert.rejects(() => as(student, `select public.set_proposal_need($1, 1)`, [p.id]));
  assert.equal((await as(student, `delete from public.proposal_supports where proposal_id = $1 returning 1`, [p.id])).length, 0);
  assert.equal((await as(student, `update public.proposal_supports set choice = 'proti' where proposal_id = $1 returning 1`, [p.id])).length, 0);

  // Práh tak, aby jeden hlas pro nestačil a dva ano.
  const [{ member_count: m }] = await as(admin, `select public.member_count()`);
  const n = Math.floor(200 / m);
  await assert.rejects(() => as(teacher, `select public.set_proposal_need($1, 101)`, [p.id]));
  await as(teacher, `select public.set_proposal_need($1, $2)`, [p.id, n]);
  assert.equal((await db.query(`select reached_at from public.proposals where id = $1`, [p.id])).rows[0].reached_at, null);
  await as(teacher2, `insert into public.proposal_supports (proposal_id, choice) values ($1, 'proti')`, [p.id]);
  await as(admin, `insert into public.proposal_supports (proposal_id, choice) values ($1, 'jedno')`, [p.id]);
  await as(student2, `insert into public.proposal_supports (proposal_id, choice) values ($1, 'proti')`, [p.id]);
  await as(student2, `update public.proposal_supports set choice = 'pro' where proposal_id = $1 and user_id = $2`, [p.id, student2]);
  const after = (await db.query(`select pro_count, against_count, neutral_count, reached_at from public.proposals where id = $1`, [p.id])).rows[0];
  assert.deepEqual([after.pro_count, after.against_count, after.neutral_count], [2, 1, 1]);
  assert.ok(after.reached_at, "dosaženo");
  // Hlasy jsou anonymní: každý vidí jen svůj.
  assert.equal((await as(student2, `select * from public.proposal_supports where proposal_id = $1`, [p.id])).length, 1);
  assert.equal((await as(admin, `select * from public.proposal_supports where proposal_id = $1`, [p.id])).length, 1);
  // Hlas za někoho jiného vložit nejde.
  await assert.rejects(() => as(student2, `insert into public.proposal_supports (proposal_id, user_id) values ($1, $2)`, [p.id, outsider]));

  // Projednáno nejde u návrhu ke schválení; rozhodnutí potřebuje zdůvodnění.
  await assert.rejects(() => as(teacher, `select public.resolve_proposal($1, 'projednano', 'x')`, [p.id]));
  await assert.rejects(() => as(teacher, `select public.resolve_proposal($1, 'schvaleno', '  ')`, [p.id]));
  await assert.rejects(() => as(student2, `select public.resolve_proposal($1, 'schvaleno', 'ano')`, [p.id]));
  await as(teacher, `select public.resolve_proposal($1, 'schvaleno', 'Od pololetí začínáme v 10:00.')`, [p.id]);
  const got = await db.query(`select user_id from public.notifications where title like 'Návrh schválen%'`);
  assert.deepEqual(got.rows.map((r) => r.user_id).sort(), [student, student2].sort());
  // Uzavřený návrh už hlasy nebere a hlas nejde změnit.
  await assert.rejects(() => as(outsider, `insert into public.proposal_supports (proposal_id) values ($1)`, [p.id]));
  assert.equal((await as(teacher2, `update public.proposal_supports set choice = 'pro' where proposal_id = $1 returning 1`, [p.id])).length, 0);
  await assert.rejects(() => as(teacher, `select public.resolve_proposal($1, 'zamitnuto', 'ne')`, [p.id]));
});

await test("návrhy: stažení autorem, komentáře, shromáždění", async () => {
  const [p] = await as(student2, `insert into public.proposals (title, goal, need_percent_proposed) values ('Páteční online snídaně', 'shromazdeni', 10) returning id`);
  await as(student, `insert into public.proposal_comments (proposal_id, body) values ($1, 'Super nápad')`, [p.id]);
  assert.equal((await db.query(`select 1 from public.notifications where user_id = $1 and kind = 'komentar' and href = $2`, [student2, `/navrhy/${p.id}`])).rows.length, 1);
  await assert.rejects(() => as(student, `select public.withdraw_proposal($1)`, [p.id]));
  await as(student2, `select public.withdraw_proposal($1)`, [p.id]);
  assert.equal((await db.query(`select status from public.proposals where id = $1`, [p.id])).rows[0].status, "stazeno");
  const [q] = await as(student, `insert into public.proposals (title, goal, need_percent_proposed) values ('Shromáždění každý týden', 'shromazdeni', 1) returning id`);
  await assert.rejects(() => as(teacher, `select public.resolve_proposal($1, 'schvaleno', 'x')`, [q.id]));
  await as(admin, `select public.resolve_proposal($1, 'projednano', 'Domluveno: každé druhé pondělí.')`, [q.id]);
});

await test("hlasování: anonymní hlasy, vypsání aktivitou a oznámení", async () => {
  const [w] = await as(student, `insert into public.wishes (kind, title) values ('atelier', 'Ateliér fotografie') returning id, vote_count`);
  assert.equal((await db.query(`select vote_count from public.wishes where id = $1`, [w.id])).rows[0].vote_count, 1);
  await as(student2, `insert into public.wish_votes (wish_id) values ($1)`, [w.id]);
  await as(teacher2, `insert into public.wish_votes (wish_id) values ($1)`, [w.id]);
  assert.equal((await as(student2, `select vote_count from public.wishes where id = $1`, [w.id]))[0].vote_count, 3);
  // Kdo hlasoval, nevidí nikdo — jen svůj hlas.
  assert.equal((await as(student2, `select * from public.wish_votes where wish_id = $1`, [w.id])).length, 1);
  assert.equal((await as(admin, `select * from public.wish_votes where wish_id = $1`, [w.id])).length, 0);
  await assert.rejects(() => as(student2, `update public.wishes set vote_count = 99 where id = $1`, [w.id]));
  // Autor smazat nemůže, když ho chtějí i další.
  assert.equal((await as(student, `delete from public.wishes where id = $1 returning 1`, [w.id])).length, 0);
  await as(student2, `delete from public.wish_votes where wish_id = $1 and user_id = $2`, [w.id, student2]);
  assert.equal((await db.query(`select vote_count from public.wishes where id = $1`, [w.id])).rows[0].vote_count, 2);

  await assert.rejects(() => as(student, `select public.fulfil_wish($1, $2)`, [w.id, atelier.id]));
  await as(teacher, `select public.fulfil_wish($1, $2)`, [w.id, atelier.id]);
  const n = await db.query(`select user_id, href from public.notifications where kind = 'prani'`);
  assert.deepEqual(n.rows.map((r) => r.user_id).sort(), [student, teacher2].sort());
  assert.equal(n.rows[0].href, "/zapisy");
  await assert.rejects(() => as(student2, `insert into public.wish_votes (wish_id) values ($1)`, [w.id]));

  const [w2] = await as(student2, `insert into public.wishes (kind, title) values ('kurz', 'Kurz vaření') returning id`);
  await assert.rejects(() => as(teacher, `select public.close_wish($1, '')`, [w2.id]));
  await as(teacher, `select public.close_wish($1, 'Nemáme kuchyň.')`, [w2.id]);
  await as(teacher, `select public.reopen_wish($1)`, [w2.id]);
  assert.equal((await as(student2, `delete from public.wishes where id = $1 returning 1`, [w2.id])).length, 1);
});

await test("hlasování: nevypsaná přání po 14 dnech a schválená po týdnu zmizí", async () => {
  const [old] = await as(student, `insert into public.wishes (kind, title) values ('kurz', 'Staré přání') returning id`);
  const [fresh] = await as(student, `insert into public.wishes (kind, title) values ('kurz', 'Nové přání') returning id`);
  const [done] = await as(student, `insert into public.wishes (kind, title) values ('kurz', 'Vypsané přání') returning id`);
  await as(teacher, `select public.fulfil_wish($1, $2)`, [done.id, course.id]);
  await db.query(`update public.wishes set created_at = now() - interval '15 days' where id in ($1, $2)`, [old.id, done.id]);
  await as(student2, `select public.purge_expired_wishes()`);
  let left = (await db.query(`select id from public.wishes where id in ($1, $2, $3)`, [old.id, fresh.id, done.id])).rows.map((r) => r.id);
  assert.deepEqual(left.sort(), [fresh.id, done.id].sort());
  // Schválené zmizí týden po vypsání.
  await db.query(`update public.wishes set closed_at = now() - interval '8 days' where id = $1`, [done.id]);
  await as(student2, `select public.purge_expired_wishes()`);
  left = (await db.query(`select id from public.wishes where id in ($1, $2)`, [fresh.id, done.id])).rows.map((r) => r.id);
  assert.deepEqual(left, [fresh.id]);
});

await test("hlasování: smazaná vypsaná aktivita → přání uzavřené", async () => {
  const [w] = await as(student, `insert into public.wishes (kind, title) values ('atelier', 'Ateliér keramiky') returning id`);
  const [a] = await as(teacher, `insert into public.activities (slug, kind, title, teacher_id) values ('keramika-prani', 'atelier', 'Keramika', $1) returning id`, [teacher]);
  await as(teacher, `select public.fulfil_wish($1, $2)`, [w.id, a.id]);
  await as(teacher, `delete from public.activities where id = $1`, [a.id]);
  const row = (await db.query(`select status, note, activity_id from public.wishes where id = $1`, [w.id])).rows[0];
  assert.equal(row.status, "uzavreno");
  assert.equal(row.activity_id, null);
  assert.ok(row.note);
  assert.equal((await db.query(`select 1 from public.notifications where user_id = $1 and title = 'Zrušeno: Ateliér keramiky'`, [student])).rows.length, 1);
  // Uzavřené zmizí týden po uzavření.
  await db.query(`update public.wishes set closed_at = now() - interval '8 days' where id = $1`, [w.id]);
  await as(student, `select public.purge_expired_wishes()`);
  assert.equal((await db.query(`select 1 from public.wishes where id = $1`, [w.id])).rows.length, 0);
});

await test("návrhy: hlasuje se 7 dní, pak bez dost hlasů neprošlo", async () => {
  const [p] = await as(student, `insert into public.proposals (title, goal, need_percent_proposed) values ('Online kino každý pátek', 'shromazdeni', 90) returning id`);
  const [q] = await as(student, `insert into public.proposals (title, goal, need_percent_proposed) values ('Pátky bez úkolů', 'shromazdeni', 1) returning id`);
  await as(student2, `insert into public.proposal_supports (proposal_id, choice) values ($1, 'pro')`, [p.id]);
  // Hlasování skončilo.
  await db.query(`update public.proposals set voting_ends_at = now() - interval '1 minute' where id in ($1, $2)`, [p.id, q.id]);
  await assert.rejects(() => as(teacher2, `insert into public.proposal_supports (proposal_id) values ($1)`, [p.id]));
  assert.equal((await as(student2, `update public.proposal_supports set choice = 'proti' where proposal_id = $1 returning 1`, [p.id])).length, 0);
  assert.equal((await as(student2, `delete from public.proposal_supports where proposal_id = $1 returning 1`, [p.id])).length, 0);
  await as(teacher2, `select public.close_expired_proposals()`);
  const rows = (await db.query(`select id, status from public.proposals where id in ($1, $2)`, [p.id, q.id])).rows;
  assert.equal(rows.find((r) => r.id === p.id).status, "neproslo");
  assert.equal(rows.find((r) => r.id === q.id).status, "open"); // má dost hlasů → čeká na rozhodnutí
  assert.equal((await db.query(`select 1 from public.notifications where user_id = $1 and title = 'Návrh neprošel: Online kino každý pátek'`, [student2])).rows.length, 1);
  // Vrácení dá nových 7 dní; mazat smí jen admin.
  await as(teacher, `select public.reopen_proposal($1)`, [p.id]);
  const back = (await db.query(`select status, voting_ends_at > now() as running from public.proposals where id = $1`, [p.id])).rows[0];
  assert.deepEqual([back.status, back.running], ["open", true]);
  assert.equal((await as(teacher, `delete from public.proposals where id = $1 returning 1`, [q.id])).length, 0);
  assert.equal((await as(admin, `delete from public.proposals where id = $1 returning 1`, [q.id])).length, 1);
});

await test("návrhy: povinné hlasování posílá jen admin, oznámení dostanou nehlasující", async () => {
  const [p] = await as(student, `insert into public.proposals (title, goal, need_percent_proposed) values ('Povinná porada', 'shromazdeni', 50) returning id`);
  await assert.rejects(() => as(teacher, `select public.set_proposal_mandatory($1, true)`, [p.id]));
  await as(admin, `select public.set_proposal_mandatory($1, true)`, [p.id]);
  assert.ok((await db.query(`select mandatory_at from public.proposals where id = $1`, [p.id])).rows[0].mandatory_at);
  const got = (await db.query(`select user_id from public.notifications where title = 'Hlasuj o návrhu: Povinná porada'`)).rows.map((r) => r.user_id);
  assert.ok(got.includes(student2) && got.includes(teacher));
  assert.ok(!got.includes(student), "autor už hlasoval");
  await as(admin, `select public.set_proposal_mandatory($1, false)`, [p.id]);
  assert.equal((await db.query(`select mandatory_at from public.proposals where id = $1`, [p.id])).rows[0].mandatory_at, null);
  // Mandatory_at si nikdo nenastaví přímo.
  await assert.rejects(() => as(student, `update public.proposals set mandatory_at = now() where id = $1`, [p.id]));
});

// Nejbližší pátek, který je aspoň zítra (aby čas ještě neproběhl), a pátek za víc než dva týdny.
const [{ fri, far }] = (await db.query(`
  select (d + ((5 - extract(isodow from d)::int + 7) % 7))::text as fri,
         (d + ((5 - extract(isodow from d)::int + 7) % 7) + 21)::text as far
  from (select public.prague_today() + 1 as d) x`)).rows;

await test("konzultace: zápis, spojení bloků, kolize a nedostupnost", async () => {
  // Jen student se zapisuje; učitel u učitele ne.
  await assert.rejects(() => as(teacher2, `select public.book_consultation($1, $2, '09:00', '09:15')`, [teacher, fri]));
  await assert.rejects(() => as(student, `select public.book_consultation($1, $2, '09:00', '09:15')`, [teacher, far]), /dva týdny/);
  await assert.rejects(() => as(student, `select public.book_consultation($1, $2, '07:45', '08:00')`, [teacher, fri]));
  await assert.rejects(() => as(student, `select public.book_consultation($1, $2, '09:05', '09:20')`, [teacher, fri]));
  const [{ book_consultation: c1 }] = await as(student, `select public.book_consultation($1, $2, '09:00', '09:15')`, [teacher, fri]);
  const [{ book_consultation: c2 }] = await as(student, `select public.book_consultation($1, $2, '09:30', '09:45')`, [teacher, fri]);
  assert.notEqual(c1, c2);
  // Prostřední blok spojí obě do jedné 9:00–9:45.
  await as(student, `select public.book_consultation($1, $2, '09:15', '09:30')`, [teacher, fri]);
  const rows = (await db.query(`select starts_at::text, ends_at::text from public.consultations where student_id = $1 and teacher_id = $2`, [student, teacher])).rows;
  assert.deepEqual(rows, [{ starts_at: "09:00:00", ends_at: "09:45:00" }]);
  // Učitel má obsazeno → jiný student ne; student nemůže mít dva učitele naráz.
  await assert.rejects(() => as(student2, `select public.book_consultation($1, $2, '09:30', '10:00')`, [teacher, fri]), /Vyučující má/);
  await assert.rejects(() => as(student, `select public.book_consultation($1, $2, '09:15', '09:30')`, [teacher2, fri]), /Kříží se ti/);
  // Pravidelná a jednorázová nedostupnost.
  await as(teacher2, `insert into public.consultation_rules (teacher_id, slot) values ($1, '10:00')`, [teacher2]);
  await assert.rejects(() => as(student2, `select public.book_consultation($1, $2, '10:00', '10:15')`, [teacher2, fri]), /nenabízí/);
  await as(teacher2, `insert into public.consultation_blocks (teacher_id, day, slot) values ($1, $2, null)`, [teacher2, fri]);
  await assert.rejects(() => as(student2, `select public.book_consultation($1, $2, '11:00', '11:15')`, [teacher2, fri]), /nenabízí/);
  await as(teacher2, `delete from public.consultation_blocks where teacher_id = $1`, [teacher2]);
  // Cizí nedostupnost nikdo nenastaví.
  await assert.rejects(() => as(student, `insert into public.consultation_rules (teacher_id, slot) values ($1, '11:00')`, [teacher]));
  await assert.rejects(() => as(teacher, `insert into public.consultation_rules (teacher_id, slot) values ($1, '11:00')`, [teacher2]));
  // Oznámení učiteli.
  assert.ok((await db.query(`select 1 from public.notifications where user_id = $1 and kind = 'konzultace'`, [teacher])).rows.length >= 1);
});

await test("konzultace: rozvrh a expedice blokují jen ty, koho se týkají", async () => {
  // Kurz učitele v pátek 11:00–12:00 v období, které zahrnuje pátek.
  const [k] = await as(admin, `insert into public.activities (slug, kind, title, teacher_id, starts_on, ends_on, published)
    values ('patecni-kurz', 'kurz', 'Páteční kurz', $1, $2::date - 30, $2::date + 30, true) returning id`, [teacher, fri]);
  await db.query(`insert into public.activity_slots (activity_id, weekday, starts_at, ends_at) values ($1, 5, '11:00', '12:00')`, [k.id]);
  await assert.rejects(() => as(student2, `select public.book_consultation($1, $2, '11:15', '11:30')`, [teacher, fri]), /Páteční kurz/);
  // Expedice v týdnu toho pátku: učitel na ní je → nedostupný; jiný učitel ano.
  const [x] = await as(admin, `insert into public.activities (slug, kind, title, teacher_id, starts_on, ends_on, published)
    values ('vylet-tyden', 'expedice', 'Výlet', $1, $2::date - 4, $2::date, true) returning id`, [admin, fri]);
  await assert.rejects(() => as(student2, `select public.book_consultation($1, $2, '08:30', '08:45')`, [admin, fri]), /expedici/);
  // V týdnu expedic se kurz nekoná → u učitele, který na expedici není, 11:15 projde.
  await as(student2, `select public.book_consultation($1, $2, '11:15', '11:30')`, [teacher, fri]);
  await db.query(`delete from public.activities where id in ($1, $2)`, [k.id, x.id]);
});

await test("konzultace: pozvání, Meet, viditelnost a zrušení", async () => {
  const [c] = (await db.query(`select id from public.consultations where student_id = $1 and teacher_id = $2 and day = $3`, [student, teacher, fri])).rows;
  // Cizí konzultaci nikdo nevidí; obsazenost bez jmen ano.
  assert.equal((await as(student2, `select * from public.consultations where id = $1`, [c.id])).length, 0);
  assert.ok((await as(student2, `select * from public.consultation_board($1, $1)`, [fri])).some((r) => r.teacher_id === teacher));
  await assert.rejects(() => as(student2, `select public.set_consultation_meet($1, 'https://meet.google.com/abc-defg-hij')`, [c.id]));
  await as(student, `select public.set_consultation_meet($1, 'https://meet.google.com/abc-defg-hij')`, [c.id]);
  await assert.rejects(() => as(student, `select public.set_consultation_meet($1, 'https://zoom.us/x')`, [c.id]));
  // Pozvání: kdo má v tu dobu jinou konzultaci, pozvat nejde.
  await as(student, `select public.invite_to_consultation($1, $2)`, [c.id, teacher2]);
  assert.equal((await as(teacher2, `select * from public.consultations where id = $1`, [c.id])).length, 1);
  const [{ book_consultation: busyId }] = await as(student2, `select public.book_consultation($1, $2, '09:00', '09:15')`, [admin, fri]);
  const [other] = (await db.query(`select id from public.consultations where student_id = $1 and day = $2 and teacher_id = $3`, [student2, fri, teacher])).rows;
  await assert.rejects(() => as(student, `select public.invite_to_consultation($1, $2)`, [c.id, student2]), /má v tu dobu/);
  // Pozvaný učitel je pak obsazený i pro ostatní.
  await assert.rejects(() => as(student2, `select public.book_consultation($1, $2, '09:00', '09:15')`, [teacher2, fri]), /Vyučující má/);
  await as(teacher2, `select public.remove_consultation_guest($1, $2)`, [c.id, teacher2]);
  // Zrušit smí student, vyučující nebo admin — cizí ne.
  await assert.rejects(() => as(student2, `select public.cancel_consultation($1)`, [c.id]));
  await as(teacher, `select public.cancel_consultation($1)`, [c.id]);
  assert.equal((await db.query(`select 1 from public.notifications where user_id = $1 and title = 'Konzultace zrušena'`, [student])).rows.length, 1);
  await as(student2, `select public.cancel_consultation($1)`, [other.id]);
  await as(admin, `select public.cancel_consultation($1)`, [busyId]);
});

await test("konzultace: zrušený pátek zruší zapsané konzultace a oznámí to", async () => {
  const [{ book_consultation: id }] = await as(student, `select public.book_consultation($1, $2, '10:30', '10:45')`, [teacher2, fri]);
  await as(student, `select public.invite_to_consultation($1, $2)`, [id, student2]);
  // Učitel je navíc pozvaný na cizí konzultaci téhož dne.
  const [{ book_consultation: other }] = await as(student2, `select public.book_consultation($1, $2, '11:00', '11:15')`, [admin, fri]);
  await as(student2, `select public.invite_to_consultation($1, $2)`, [other, teacher2]);
  await as(teacher2, `insert into public.consultation_blocks (teacher_id, day, slot) values ($1, $2, null)`, [teacher2, fri]);
  assert.equal((await db.query(`select 1 from public.consultations where id = $1`, [id])).rows.length, 0);
  assert.equal((await db.query(`select 1 from public.consultation_guests where consultation_id = $1 and user_id = $2`, [other, teacher2])).rows.length, 0);
  const n = (await db.query(`select user_id from public.notifications where body like '%Tereza Hanková v tu dobu nemůže'`)).rows.map((r) => r.user_id);
  assert.ok(n.includes(student) && n.includes(student2));
  await as(teacher2, `delete from public.consultation_blocks where teacher_id = $1`, [teacher2]);
  await as(admin, `select public.cancel_consultation($1)`, [other]);
});

await test("zprávy: doručeno a přečteno — každý mění jen svoje", async () => {
  const [{ start_conversation: conv }] = await as(student, `select public.start_conversation($1)`, [student2]);
  await as(student, `insert into public.messages (conversation_id, body) values ($1, 'Ahoj')`, [conv]);
  const before = (await db.query(`select delivered_at from public.conversation_members where conversation_id = $1 and user_id = $2`, [conv, student2])).rows[0].delivered_at;
  await new Promise((r) => setTimeout(r, 5));
  await as(student2, `select public.mark_messages_delivered()`);
  const after = (await db.query(`select delivered_at from public.conversation_members where conversation_id = $1 and user_id = $2`, [conv, student2])).rows[0].delivered_at;
  assert.ok(after > before, "doručeno se posunulo");
  // Cizí stav nikdo nezmění; odesílatel vidí stav druhého.
  assert.equal((await as(student, `update public.conversation_members set delivered_at = now() where conversation_id = $1 and user_id = $2 returning 1`, [conv, student2])).length, 0);
  assert.equal((await as(student, `select delivered_at from public.conversation_members where conversation_id = $1 and user_id = $2`, [conv, student2])).length, 1);
});

await test("úklid úložiště: najde jen soubory, na které nic neodkazuje", async () => {
  const old = "now() - interval '2 days'";
  const put = (bucket, name, fresh = false) =>
    db.query(`insert into storage.objects (bucket_id, name, created_at, metadata) values ($1, $2, ${fresh ? "now()" : old}, '{"size": 100}')`, [bucket, name]);
  const ghost = "00000000-0000-0000-0000-000000000099";
  await put("materialy", `${task.id}/zije.pdf`);
  await put("materialy", `${ghost}/smazany-ukol.pdf`);
  await put("odevzdani", `${task.id}/${student}/prace.pdf`);
  await put("odevzdani", `${task.id}/${ghost}/smazany-tym.pdf`);
  await put("zpravy", `${ghost}/bez-zpravy.jpg`);
  await put("zpravy", `${ghost}/prave-se-nahrava.jpg`, true);
  await put("avatary", `${student}/stara.jpg`);
  const sql = `select bucket, path from public.storage_orphans() where path like '%' || $1 || '%' or path like $2 || '%'`;
  const rows = (await db.query(sql, [ghost, `${student}/`])).rows.map((r) => `${r.bucket}:${r.path}`).sort();
  assert.deepEqual(rows, [
    `avatary:${student}/stara.jpg`,
    `materialy:${ghost}/smazany-ukol.pdf`,
    `odevzdani:${task.id}/${ghost}/smazany-tym.pdf`,
    `zpravy:${ghost}/bez-zpravy.jpg`,
  ].sort());
  // Běžní uživatelé ani admin přes API funkci nespustí (jen server se secret key).
  await assert.rejects(() => as(admin, `select * from public.storage_orphans()`));
  await assert.rejects(() => as(admin, `select * from public.storage_usage()`));
  await db.query(`delete from storage.objects where name like '%' || $1 || '%' or name like $2 || '%' or name = $3`, [ghost, `${student}/stara`, `${task.id}/zije.pdf`]);
});

await test("skupinové chaty: založení, správci, vyhození, odchod a smazání", async () => {
  // Skupina potřebuje název a aspoň dva další lidi.
  await assert.rejects(() => as(student, `select public.create_group('', $1)`, [[student2, teacher]]), /název/);
  await assert.rejects(() => as(student, `select public.create_group('Dva', $1)`, [[student2]]), /aspoň dva/);
  const [{ create_group: g }] = await as(student, `select public.create_group('Výlet', $1)`, [[student2, teacher, student]]);
  const members = await as(student2, `select user_id, is_admin from public.conversation_members where conversation_id = $1 order by is_admin desc`, [g]);
  assert.equal(members.length, 3);
  assert.equal(members[0].user_id, student);
  assert.equal(members.filter((m) => m.is_admin).length, 1);
  // Členové dostali oznámení, outsider skupinu nevidí.
  assert.equal((await db.query(`select 1 from public.notifications where user_id = $1 and href = $2`, [student2, `/zpravy?k=${g}`])).rows.length, 1);
  assert.equal((await as(outsider, `select 1 from public.conversations where id = $1`, [g])).length, 0);
  assert.equal((await as(outsider, `select 1 from public.my_chats() where conversation_id = $1`, [g])).length, 0);
  // Zpráva do skupiny → notifikace s názvem skupiny; systémovou zprávu uživatel nepodvrhne.
  await as(student2, `insert into public.messages (conversation_id, body) values ($1, 'Ahoj všichni')`, [g]);
  const n = (await db.query(`select title, body from public.notifications where user_id = $1 and kind = 'zprava' and href = $2 and read_at is null`, [teacher, `/zpravy?k=${g}`])).rows;
  assert.equal(n.length, 1);
  assert.equal(n[0].title, "Výlet");
  assert.match(n[0].body, /^Eliot Komárek: Ahoj všichni/);
  const [fake] = await as(student2, `insert into public.messages (conversation_id, body, system) values ($1, 'podvrh', true) returning system`, [g]);
  assert.equal(fake.system, false);
  const [chat] = await as(teacher, `select * from public.my_chats() where conversation_id = $1`, [g]);
  assert.equal(chat.is_group, true);
  assert.equal(chat.title, "Výlet");
  assert.equal(chat.member_count, 3);
  assert.equal(chat.other_id, null);
  // Jen správce přejmenuje, přidá, vyhodí a jmenuje správce.
  await assert.rejects(() => as(student2, `select public.rename_group($1, 'Moje')`, [g]), /správce/);
  await assert.rejects(() => as(student2, `select public.add_group_members($1, $2)`, [g, [outsider]]), /správce/);
  await assert.rejects(() => as(student2, `select public.remove_group_member($1, $2)`, [g, teacher]), /správce/);
  await assert.rejects(() => as(student2, `select public.set_group_admin($1, $2, true)`, [g, student2]), /správce/);
  await assert.rejects(() => as(student2, `select public.delete_group($1)`, [g]), /správce/);
  await as(student, `select public.rename_group($1, 'Výlet do Brna')`, [g]);
  assert.equal((await db.query(`select title from public.conversations where id = $1`, [g])).rows[0].title, "Výlet do Brna");
  await as(student, `select public.add_group_members($1, $2)`, [g, [outsider]]);
  assert.equal((await as(outsider, `select 1 from public.conversations where id = $1`, [g])).length, 1);
  await as(student, `select public.remove_group_member($1, $2)`, [g, outsider]);
  assert.equal((await as(outsider, `select 1 from public.messages where conversation_id = $1`, [g])).length, 0);
  await assert.rejects(() => as(outsider, `insert into public.messages (conversation_id, body) values ($1, 'zpět')`, [g]));
  await as(student, `select public.set_group_admin($1, $2, true)`, [g, student2]);
  await as(student2, `select public.rename_group($1, 'Brno')`, [g]);
  // Poslední správce se nesesadí.
  await as(student2, `select public.set_group_admin($1, $2, false)`, [g, student]);
  await assert.rejects(() => as(student2, `select public.set_group_admin($1, $2, false)`, [g, student2]), /aspoň jednoho/);
  // Odchod posledního správce → správcem je nejdéle přítomný člen.
  await as(student2, `select public.leave_group($1)`, [g]);
  const admins = (await db.query(`select user_id from public.conversation_members where conversation_id = $1 and is_admin`, [g])).rows;
  assert.equal(admins.length, 1);
  assert.ok([student, teacher].includes(admins[0].user_id));
  assert.equal((await db.query(`select count(*)::int c from public.messages where conversation_id = $1 and system`, [g])).rows[0].c >= 6, true);
  // Smazání správcem odstraní skupinu, zprávy i notifikace.
  await as(admins[0].user_id, `select public.delete_group($1)`, [g]);
  assert.equal((await db.query(`select 1 from public.conversations where id = $1`, [g])).rows.length, 0);
  assert.equal((await db.query(`select 1 from public.notifications where href = $1`, [`/zpravy?k=${g}`])).rows.length, 0);
  // Dvojice konverzace zůstávají beze změny (skupinové funkce na ni nejdou).
  const [{ start_conversation: pair }] = await as(student, `select public.start_conversation($1)`, [student2]);
  await assert.rejects(() => as(student, `select public.leave_group($1)`, [pair]));
  await assert.rejects(() => as(student, `select public.delete_group($1)`, [pair]));
});

await test("připomínky termínu: jen neodevzdané úkoly do 24 h, jednou, a jde vypnout", async () => {
  const mk = async (title, hours) => (await db.query(
    `insert into public.assignments (activity_id, title, due_at, created_by) values ($1, $2, now() + ($3 || ' hours')::interval, $4) returning id`,
    [course.id, title, String(hours), teacher])).rows[0].id;
  await db.query(`insert into public.enrollments (activity_id, student_id) values ($1, $2) on conflict do nothing`, [course.id, student]);
  await db.query(`insert into public.enrollments (activity_id, student_id) values ($1, $2) on conflict do nothing`, [course.id, student2]);
  const soon = await mk("Brzy", 5);
  const later = await mk("Pozdeji", 48);
  const done = await mk("Hotovo", 3);
  await db.query(`insert into public.submissions (assignment_id, student_id, status, submitted_at) values ($1, $2, 'odevzdano', now())`, [done, student]);
  await db.query(`update public.profiles set due_reminders = false where id = $1`, [student2]);
  await db.query(`select public.send_due_reminders()`);
  const got = async (who) => (await db.query(`select href from public.notifications where user_id = $1 and kind = 'termin'`, [who])).rows.map((r) => r.href);
  const mine = await got(student);
  assert.ok(mine.includes(`/ukoly/${soon}`));
  assert.ok(!mine.includes(`/ukoly/${later}`));
  assert.ok(!mine.includes(`/ukoly/${done}`));
  assert.equal((await got(student2)).length, 0, "vypnuté připomínky");
  // Podruhé už nic.
  await db.query(`select public.send_due_reminders()`);
  assert.equal((await got(student)).filter((h) => h === `/ukoly/${soon}`).length, 1);
  // Uživatelé funkci spustit nemůžou, tabulku nevidí; svoje nastavení změní.
  await assert.rejects(() => as(student, `select public.send_due_reminders()`));
  assert.equal((await as(student, `select * from public.due_reminders`).catch(() => [])).length, 0);
  await as(student2, `update public.profiles set due_reminders = true where id = $1`, [student2]);
  await db.query(`delete from public.assignments where id = any($1)`, [[soon, later, done]]);
});

await test("oznámení na Domově: zakládá jen admin, vidí cílová skupina, skrytí je osobní", async () => {
  await assert.rejects(() => as(teacher, `insert into public.announcements (title) values ('Učitel')`));
  await assert.rejects(() => as(student, `insert into public.announcements (title) values ('Student')`));
  const [all] = await as(admin, `insert into public.announcements (title, body) values ('Zítra výuka odpadá', 'Kvůli výpadku proudu.') returning id`);
  const [staff] = await as(admin, `insert into public.announcements (title, audience) values ('Porada v pátek', 'vyucujici') returning id`);
  const seen = async (who) => (await as(who, `select id from public.announcements`)).map((r) => r.id);
  assert.ok((await seen(student)).includes(all.id));
  assert.ok(!(await seen(student)).includes(staff.id));
  assert.ok((await seen(teacher)).includes(staff.id));
  assert.equal((await seen(outsider)).includes(all.id), true, "student mimo třídy je taky člen školy");
  // Notifikace přišla studentům i učitelům, autorovi ne; učitelská jen učitelům.
  const notes = async (who, title) => (await db.query(`select 1 from public.notifications where user_id = $1 and kind = 'skola' and title = $2`, [who, title])).rows.length;
  assert.equal(await notes(student, "Zítra výuka odpadá"), 1);
  assert.equal(await notes(admin, "Zítra výuka odpadá"), 0);
  assert.equal(await notes(student, "Porada v pátek"), 0);
  assert.equal(await notes(teacher, "Porada v pátek"), 1);
  // Skrytí: každý jen svoje.
  await as(student, `insert into public.announcement_dismissals (announcement_id) values ($1)`, [all.id]);
  await assert.rejects(() => as(student, `insert into public.announcement_dismissals (announcement_id, user_id) values ($1, $2)`, [all.id, student2]));
  assert.equal((await as(student2, `select * from public.announcement_dismissals`)).length, 0);
  // Ukončit a smazat smí jen admin.
  assert.equal((await as(teacher, `update public.announcements set ends_at = now() where id = $1 returning 1`, [staff.id])).length, 0);
  await as(admin, `update public.announcements set ends_at = now() where id = $1`, [all.id]);
  assert.equal((await as(student, `delete from public.announcements where id = $1 returning 1`, [all.id])).length, 0);
  await as(admin, `delete from public.announcements where id = any($1)`, [[all.id, staff.id]]);
});

await test("rozdělení na expedici: kapacita, limit na studenta, uzavření, jména a vyučující", async () => {
  // Třída = kurz z testů; zapsaní student a student2, outsider ne.
  await db.query(`insert into public.enrollments (activity_id, student_id) values ($1, $2), ($1, $3) on conflict do nothing`, [course.id, student, student2]);
  await assert.rejects(() => as(student, `insert into public.signup_boards (activity_id, title) values ($1, 'Podvrh')`, [course.id]));
  const [board] = await as(teacher, `insert into public.signup_boards (activity_id, title, show_names) values ($1, 'Pokoje', false) returning id`, [course.id]);
  const [r1] = await as(teacher, `insert into public.signup_options (board_id, label, capacity) values ($1, 'Pokoj 1', 1) returning id`, [board.id]);
  const [r2] = await as(teacher, `insert into public.signup_options (board_id, label, capacity) values ($1, 'Pokoj 2', 3) returning id`, [board.id]);
  assert.equal((await db.query(`select 1 from public.notifications where user_id = $1 and kind = 'rozdeleni'`, [student])).rows.length >= 1, true);
  // Přihlášení, plno, limit 1 na studenta, outsider ne.
  await as(student, `select public.signup_join($1)`, [r1.id]);
  await assert.rejects(() => as(student2, `select public.signup_join($1)`, [r1.id]), /plné/);
  await assert.rejects(() => as(student, `select public.signup_join($1)`, [r2.id]), /jinde/);
  await assert.rejects(() => as(outsider, `select public.signup_join($1)`, [r2.id]), /zapsaní/);
  await as(student2, `select public.signup_join($1)`, [r2.id]);
  // Bez „ukazovat jména“ vidí student jen sebe, počty ale všechny.
  assert.equal((await as(student, `select * from public.signup_entries where board_id = $1`, [board.id])).length, 1);
  assert.equal((await as(teacher, `select * from public.signup_entries where board_id = $1`, [board.id])).length, 2);
  const counts = await as(student, `select * from public.signup_counts($1)`, [course.id]);
  assert.equal(counts.find((c) => c.option_id === r2.id).taken, 1);
  assert.equal((await as(outsider, `select * from public.signup_counts($1)`, [course.id])).length, 0);
  // Uzavřeno → student nic nezmění, vyučující přiřadí i nad kapacitu.
  await as(teacher, `update public.signup_boards set locked = true where id = $1`, [board.id]);
  await assert.rejects(() => as(student, `select public.signup_leave($1)`, [r1.id]), /uzavřené/);
  await assert.rejects(() => as(student, `update public.signup_boards set locked = false where id = $1 returning 1`, [board.id]).then((r) => { if (!r.length) throw new Error("bez změny"); }));
  await as(teacher, `select public.signup_assign($1, $2)`, [r1.id, student2]);
  assert.equal(counts.length, 2);
  assert.equal((await as(teacher, `select count(*)::int c from public.signup_entries where option_id = $1`, [r1.id]))[0].c, 2);
  await assert.rejects(() => as(student, `select public.signup_assign($1, $2)`, [r2.id, student]), /vyučující/);
  await as(teacher, `select public.signup_unassign($1, $2)`, [r1.id, student2]);
  // Termín přihlašování v minulosti = taky zavřeno.
  await as(teacher, `update public.signup_boards set locked = false, closes_at = now() - interval '1 minute' where id = $1`, [board.id]);
  await assert.rejects(() => as(student2, `select public.signup_leave($1)`, [r2.id]), /uzavřené/);
  // Odepsaný student z rozdělení vypadne.
  await db.query(`delete from public.enrollments where activity_id = $1 and student_id = $2`, [course.id, student2]);
  assert.equal((await db.query(`select 1 from public.signup_entries where student_id = $1 and board_id = $2`, [student2, board.id])).rows.length, 0);
  await as(teacher, `delete from public.signup_boards where id = $1`, [board.id]);
});

await test("naplánované úkoly: student je nevidí ani neodevzdá, oznámení až při zveřejnění", async () => {
  await db.query(`insert into public.enrollments (activity_id, student_id) values ($1, $2) on conflict do nothing`, [course.id, student]);
  const [plan] = await as(teacher, `insert into public.assignments (activity_id, title, publish_at) values ($1, 'Naplánovaný', now() + interval '2 days') returning id`, [course.id]);
  const seen = async (who) => (await as(who, `select id from public.assignments where id = $1`, [plan.id])).length;
  assert.equal(await seen(student), 0);
  assert.equal(await seen(teacher), 1, "teacher");
  assert.equal(await seen(admin), 1, "admin");
  await assert.rejects(() => as(student, `insert into public.submissions (assignment_id, student_id) values ($1, $2)`, [plan.id, student]));
  const note = async () => (await db.query(`select 1 from public.notifications where user_id = $1 and href = $2`, [student, `/ukoly/${plan.id}`])).rows.length;
  assert.equal(await note(), 0, "oznámení ještě ne");
  // Nastal čas → cron zveřejní a pošle oznámení (jen jednou).
  await db.query(`update public.assignments set publish_at = now() - interval '1 minute' where id = $1`, [plan.id]);
  assert.equal(await seen(student), 1, "po zveřejnění");
  // Cron běží bez přihlášeného uživatele.
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.query(`select public.publish_scheduled_assignments()`);
  await db.query(`select public.publish_scheduled_assignments()`);
  assert.equal(await note(), 1, "oznámení jednou");
  await as(student, `insert into public.submissions (assignment_id, student_id) values ($1, $2)`, [plan.id, student]);
  // Úkol bez plánu se oznámí hned a cron ho znovu neoznámí.
  const [now_] = await as(teacher, `insert into public.assignments (activity_id, title) values ($1, 'Hned') returning id`, [course.id]);
  await db.query(`select public.publish_scheduled_assignments()`);
  assert.equal((await db.query(`select 1 from public.notifications where user_id = $1 and href = $2`, [student, `/ukoly/${now_.id}`])).rows.length, 1, "hned");
  await assert.rejects(() => as(student, `select public.publish_scheduled_assignments()`));
  // Vyučující může naplánovaný úkol zveřejnit hned.
  const [later] = await as(teacher, `insert into public.assignments (activity_id, title, publish_at) values ($1, 'Později', now() + interval '3 days') returning id`, [course.id]);
  await assert.rejects(() => as(student, `select public.publish_assignment_now($1)`, [later.id]));
  await as(teacher, `select public.publish_assignment_now($1)`, [later.id]);
  assert.equal((await as(student, `select 1 from public.assignments where id = $1`, [later.id])).length, 1, "zveřejněno hned");
  assert.equal((await db.query(`select 1 from public.notifications where user_id = $1 and href = $2`, [student, `/ukoly/${later.id}`])).rows.length, 1, "oznámení hned");
  await db.query(`delete from public.assignments where id = any($1)`, [[plan.id, now_.id, later.id]]);
});

console.log(`\n${passed} testů prošlo${process.exitCode ? ", některé selhaly" : ""}.`);
