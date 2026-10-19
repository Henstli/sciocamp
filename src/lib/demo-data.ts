// Ukázková data pro etapu 1. Jména, kurzy a časy odpovídají schválenému návrhu
// (design/*.dc.html). Až bude hotové Supabase, tento soubor zůstane jen jako seed.

import type { Activity, ClassroomContent, EnrollRound, Period, User } from "./types";

export const DEMO_USERS: User[] = [
  // Vedení a vyučující
  { id: "u-pavel", name: "Miroslav Pavel", email: "miroslav.pavel@scioskola.cz", role: "admin", grade: null, group: "Vedení školy", active: true },
  { id: "u-jakubcova", name: "Anežka Jakubcová", email: "anezka.jakubcova@scioskola.cz", role: "ucitel", grade: null, group: "Plný úvazek", active: true },
  { id: "u-hankova", name: "Tereza Hanková", email: "tereza.hankova@scioskola.cz", role: "ucitel", grade: null, group: "Externí lektorka", active: true },
  { id: "u-pietraszek", name: "Martin Pietraszek", email: "martin.pietraszek@scioskola.cz", role: "ucitel", grade: null, group: "Plný úvazek", active: true },
  { id: "u-kumstat", name: "Honza Kumstát", email: "honza.kumstat@scioskola.cz", role: "ucitel", grade: null, group: "Plný úvazek", active: true },
  { id: "u-kubesova", name: "Kateřina Kubešová", email: "katerina.kubesova@scioskola.cz", role: "ucitel", grade: null, group: "Částečný úvazek", active: true },
  { id: "u-lukes", name: "Petr Lukeš", email: "petr.lukes@scioskola.cz", role: "ucitel", grade: null, group: "Externí lektor", active: true },
  // Studenti
  { id: "u-liska", name: "Šimon Samuel Liška", email: "simon.liska@scioskola.cz", role: "student", grade: 3, group: "3. ročník", active: true, bio: "Baví mě film, šachy a cestování. Letos chci zvládnout první vlastní TEDx talk." },
  { id: "u-komarek", name: "Eliot Komárek", email: "eliot.komarek@scioskola.cz", role: "student", grade: 3, group: "3. ročník", active: true },
  { id: "u-kolarova", name: "Tereza Kolářová", email: "tereza.kolarova@scioskola.cz", role: "student", grade: 2, group: "2. ročník", active: true },
  { id: "u-cerny", name: "Jáchym Černý", email: "jachym.cerny@scioskola.cz", role: "student", grade: 3, group: "3. ročník", active: true },
  { id: "u-jaukner", name: "Standa Jaukner", email: "standa.jaukner@scioskola.cz", role: "student", grade: 2, group: "2. ročník", active: true },
  { id: "u-novotna", name: "Petra Novotná", email: "petra.novotna@scioskola.cz", role: "student", grade: 2, group: "2. ročník", active: true },
  { id: "u-kubicek", name: "Vavřinec Kubíček", email: "vavrinec.kubicek@scioskola.cz", role: "student", grade: 1, group: "1. ročník", active: true },
  { id: "u-maly", name: "Ondřej Malý", email: "ondrej.maly@scioskola.cz", role: "student", grade: 1, group: "1. ročník", active: true },
  { id: "u-svobodova", name: "Klára Svobodová", email: "klara.svobodova@scioskola.cz", role: "student", grade: 3, group: "3. ročník", active: true },
  { id: "u-benes", name: "Adam Beneš", email: "adam.benes@scioskola.cz", role: "student", grade: 2, group: "2. ročník", active: true },
  { id: "u-dvorakova", name: "Lucie Dvořáková", email: "lucie.dvorakova@scioskola.cz", role: "student", grade: 1, group: "1. ročník", active: true },
  { id: "u-kral", name: "Matěj Král", email: "matej.kral@scioskola.cz", role: "student", grade: 2, group: "2. ročník", active: true },
  { id: "u-horakova", name: "Ema Horáková", email: "ema.horakova@scioskola.cz", role: "student", grade: 1, group: "1. ročník", active: false },
  { id: "u-vesely", name: "Filip Veselý", email: "filip.vesely@scioskola.cz", role: "student", grade: 3, group: "3. ročník", active: true },
];

const ALL_STUDENTS = DEMO_USERS.filter((u) => u.role === "student").map((u) => u.id);
const PRESENTACE = ["u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna", "u-kubicek", "u-maly", "u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-horakova", "u-vesely"];

export const DEMO_PERIODS: Period[] = [
  { id: "obdobi-1", name: "Kurzové období 1", startsOn: "2026-09-01", endsOn: "2026-10-30", publishedAt: "2026-08-20T08:00:00Z" },
  {
    id: "obdobi-2",
    name: "Kurzové období 2",
    startsOn: "2026-11-02",
    endsOn: "2026-12-18",
    enrollOpensAt: "2026-10-19T14:00:00Z",
    enrollClosesAt: "2026-10-23T18:00:00Z",
    publishedAt: "2026-10-12T08:00:00Z",
  },
  {
    id: "obdobi-3",
    name: "Kurzové období 3",
    startsOn: "2027-01-04",
    endsOn: "2027-02-26",
    enrollOpensAt: "2026-12-07T17:00:00Z",
    enrollClosesAt: "2026-12-11T19:00:00Z",
    publishedAt: null,
  },
];
const P1 = DEMO_PERIODS[0];

/** Zápisová kola ateliérů a expedic (vyhlašují je učitelé hromadně). */
export const DEMO_ROUNDS: EnrollRound[] = [
  { id: "kolo-ateliery", kind: "atelier", opensAt: "2026-10-19T14:00:00Z", closesAt: "2026-10-23T18:00:00Z", createdBy: "u-hankova" },
  { id: "kolo-expedice", kind: "expedice", opensAt: "2026-10-19T14:00:00Z", closesAt: "2026-10-23T18:00:00Z", createdBy: "u-kubesova" },
];
const P2 = DEMO_PERIODS[1];

export const DEMO_ACTIVITIES: Activity[] = [
  // Kurzy
  { id: "psychoterapeuticke-minimum", kind: "kurz", title: "Psychoterapeutické minimum", teacherId: "u-pietraszek", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/psy-mini-tue", allowedGrades: null, slots: [{ day: 2, start: "09:00", end: "10:00" }], studentIds: ["u-liska", "u-komarek", "u-kolarova", "u-jaukner", "u-novotna", "u-svobodova", "u-benes", "u-kral", "u-vesely", "u-cerny", "u-maly"], capacity: 16, tone: "blue" },
  { id: "chemie-leku-a-jedu", kind: "kurz", title: "Chemie léků a jedů", teacherId: "u-pietraszek", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/che-leky-jed", allowedGrades: null, slots: [{ day: 2, start: "10:00", end: "11:00" }], studentIds: ["u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna", "u-kubicek", "u-maly", "u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-vesely", "u-horakova"], capacity: 16, tone: "teal" },
  { id: "literatura-ve-filmu", kind: "kurz", title: "Literatura ve filmu", teacherId: "u-jakubcova", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/lit-film-tue", allowedGrades: null, slots: [{ day: 2, start: "11:30", end: "12:30" }], studentIds: ["u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna", "u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-vesely"], capacity: 18, tone: "violet" },
  { id: "umim-se-ucit", kind: "kurz", title: "Umím se učit", teacherId: "u-jakubcova", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/umi-ucit-wed", allowedGrades: null, slots: [{ day: 3, start: "09:00", end: "10:00" }], studentIds: PRESENTACE, capacity: 16, tone: "blueDark" },
  { id: "komplexni-cisla-a-fraktaly", kind: "kurz", title: "Komplexní čísla a fraktály", teacherId: "u-pavel", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/kom-frak-wed", allowedGrades: null, slots: [{ day: 3, start: "10:00", end: "11:00" }], studentIds: ["u-liska", "u-komarek", "u-cerny", "u-svobodova", "u-vesely", "u-benes", "u-kral"], capacity: 14, tone: "blueDark" },
  { id: "cestomanie", kind: "kurz", title: "Cestománie", teacherId: "u-kumstat", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/ces-toma-wed", allowedGrades: null, slots: [{ day: 3, start: "11:30", end: "12:30" }], studentIds: ["u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna", "u-kubicek", "u-maly", "u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-vesely", "u-horakova"], capacity: 16, tone: "blue" },
  { id: "jak-cist-film", kind: "kurz", title: "Jak číst film", teacherId: "u-kubesova", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/jak-cist-flm", allowedGrades: null, slots: [{ day: 1, start: "12:00", end: "13:00" }, { day: 4, start: "12:00", end: "13:00" }], studentIds: ["u-liska", "u-kolarova", "u-jaukner", "u-novotna", "u-kubicek", "u-dvorakova", "u-kral", "u-horakova"], capacity: 16, tone: "violet" },

  // Ateliéry
  { id: "prezentacni-schopnosti", kind: "atelier", title: "Prezentační schopnosti", teacherId: "u-hankova", location: null, period: P1, startsOn: "2026-10-05", endsOn: "2026-10-30", meetUrl: "https://meet.google.com/abc-defg-hij", allowedGrades: null, slots: [{ day: 1, start: "09:00", end: "11:30" }], studentIds: PRESENTACE, capacity: 14, tone: "violet", project: { name: "Týmová prezentace", milestonesDone: 3, milestonesTotal: 5 } },
  { id: "sachy", kind: "atelier", title: "Šachy", teacherId: "u-lukes", location: null, period: P1, startsOn: "2026-09-01", endsOn: "2026-10-02", meetUrl: "https://meet.google.com/sac-hyat-thu", allowedGrades: null, slots: [{ day: 4, start: "09:00", end: "11:30" }], studentIds: ["u-liska", "u-kubicek", "u-maly", "u-kral", "u-benes", "u-vesely", "u-dvorakova", "u-svobodova"], capacity: 12, tone: "blueDark", project: { name: "Rozbor vlastních partií", milestonesDone: 4, milestonesTotal: 5 } },
  { id: "autonomni-at", kind: "atelier", title: "Autonomní AT", teacherId: "u-lukes", location: null, period: P1, startsOn: "2026-10-05", endsOn: "2026-10-30", meetUrl: "https://meet.google.com/aut-onom-thu", allowedGrades: null, slots: [{ day: 4, start: "09:00", end: "11:30" }], studentIds: ["u-komarek", "u-cerny", "u-jaukner", "u-novotna", "u-kolarova", "u-horakova"], capacity: 12, tone: "teal", project: { name: "Robot pro školní zahradu", milestonesDone: 2, milestonesTotal: 5 } },
  { id: "sedm-hrichu-pameti", kind: "atelier", title: "Sedm hříchů paměti", teacherId: "u-jakubcova", location: null, period: P1, startsOn: "2026-10-05", endsOn: "2026-10-30", meetUrl: "https://meet.google.com/sed-hric-mon", allowedGrades: null, slots: [{ day: 1, start: "09:00", end: "11:30" }], studentIds: ["u-kolarova", "u-novotna", "u-dvorakova", "u-kral", "u-vesely", "u-benes", "u-horakova"], capacity: 10, tone: "violet", project: { name: "Výstava o paměti", milestonesDone: 1, milestonesTotal: 4 } },
  { id: "debatni-klub", kind: "atelier", title: "Debatní klub", teacherId: "u-kumstat", location: null, period: P1, startsOn: "2026-10-05", endsOn: "2026-10-30", meetUrl: "https://meet.google.com/deb-klub-mon", allowedGrades: null, slots: [{ day: 1, start: "09:00", end: "11:30" }], studentIds: ["u-komarek", "u-cerny", "u-jaukner", "u-svobodova", "u-maly", "u-kubicek"], capacity: 12, tone: "blue", project: { name: "Turnaj s gymnáziem", milestonesDone: 2, milestonesTotal: 4 } },

  // Ostatní (pro všechny studenty)
  { id: "mezioborovy-seminar", kind: "ostatni", title: "Mezioborový seminář", teacherId: "u-pavel", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/mez-semi-tue", allowedGrades: null, slots: [{ day: 2, start: "13:00", end: "14:00" }], studentIds: ALL_STUDENTS, tone: "teal" },
  { id: "tridnicka-hodina", kind: "ostatni", title: "Třídnická hodina", teacherId: "u-pavel", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/tri-hodi-fri", allowedGrades: null, slots: [{ day: 5, start: "09:00", end: "10:00" }], studentIds: ALL_STUDENTS, tone: "teal" },
  { id: "priprava-expedice", kind: "ostatni", title: "Příprava expedice", teacherId: "u-kumstat", location: null, period: P1, startsOn: null, endsOn: null, meetUrl: "https://meet.google.com/exp-edic-fri", allowedGrades: null, slots: [{ day: 5, start: "10:30", end: "12:00" }], studentIds: ALL_STUDENTS, tone: "teal" },
  // Týden expedic: všechny expedice běží souběžně po–pá, ostatní výuka ten týden neprobíhá.
  { id: "za-vlky-do-javorniku", kind: "expedice", title: "Za vlky do Javorníků", teacherId: "u-kumstat", coTeacherIds: ["u-pietraszek"], location: "Javorníky, chata pod Kohútkou", period: null, startsOn: "2026-10-26", endsOn: "2026-10-30", meetUrl: null, allowedGrades: null, slots: [], studentIds: ["u-liska", "u-komarek", "u-cerny", "u-svobodova", "u-vesely", "u-kral", "u-benes", "u-maly"], capacity: 12, tone: "teal" },
  { id: "sumava-na-kolech", kind: "expedice", title: "Šumava na kolech", teacherId: "u-lukes", coTeacherIds: ["u-hankova", "u-kubesova"], location: "Kvilda, Šumava", period: null, startsOn: "2026-10-26", endsOn: "2026-10-30", meetUrl: null, allowedGrades: null, slots: [], studentIds: ["u-kolarova", "u-jaukner", "u-novotna", "u-kubicek", "u-dvorakova", "u-horakova"], capacity: 14, tone: "teal" },

  // --- Další období: nabídka v Zápisech ---
  ...nextPeriod(),
];

/** Kurzy, ateliéry a expedice dalšího období (zápis právě běží). */
function nextPeriod(): Activity[] {
  const base = { location: null, meetUrl: null, allowedGrades: null, startsOn: null, endsOn: null, coTeacherIds: [] as string[] };
  const ATELIERY = { round: DEMO_ROUNDS[0], published: true };
  const EXPEDICE = { round: DEMO_ROUNDS[1], published: true };
  const course = (id: string, title: string, teacherId: string, day: 1 | 2 | 3 | 4 | 5, start: string, end: string, capacity: number, studentIds: string[], extra: Partial<Activity> = {}): Activity => ({
    ...base, id, kind: "kurz", title, teacherId, period: P2, slots: [{ day, start, end }], capacity, studentIds, tone: "blue", ...extra,
  });
  const S = DEMO_USERS.filter((u) => u.role === "student" && u.id !== "u-liska").map((u) => u.id);
  return [
    course("cestomanie-2", "Cestománie", "u-kumstat", 3, "11:30", "12:30", 16, S.slice(0, 14), { description: "Plánování cest, rozpočet a orientace v neznámém prostředí." }),
    course("jak-cist-film-2", "Jak číst film", "u-kubesova", 4, "12:00", "13:00", 14, S.slice(2, 11), { description: "Filmový jazyk, střih a kamera. Co film říká, aniž to vysloví." }),
    course("chemie-leku-a-jedu-2", "Chemie léků a jedů", "u-pietraszek", 2, "10:00", "11:00", 6, S.slice(0, 6), { description: "Kde končí lék a začíná jed. Dávky, účinky a příběhy z historie." }),
    course("literatura-ve-filmu-2", "Literatura ve filmu", "u-jakubcova", 2, "11:30", "12:30", 18, ["u-liska", ...S.slice(4, 13)], { description: "Knihy a jejich filmové adaptace. Co se při převodu ztrácí a co získává." }),
    course("psychoterapeuticke-minimum-2", "Psychoterapeutické minimum", "u-pietraszek", 2, "09:00", "10:00", 12, ["u-liska", ...S.slice(1, 6)], { description: "Základy psychoterapeutických směrů a práce s klientem." }),
    course("komplexni-cisla-a-fraktaly-2", "Komplexní čísla a fraktály", "u-pavel", 3, "10:00", "11:00", 12, ["u-liska", ...S.slice(6, 10)], { description: "Od imaginární jednotky k Mandelbrotově množině." }),
    course("kriticke-mysleni-2", "Kritické myšlení", "u-hankova", 2, "11:30", "12:30", 14, S.slice(3, 8), { description: "Jak poznat manipulaci, chybné argumenty a falešné zprávy." }),
    course("priprava-k-maturite-2", "Příprava k maturitě", "u-pavel", 4, "10:00", "11:00", 20, [], { allowedGrades: [4], description: "Opakování a nácvik ústní části. Jen pro maturanty." }),
    { ...course("poezie-3", "Poezie a rap", "u-jakubcova", 3, "11:30", "12:30", 14, [], { published: false, description: "Rytmus, rým a obraz od Máchy po současný rap." }), period: DEMO_PERIODS[2] },
    course("nova-matematika-2", "Matematika v přírodě", "u-jakubcova", 5, "11:00", "12:00", 12, [], { published: false, description: "Rozpracovaný kurz — studenti ho zatím nevidí." }),
    {
      ...base, id: "fotografie", kind: "atelier", title: "Fotografie", teacherId: "u-hankova", period: P2, startsOn: "2026-11-02", endsOn: "2026-11-27",
      slots: [{ day: 1, start: "09:00", end: "11:30" }], capacity: 12, studentIds: S.slice(0, 7), tone: "violet", ...ATELIERY,
      description: "Reportážní fotka: světlo, kompozice a vyprávění příběhu v sérii snímků.",
    },
    {
      ...base, id: "sachy-2", kind: "atelier", title: "Šachy pro pokročilé", teacherId: "u-lukes", period: P2, startsOn: "2026-11-02", endsOn: "2026-11-27",
      slots: [{ day: 1, start: "09:00", end: "11:30" }], capacity: 10, studentIds: ["u-liska", ...S.slice(8, 12)], tone: "violet", ...ATELIERY,
      description: "Zahájení, taktika a rozbor vlastních partií.",
    },
    {
      ...base, id: "retorika", kind: "atelier", title: "Rétorika", teacherId: "u-kumstat", period: P2, startsOn: "2026-11-30", endsOn: "2026-12-18",
      slots: [{ day: 1, start: "09:00", end: "11:30" }], capacity: 12, studentIds: [], tone: "violet",
      published: false, announceReady: true,
      description: "Hlas, pauza a argument. Zakončeno veřejnou debatou.",
    },
    {
      ...base, id: "zazij-evropu", kind: "expedice", title: "Zažij Evropu!", teacherId: "u-kubesova", coTeacherIds: ["u-kumstat"], period: null,
      startsOn: "2027-04-12", endsOn: "2027-04-16", location: "Vlakem přes 4 země", slots: [], capacity: 12, studentIds: S.slice(0, 5), tone: "teal", ...EXPEDICE,
      description: "Vlakem napříč čtyřmi zeměmi. Plán a rozpočet si připravíte sami.",
    },
    {
      ...base, id: "krkonose-na-snezu", kind: "expedice", title: "Krkonoše na sněžnicích", teacherId: "u-lukes", coTeacherIds: ["u-pietraszek"], period: null,
      startsOn: "2027-04-12", endsOn: "2027-04-16", location: "Pec pod Sněžkou", slots: [], capacity: 10, studentIds: S.slice(5, 9), tone: "teal",
      published: false, announceReady: false,
      description: "Horská chata, sněžnice a lavinová prevence s instruktorem.",
    },
  ];
}

/** Ukázková čekací řada: slug → počet čekajících a pořadí jednotlivých studentů. */
export const DEMO_WAITLIST: Record<string, string[]> = {
  "chemie-leku-a-jedu-2": ["u-vesely", "u-liska", "u-kral"],
};

// Obsah tříd, který zatím žije jen v ukázkových datech (týmy). Nástěnka, chat
// a zprávy jsou v demo-communication.ts.
export const DEMO_CLASSROOMS: Record<string, ClassroomContent> = {
  "prezentacni-schopnosti": {
    topics: [],
    teams: [],
    upcoming: [],
  },
};

/** Ukázkové údaje pro karty na Domově (úkoly, hlasování a zprávy přijdou v etapách 2–4). */
export const DEMO_HOME = {
  tasks: { open: 6, done: 4, waiting: 3, late: 3 },
  toGrade: 6,
  polls: { waiting: 2, running: 3, closed: 2, nextEnd: "Nože na expedici, za 2 dny" },
  messages: { unread: 3, from: ["u-jaukner", "u-komarek"] },
  deadlines: [
    { date: "2026-10-21", title: "Reflexe prezentace z TEDx", meta: "Ateliér Prezentační schopnosti · 23:59", urgent: true },
    { date: "2026-10-22", title: "Příprava týmové prezentace", meta: "Ateliér Prezentační schopnosti", urgent: false },
    { date: "2026-10-26", title: "Esej: fraktály v přírodě", meta: "Komplexní čísla a fraktály", urgent: false },
  ],
  votes: [
    { title: "Nože na expedici", ends: "za 2 dny", soon: true, percent: 64 },
    { title: "Páteční ateliéry od 10:00", ends: "za 4 dny", soon: false, percent: 41 },
  ],
};
