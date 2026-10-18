// Ukázkové úkoly pro ukázkový režim (bez Supabase). Jen ke čtení.

import type { Assignment, Comment, Work } from "./types";

type DemoAssignment = Omit<Assignment, "activityTitle" | "activityKind">;

export const DEMO_ASSIGNMENTS: DemoAssignment[] = [
  {
    id: "a-osnova", activityId: "prezentacni-schopnosti", kind: "ukol", title: "Osnova vlastní prezentace",
    instructions: "Napiš osnovu desetiminutové prezentace: úvod, tři hlavní body a závěr. Ke každému bodu jednu větu.",
    topic: "Téma 1 · Struktura a příběh", dueAt: "2026-10-05T21:59:00Z", maxPoints: 20, links: [], createdAt: "2026-09-28T08:00:00Z",
  },
  {
    id: "a-struktura", activityId: "prezentacni-schopnosti", kind: "material", title: "Struktura prezentace",
    instructions: "Podklad k první hodině — projděte si ho před dalším setkáním.",
    topic: "Téma 1 · Struktura a příběh", dueAt: null, maxPoints: null,
    links: [{ title: "Google Prezentace", url: "https://docs.google.com/presentation/d/ukazka" }], createdAt: "2026-09-21T08:00:00Z",
  },
  {
    id: "a-tedx", activityId: "prezentacni-schopnosti", kind: "ukol", title: "Reflexe prezentace z TEDx",
    instructions: "Podívej se na jednu přednášku z TEDx a napiš půl strany: co řečníkovi fungovalo a co bys udělal jinak.",
    topic: "Téma 2 · Hlas, tělo a tréma", dueAt: "2026-10-21T21:59:00Z", maxPoints: 10, links: [], createdAt: "2026-10-12T08:00:00Z",
  },
  {
    id: "a-tymova", activityId: "prezentacni-schopnosti", kind: "ukol", title: "Příprava týmové prezentace",
    instructions:
      "Připravte v týmu desetiminutovou prezentaci na téma, které jste si vybrali minulou hodinu. Každý člen týmu mluví alespoň dvě minuty.\n\nOdevzdejte prezentaci (Google Prezentace nebo PDF), osnovu s rozdělením rolí a seznam zdrojů.",
    topic: "Téma 2 · Hlas, tělo a tréma", dueAt: "2026-10-22T21:59:00Z", maxPoints: 100,
    links: [{ title: "Rubrika hodnocení", url: "https://docs.google.com/document/d/ukazka" }], createdAt: "2026-10-19T14:40:00Z",
  },
  {
    id: "a-recenze", activityId: "literatura-ve-filmu", kind: "ukol", title: "Recenze filmové adaptace",
    instructions: "Vyber si filmovou adaptaci knihy, kterou jsi četl/a, a napiš recenzi (1–2 strany). Zaměř se na to, co film z knihy vynechal a proč.",
    topic: null, dueAt: "2026-10-16T21:59:00Z", maxPoints: 20, links: [], createdAt: "2026-10-06T09:00:00Z",
  },
  {
    id: "a-literatura", activityId: "literatura-ve-filmu", kind: "ukol", title: "Seznam povinné literatury",
    instructions: "Napiš, které tři knihy ze seznamu si vybereš na tento blok.", topic: null,
    dueAt: "2026-10-17T21:59:00Z", maxPoints: null, links: [], createdAt: "2026-10-01T09:00:00Z",
  },
  {
    id: "a-fraktaly", activityId: "komplexni-cisla-a-fraktaly", kind: "ukol", title: "Esej: fraktály v přírodě",
    instructions: "Najdi tři příklady fraktálů v přírodě, vyfoť je a ke každému napiš, jak souvisí s tím, co jsme probírali.",
    topic: null, dueAt: "2026-10-26T22:59:00Z", maxPoints: 30, links: [], createdAt: "2026-10-14T09:00:00Z",
  },
  {
    id: "a-scena", activityId: "jak-cist-film", kind: "ukol", title: "Rozbor scény z filmu",
    instructions: "Rozeber jednu scénu (do 3 minut) — kamera, střih, zvuk. Přilož časový údaj, odkud scéna je.",
    topic: null, dueAt: "2026-10-15T21:59:00Z", maxPoints: 15, links: [], createdAt: "2026-10-08T09:00:00Z",
  },
];

/** Práce studentů: klíč „idÚkolu:idStudenta“ */
export const DEMO_WORK: Record<string, Work> = {
  "a-osnova:u-liska": {
    submission: { status: "odevzdano", links: [{ title: "Google Dokument", url: "https://docs.google.com/document/d/ukazka" }], note: null, submittedAt: "2026-10-05T17:20:00Z", files: [] },
    review: { result: "splneno", points: 18, feedback: "Pěkná struktura, jen závěr by mohl víc navázat na úvod.", request: null, reviewedAt: "2026-10-07T10:00:00Z" },
  },
  "a-literatura:u-liska": {
    submission: { status: "odevzdano", links: [], note: "Babička, Saturnin, Krysař", submittedAt: "2026-10-16T18:00:00Z", files: [] },
    review: { result: "splneno", points: null, feedback: "Dobrý výběr.", request: null, reviewedAt: "2026-10-17T08:00:00Z" },
  },
  "a-scena:u-liska": {
    submission: { status: "odevzdano", links: [], note: null, submittedAt: "2026-10-15T20:00:00Z", files: [{ path: "demo/rozbor.pdf", name: "rozbor-sceny.pdf", size: 182000 }] },
    review: { result: "vraceno", points: null, feedback: "Rozbor kamery je výborný.", request: "Doplň prosím časový údaj scény a pár vět ke zvuku.", reviewedAt: "2026-10-16T09:00:00Z" },
  },
  "a-recenze:u-komarek": {
    submission: { status: "odevzdano", links: [{ title: "Google Dokument", url: "https://docs.google.com/document/d/ukazka" }], note: null, submittedAt: "2026-10-15T19:00:00Z", files: [] },
    review: null,
  },
  "a-recenze:u-kolarova": {
    submission: { status: "odevzdano", links: [], note: null, submittedAt: "2026-10-16T20:00:00Z", files: [{ path: "demo/recenze.pdf", name: "recenze.pdf", size: 240000 }] },
    review: { result: "splneno", points: 17, feedback: "Výborné postřehy.", request: null, reviewedAt: "2026-10-17T09:00:00Z" },
  },
  "a-recenze:u-jaukner": {
    submission: { status: "odevzdano", links: [], note: null, submittedAt: "2026-10-17T07:00:00Z", files: [{ path: "demo/recenze2.pdf", name: "recenze-jaukner.pdf", size: 120000 }] },
    review: null,
  },
};

export const DEMO_COMMENTS: Record<string, Comment[]> = {
  "a-tymova:u-liska": [
    { id: "c1", authorId: "u-liska", body: "Můžeme místo PDF odevzdat odkaz na Google Prezentaci?", createdAt: "2026-10-19T17:30:00Z" },
    { id: "c2", authorId: "u-hankova", body: "Jasně, jen ji nasdílejte na celou školu.", createdAt: "2026-10-19T18:05:00Z" },
  ],
};
