// Ukázková data pro etapu 1. Jména, kurzy a časy odpovídají schválenému návrhu
// (design/*.dc.html). Až bude hotové Supabase, tento soubor zůstane jen jako seed.

import type { Activity, ClassroomContent, User } from "./types";

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

export const DEMO_ACTIVITIES: Activity[] = [
  // Kurzy
  { id: "psychoterapeuticke-minimum", kind: "kurz", title: "Psychoterapeutické minimum", teacherId: "u-pietraszek", room: "učebna 101", meetUrl: "https://meet.google.com/psy-mini-tue", allowedGrades: null, slots: [{ day: 2, start: "09:00", end: "10:00" }], studentIds: ["u-liska", "u-komarek", "u-kolarova", "u-jaukner", "u-novotna", "u-svobodova", "u-benes", "u-kral", "u-vesely", "u-cerny", "u-maly"], capacity: 16, tone: "blue" },
  { id: "chemie-leku-a-jedu", kind: "kurz", title: "Chemie léků a jedů", teacherId: "u-pietraszek", room: "laboratoř", meetUrl: "https://meet.google.com/che-leky-jed", allowedGrades: null, slots: [{ day: 2, start: "10:00", end: "11:00" }], studentIds: ["u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna", "u-kubicek", "u-maly", "u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-vesely", "u-horakova"], capacity: 16, tone: "teal" },
  { id: "literatura-ve-filmu", kind: "kurz", title: "Literatura ve filmu", teacherId: "u-jakubcova", room: "učebna 204", meetUrl: "https://meet.google.com/lit-film-tue", allowedGrades: null, slots: [{ day: 2, start: "11:30", end: "12:30" }], studentIds: ["u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna", "u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-vesely"], capacity: 18, tone: "violet" },
  { id: "umim-se-ucit", kind: "kurz", title: "Umím se učit", teacherId: "u-jakubcova", room: "učebna 101", meetUrl: "https://meet.google.com/umi-ucit-wed", allowedGrades: null, slots: [{ day: 3, start: "09:00", end: "10:00" }], studentIds: PRESENTACE, capacity: 16, tone: "blueDark" },
  { id: "komplexni-cisla-a-fraktaly", kind: "kurz", title: "Komplexní čísla a fraktály", teacherId: "u-pavel", room: "učebna 102", meetUrl: "https://meet.google.com/kom-frak-wed", allowedGrades: null, slots: [{ day: 3, start: "10:00", end: "11:00" }], studentIds: ["u-liska", "u-komarek", "u-cerny", "u-svobodova", "u-vesely", "u-benes", "u-kral"], capacity: 14, tone: "blueDark" },
  { id: "cestomanie", kind: "kurz", title: "Cestománie", teacherId: "u-kumstat", room: "učebna 204", meetUrl: "https://meet.google.com/ces-toma-wed", allowedGrades: null, slots: [{ day: 3, start: "11:30", end: "12:30" }], studentIds: ["u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna", "u-kubicek", "u-maly", "u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-vesely", "u-horakova"], capacity: 16, tone: "blue" },
  { id: "jak-cist-film", kind: "kurz", title: "Jak číst film", teacherId: "u-kubesova", room: "promítací sál", meetUrl: "https://meet.google.com/jak-cist-flm", allowedGrades: null, slots: [{ day: 1, start: "12:00", end: "13:00" }, { day: 4, start: "12:00", end: "13:00" }], studentIds: ["u-liska", "u-kolarova", "u-jaukner", "u-novotna", "u-kubicek", "u-dvorakova", "u-kral", "u-horakova"], capacity: 16, tone: "violet" },

  // Ateliéry
  { id: "prezentacni-schopnosti", kind: "atelier", title: "Prezentační schopnosti", teacherId: "u-hankova", room: "učebna 204", meetUrl: "https://meet.google.com/abc-defg-hij", allowedGrades: null, slots: [{ day: 1, start: "09:00", end: "11:30" }], studentIds: PRESENTACE, capacity: 14, tone: "violet", project: { name: "Týmová prezentace", milestonesDone: 3, milestonesTotal: 5 } },
  { id: "sachy", kind: "atelier", title: "Šachy", teacherId: "u-lukes", room: "knihovna", meetUrl: "https://meet.google.com/sac-hyat-thu", allowedGrades: null, slots: [{ day: 4, start: "09:00", end: "11:30" }], studentIds: ["u-liska", "u-kubicek", "u-maly", "u-kral", "u-benes", "u-vesely", "u-dvorakova", "u-svobodova"], capacity: 12, tone: "blueDark", project: { name: "Rozbor vlastních partií", milestonesDone: 4, milestonesTotal: 5 } },
  { id: "autonomni-at", kind: "atelier", title: "Autonomní AT", teacherId: "u-lukes", room: "dílna", meetUrl: "https://meet.google.com/aut-onom-thu", allowedGrades: null, slots: [{ day: 4, start: "09:00", end: "11:30" }], studentIds: ["u-komarek", "u-cerny", "u-jaukner", "u-novotna", "u-kolarova", "u-horakova"], capacity: 12, tone: "teal", project: { name: "Robot pro školní zahradu", milestonesDone: 2, milestonesTotal: 5 } },
  { id: "sedm-hrichu-pameti", kind: "atelier", title: "Sedm hříchů paměti", teacherId: "u-jakubcova", room: "učebna 101", meetUrl: "https://meet.google.com/sed-hric-mon", allowedGrades: null, slots: [{ day: 1, start: "09:00", end: "11:30" }], studentIds: ["u-kolarova", "u-novotna", "u-dvorakova", "u-kral", "u-vesely", "u-benes", "u-horakova"], capacity: 10, tone: "violet", project: { name: "Výstava o paměti", milestonesDone: 1, milestonesTotal: 4 } },
  { id: "debatni-klub", kind: "atelier", title: "Debatní klub", teacherId: "u-kumstat", room: "aula", meetUrl: "https://meet.google.com/deb-klub-mon", allowedGrades: null, slots: [{ day: 1, start: "09:00", end: "11:30" }], studentIds: ["u-komarek", "u-cerny", "u-jaukner", "u-svobodova", "u-maly", "u-kubicek"], capacity: 12, tone: "blue", project: { name: "Turnaj s gymnáziem", milestonesDone: 2, milestonesTotal: 4 } },

  // Ostatní (pro všechny studenty)
  { id: "mezioborovy-seminar", kind: "ostatni", title: "Mezioborový seminář", teacherId: "u-pavel", room: "aula", meetUrl: "https://meet.google.com/mez-semi-tue", allowedGrades: null, slots: [{ day: 2, start: "13:00", end: "14:00" }], studentIds: ALL_STUDENTS, tone: "teal" },
  { id: "tridnicka-hodina", kind: "ostatni", title: "Třídnická hodina", teacherId: "u-pavel", room: "kmenová třída", meetUrl: "https://meet.google.com/tri-hodi-fri", allowedGrades: null, slots: [{ day: 5, start: "09:00", end: "10:00" }], studentIds: ALL_STUDENTS, tone: "teal" },
  { id: "priprava-expedice", kind: "ostatni", title: "Příprava expedice", teacherId: "u-kumstat", room: "aula", meetUrl: "https://meet.google.com/exp-edic-fri", allowedGrades: null, slots: [{ day: 5, start: "10:30", end: "12:00" }], studentIds: ALL_STUDENTS, tone: "teal" },
];

// Obsah tříd (nástěnka, témata, týmy, chat). Plný obsah má ateliér z návrhu,
// ostatní třídy dostanou jednoduchou nástěnku.
export const DEMO_CLASSROOMS: Record<string, ClassroomContent> = {
  "prezentacni-schopnosti": {
    stream: [
      {
        type: "post",
        id: "p1",
        authorId: "u-hankova",
        when: "dnes 8:12",
        label: "oznámení",
        text: "Dobré ráno! Dnes začínáme o 15 minut později, sejdeme se na Meetu v 9:15. Do příští hodiny si prosím projděte přiložený materiál ke struktuře prezentace.",
        attachments: [
          { kind: "pdf", title: "Struktura prezentace", meta: "PDF · 2,4 MB" },
          { kind: "doc", title: "Šablona osnovy", meta: "Google Dokument · každý dostane kopii" },
        ],
        comments: 3,
      },
      { type: "task", id: "t1", title: "Tereza Hanková zadala nový týmový úkol: Příprava týmové prezentace", meta: "včera 16:40 · termín čt 22. 10." },
      { type: "material", id: "m1", title: "Nový materiál: Záznam z minulé hodiny", meta: "po 12. 10. · nahrávka z Meetu, 1 h 54 min" },
    ],
    topics: [
      {
        name: "Téma 2 · Hlas, tělo a tréma",
        items: [
          { id: "w1", kind: "tym", title: "Příprava týmové prezentace", meta: "Týmový úkol · termín čt 22. 10.", status: "Čeká", statusTone: "ceka" },
          { id: "w2", kind: "ukol", title: "Reflexe prezentace z TEDx", meta: "Individuální · termín st 21. 10. 23:59", status: "Čeká", statusTone: "ceka" },
          { id: "w3", kind: "video", title: "Záznam z hodiny 12. 10.", meta: "Nahrávka z Meetu · 1 h 54 min", status: "Materiál", statusTone: "info" },
        ],
      },
      {
        name: "Téma 1 · Struktura a příběh",
        items: [
          { id: "w4", kind: "pdf", title: "Struktura prezentace", meta: "Materiál · 2,4 MB", status: "Materiál", statusTone: "info" },
          { id: "w5", kind: "kviz", title: "Rétorické figury", meta: "Kvíz · 10 otázek", status: "8/10 bodů", statusTone: "hotovo" },
          { id: "w6", kind: "ukol", title: "Osnova vlastní prezentace", meta: "Individuální · odevzdáno 5. 10.", status: "Hodnoceno", statusTone: "hotovo" },
        ],
      },
    ],
    teams: [
      { name: "Tým A · Klima", memberIds: ["u-liska", "u-komarek", "u-kolarova", "u-cerny"] },
      { name: "Tým B · Technologie", memberIds: ["u-jaukner", "u-novotna", "u-kubicek", "u-maly"] },
      { name: "Tým C · Města", memberIds: ["u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-horakova", "u-vesely"] },
    ],
    chat: [
      { id: "c1", authorId: "u-hankova", time: "8:14", text: "Kdo se dnes připojuje online, napište sem, ať vím, s kým počítat." },
      { id: "c2", authorId: "u-komarek", time: "8:20", text: "Já budu na Meetu, jsem ještě ve vlaku." },
      { id: "c3", authorId: "u-jaukner", time: "8:31", text: "Můžeme si v pátek půjčit projektor do 204?" },
    ],
    upcoming: [
      { title: "Reflexe prezentace z TEDx", when: "St 21. 10. 23:59", urgent: true },
      { title: "Příprava týmové prezentace", when: "Čt 22. 10.", urgent: false },
    ],
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
