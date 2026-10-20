// Rozdělení (pokoje, služby) ve třídě. Naostro přes RLS (jména podle pravidel
// seznamu, počty přes signup_counts), v ukázkovém režimu pevná data.

import "server-only";
import { isSupabase } from "./config";
import type { SignupBoard } from "./signups";
import { createClient } from "./supabase/server";
import type { Activity } from "./types";

const DEMO: Record<string, SignupBoard[]> = {
  "za-vlky-do-javorniku": [
    {
      id: "r-pokoje",
      title: "Pokoje",
      description: "Chata má tři pokoje. Vyber si, s kým chceš bydlet — kdo bude dřív, má místo.",
      maxPerStudent: 1,
      required: true,
      showNames: true,
      locked: false,
      closesAt: "2026-10-23T16:00:00Z",
      options: [
        { id: "r-p1", label: "Pokoj 1 (podkroví)", day: null, capacity: 4, taken: 3, studentIds: ["u-komarek", "u-cerny", "u-kral"] },
        { id: "r-p2", label: "Pokoj 2", day: null, capacity: 4, taken: 2, studentIds: ["u-svobodova", "u-vesely"] },
        { id: "r-p3", label: "Pokoj 3 (u kuchyně)", day: null, capacity: 2, taken: 0, studentIds: [] },
      ],
    },
    {
      id: "r-vareni",
      title: "Vaření večeří",
      description: "Každý večer vaří jedna dvojice nebo trojice. Nákup zajišťujeme společně.",
      maxPerStudent: 1,
      required: true,
      showNames: true,
      locked: false,
      closesAt: null,
      options: [
        { id: "r-v1", label: "Večeře", day: "2026-10-26", capacity: 3, taken: 2, studentIds: ["u-liska", "u-benes"] },
        { id: "r-v2", label: "Večeře", day: "2026-10-27", capacity: 3, taken: 1, studentIds: ["u-maly"] },
        { id: "r-v3", label: "Večeře", day: "2026-10-28", capacity: 3, taken: 0, studentIds: [] },
        { id: "r-v4", label: "Večeře", day: "2026-10-29", capacity: 3, taken: 0, studentIds: [] },
      ],
    },
  ],
};

type BoardRow = {
  id: string;
  title: string;
  description: string;
  max_per_student: number;
  required: boolean;
  show_names: boolean;
  locked: boolean;
  closes_at: string | null;
  signup_options: { id: string; label: string; day: string | null; capacity: number | null; position: number }[];
};

export async function signupBoards(activity: Activity): Promise<SignupBoard[]> {
  if (!isSupabase || !activity.dbId) return DEMO[activity.id] ?? [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("signup_boards")
    .select("id, title, description, max_per_student, required, show_names, locked, closes_at, signup_options(id, label, day, capacity, position)")
    .eq("activity_id", activity.dbId)
    .order("position")
    .order("created_at");
  if (error || !data?.length) return [];
  const boards = data as BoardRow[];
  const [{ data: counts }, { data: entries }] = await Promise.all([
    sb.rpc("signup_counts", { activity: activity.dbId }),
    sb.from("signup_entries").select("option_id, student_id, created_at").in("board_id", boards.map((b) => b.id)).order("created_at"),
  ]);
  const taken = new Map(((counts ?? []) as { option_id: string; taken: number }[]).map((c) => [c.option_id, c.taken]));
  const who = new Map<string, string[]>();
  for (const e of (entries ?? []) as { option_id: string; student_id: string }[]) {
    who.set(e.option_id, [...(who.get(e.option_id) ?? []), e.student_id]);
  }
  return boards.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    maxPerStudent: b.max_per_student,
    required: b.required,
    showNames: b.show_names,
    locked: b.locked,
    closesAt: b.closes_at,
    options: [...b.signup_options]
      .sort((x, y) => (x.day ?? "").localeCompare(y.day ?? "") || x.position - y.position)
      .map((o) => ({
        id: o.id,
        label: o.label,
        day: o.day,
        capacity: o.capacity,
        taken: taken.get(o.id) ?? 0,
        studentIds: who.get(o.id) ?? [],
      })),
  }));
}
