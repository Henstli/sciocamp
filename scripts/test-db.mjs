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
  grant execute on function auth.uid() to anon, authenticated, service_role;
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
  `insert into public.activities (slug, kind, title, teacher_id, room, meet_url)
   values ('literatura-ve-filmu', 'kurz', 'Literatura ve filmu', $1, 'učebna 204', 'https://meet.google.com/abc-defg-hij') returning id`,
  [teacher],
);
const { rows: [atelier] } = await db.query(
  `insert into public.activities (slug, kind, title, teacher_id, allowed_grades)
   values ('prezentacni-schopnosti', 'atelier', 'Prezentační schopnosti', $1, '{3,4}') returning id`,
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

console.log(`\n${passed} testů prošlo${process.exitCode ? ", některé selhaly" : ""}.`);
