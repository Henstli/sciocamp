// Datový model etapy 1. Struktura odpovídá budoucím tabulkám v Supabase,
// takže výměna ukázkových dat za databázi se dotkne jen src/lib/data.ts.

export type Role = "student" | "ucitel" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Ročník 1–4 u studentů, jinak null. */
  grade: number | null;
  /** Ročník u studentů („3. ročník“), úvazek u vyučujících — jen pro zobrazení. */
  group: string;
  /** false = pozvánka odeslána, účet ještě nebyl použit. */
  active: boolean;
  bio?: string;
};

export type ActivityKind = "kurz" | "atelier" | "ostatni";

/** Den v týdnu: 1 = pondělí … 5 = pátek. */
export type Weekday = 1 | 2 | 3 | 4 | 5;

export type Slot = {
  day: Weekday;
  /** "HH:MM" v pražském čase */
  start: string;
  end: string;
};

export type Project = {
  name: string;
  milestonesDone: number;
  milestonesTotal: number;
};

/** Kurz, ateliér nebo jiná aktivita (třídnická hodina, příprava expedice …). */
export type Activity = {
  /** Slug pro adresu (/kurzy/<id>). */
  id: string;
  kind: ActivityKind;
  title: string;
  teacherId: string;
  room: string;
  /** Odkaz na Google Meet; vkládá ho vyučující nebo admin. Null = zatím není. */
  meetUrl: string | null;
  /** Pro které ročníky je aktivita; null = pro všechny. */
  allowedGrades: number[] | null;
  slots: Slot[];
  studentIds: string[];
  capacity?: number;
  /** Barva hlavičky karty (z návrhu). */
  tone: "blue" | "blueDark" | "violet" | "teal";
  project?: Project;
};

export type StreamItem =
  | {
      type: "post";
      id: string;
      authorId: string;
      when: string;
      label: string;
      text: string;
      attachments: { kind: "pdf" | "doc"; title: string; meta: string }[];
      comments: number;
    }
  | {
      type: "task" | "material";
      id: string;
      title: string;
      meta: string;
    };

export type WorkItemKind = "ukol" | "tym" | "pdf" | "video" | "kviz";
export type WorkStatus = "ceka" | "hotovo" | "info";

export type WorkTopic = {
  name: string;
  items: {
    id: string;
    kind: WorkItemKind;
    title: string;
    meta: string;
    status: string;
    statusTone: WorkStatus;
  }[];
};

export type Team = { name: string; memberIds: string[] };

export type ChatMessage = { id: string; authorId: string; time: string; text: string };

export type ClassroomContent = {
  stream: StreamItem[];
  topics: WorkTopic[];
  teams: Team[];
  chat: ChatMessage[];
  upcoming: { title: string; when: string; urgent: boolean }[];
};
