// Data pro Statistiky studentů (jen vyučující a admin).

import "server-only";
import { cache } from "react";
import { isSupabase } from "./config";
import { listActivities, listStudents } from "./data";
import { demoStatsData } from "./demo-stats";
import { schoolYearStart, type StatAssignment, type StatsInput, type StatWork } from "./stats";
import { createClient } from "./supabase/server";
import type { ReviewResult } from "./types";

type Raw = {
  assignments: { id: string; activity: string; title: string; due: string | null; max: number | null; created: string }[];
  work: {
    a: string;
    s: string;
    st: "rozpracovano" | "odevzdano" | null;
    at: string | null;
    r: ReviewResult | null;
    p: number | null;
    ra: string | null;
    rt: boolean;
  }[];
};

async function statsInputUncached(): Promise<StatsInput> {
  const now = Date.now();
  const [students, activities] = await Promise.all([listStudents(), listActivities()]);
  const base = {
    now,
    students: students.map((s) => ({ id: s.id, name: s.name, grade: s.grade })),
    activities: activities.map((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      teacherIds: [a.teacherId, ...(a.coTeacherIds ?? [])],
      studentIds: a.studentIds,
    })),
  };
  if (!isSupabase) return { ...base, ...demoStatsData(activities, now) };

  const sb = await createClient();
  const { data, error } = await sb.rpc("stats_work", { since: schoolYearStart(now) });
  if (error) throw new Error("Nepodařilo se načíst statistiky.");
  const raw = data as Raw;
  const slug = new Map(activities.map((a) => [a.dbId, a.id]));
  const assignments: StatAssignment[] = raw.assignments.flatMap((a) => {
    const id = slug.get(a.activity);
    return id ? [{ id: a.id, activityId: id, title: a.title, dueAt: a.due, maxPoints: a.max, createdAt: a.created }] : [];
  });
  const work: StatWork[] = raw.work.map((w) => ({
    assignmentId: w.a,
    studentId: w.s,
    status: w.st,
    submittedAt: w.at,
    result: w.r,
    points: w.p,
    reviewedAt: w.ra,
    returned: w.rt,
  }));
  return { ...base, assignments, work };
}

export const statsInput = cache(statsInputUncached);
