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
  /** Profilová fotka v úložišti (bucket avatary), jinak null. */
  avatarPath?: string | null;
  /** Barva pruhu v profilu (BANNER_COLORS v src/lib/banner.ts), výchozí modrá. */
  bannerColor?: string;
};

/** „ostatni“ se v aplikaci jmenuje Událost (třídnická konzultace, seminář…). */
export type ActivityKind = "kurz" | "atelier" | "ostatni" | "expedice";

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

/** Kurzové období (4 za školní rok). */
export type Period = {
  id: string;
  name: string;
  /** „rrrr-mm-dd“ */
  startsOn: string;
  endsOn: string;
  /** Termín zápisu do kurzů (ISO čas). */
  enrollOpensAt?: string | null;
  enrollClosesAt?: string | null;
  /** Kdy admin kurzy období zveřejnil; null = příprava. */
  publishedAt?: string | null;
};

/** Termín ateliérů nebo expedic, který předem zadává admin (učitel z nich vybírá). */
export type ActivityTerm = {
  id: string;
  kind: "atelier" | "expedice";
  name: string | null;
  /** „rrrr-mm-dd“ */
  startsOn: string;
  endsOn: string;
};

/** Zápisové kolo: jeden termín zápisu pro víc ateliérů (nebo expedic) naráz. */
export type EnrollRound = {
  id: string;
  kind: "atelier" | "expedice";
  opensAt: string;
  closesAt: string;
  createdBy?: string | null;
};

/** Kurz, ateliér nebo jiná aktivita (třídnická hodina, příprava expedice …). */
export type Activity = {
  /** Slug pro adresu (/kurzy/<id>). */
  id: string;
  kind: ActivityKind;
  title: string;
  description?: string;
  teacherId: string;
  /** Nepovinné místo konání (výuka je jinak online), např. kam se jede na expedici. */
  location: string | null;
  /** Kurzové období, do kterého aktivita patří */
  period: Period | null;
  /** Vlastní začátek a konec („rrrr-mm-dd“) — u ateliérů a expedic. Null = podle období. */
  startsOn: string | null;
  endsOn: string | null;
  /** Id řádku v databázi (uuid) — pro Realtime a Storage. V ukázkovém režimu chybí. */
  dbId?: string;
  /** Odkaz na Google Meet; vkládá ho vyučující nebo admin. Null = zatím není. */
  meetUrl: string | null;
  /** Pro které ročníky je aktivita; null = pro všechny. */
  allowedGrades: number[] | null;
  slots: Slot[];
  studentIds: string[];
  /** Další vyučující kromě hlavního (expedice jich má aspoň jednoho). */
  coTeacherIds?: string[];
  capacity?: number;
  /** Zveřejněná v nabídce (rozpracovanou vidí jen učitelé a zapsaní). Chybí = ano. */
  published?: boolean;
  /** Zápisové kolo ateliéru / expedice (společný termín zápisu); kurzy berou termín z období. */
  round?: EnrollRound | null;
  /** Událost pro všechny studenty / všechny vyučující (doplňují se i noví). */
  forAllStudents?: boolean;
  forAllStaff?: boolean;
  /** Termín od admina (ateliér, expedice) — data se berou z něj. */
  termId?: string | null;
  /** Učitel ateliér / expedici označil „Připraveno k vyhlášení“. */
  announceReady?: boolean;
  /** Barva hlavičky karty (z návrhu). */
  tone: "blue" | "blueDark" | "violet" | "teal";
  project?: Project;
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

export type Team = { id: string; name: string; memberIds: string[] };

export type ClassroomContent = {
  topics: WorkTopic[];
  teams: Team[];
  upcoming: { title: string; when: string; urgent: boolean }[];
};

// ---------------------------------------------------------------------------
// Etapa 2: úkoly a hodnocení
// ---------------------------------------------------------------------------

export type AssignmentKind = "ukol" | "material";
export type ReviewResult = "splneno" | "nesplneno" | "vraceno";
export type LinkItem = { title: string; url: string };

export type Assignment = {
  id: string;
  /** Slug třídy */
  activityId: string;
  activityTitle: string;
  activityKind: ActivityKind;
  kind: AssignmentKind;
  title: string;
  instructions: string;
  topic: string | null;
  /** ISO čas (UTC) nebo null */
  dueAt: string | null;
  maxPoints: number | null;
  links: LinkItem[];
  createdAt: string;
  /** Týmový úkol: tým odevzdává společnou práci, hodnocení dostane celý tým. */
  teamWork?: boolean;
  /** Kdo rozděluje týmy: vyučující, nebo studenti sami */
  teamMode?: "teacher" | "students";
  /** Max. velikost týmu, když se studenti rozdělují sami */
  teamMaxSize?: number | null;
};

export type SubmissionFile = { path: string; name: string; size: number | null; url?: string };

export type Submission = {
  status: "rozpracovano" | "odevzdano";
  links: LinkItem[];
  note: string | null;
  submittedAt: string | null;
  files: SubmissionFile[];
};

export type Review = {
  result: ReviewResult;
  points: number | null;
  feedback: string | null;
  request: string | null;
  reviewedAt: string;
  /** U týmového úkolu: hodnocení jen tohoto člena (ne celého týmu) */
  individual?: boolean;
};

export type Work = { submission: Submission | null; review: Review | null };

/** Stav úkolu z pohledu studenta. */
export type WorkState = "material" | "ceka" | "pozde" | "odevzdano" | "vraceno" | "splneno" | "nesplneno";

export type Comment = { id: string; authorId: string; body: string; createdAt: string };

// ---------------------------------------------------------------------------
// Etapa 3: nástěnka, chat, zprávy, notifikace
// ---------------------------------------------------------------------------

/** Příspěvek na nástěnce třídy (píše vyučující nebo admin). */
export type Post = {
  id: string;
  authorId: string;
  body: string;
  links: LinkItem[];
  files: SubmissionFile[];
  createdAt: string;
  comments: Comment[];
};

/** Zpráva v chatu třídy (text, příloha nebo obojí). */
export type ClassMessage = { id: string; authorId: string; body: string; createdAt: string; file: SubmissionFile | null };

/** Řádek v seznamu konverzací. */
export type ConversationSummary = {
  id: string;
  /** Skupinový chat (má název a správce) */
  isGroup: boolean;
  /** Název skupiny (u dvojice null) */
  title: string | null;
  /** Druhý člověk (u skupiny null) */
  otherId: string | null;
  memberCount: number;
  lastAt: string;
  lastBody: string;
  lastAuthor: string | null;
  lastMine: boolean;
  lastHasFile: boolean;
  /** Poslední zpráva je systémová („X přidal(a) …“) */
  lastSystem: boolean;
  unread: number;
};

/** Člen konverzace (pro seznam členů skupiny a stav Doručeno / Přečteno). */
export type ConversationMember = {
  userId: string;
  isAdmin: boolean;
  deliveredAt: string;
  readAt: string;
};

/** Soukromá zpráva. */
export type DirectMessage = {
  id: string;
  authorId: string;
  body: string;
  file: SubmissionFile | null;
  createdAt: string;
  /** Systémová zpráva skupiny („X opustil(a) skupinu“) */
  system?: boolean;
};

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  read: boolean;
};
