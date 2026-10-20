// Ukázková data pro Návrhy a Hlasování (režim bez Supabase).

import type { Proposal, ProposalComment, Wish } from "./proposals";

type DemoProposal = Omit<Proposal, "supported" | "commentCount" | "supportCount"> & { supporters: string[] };

export const DEMO_PROPOSALS: DemoProposal[] = [
  {
    id: "navrh-mikrovlnka",
    authorId: "u-liska",
    title: "Mikrovlnka do druhého patra",
    body: "V jídelně se o přestávce stojí fronta na jedinou mikrovlnku. Druhá ve druhém patře by ušetřila čas všem.",
    category: "prostory",
    goal: "schvaleni",
    needProposed: 15,
    need: 15,
    status: "open",
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    reachedAt: null,
    createdAt: "2026-10-17T09:12:00Z",
    supporters: ["u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna", "u-kubicek", "u-maly", "u-svobodova", "u-benes", "u-dvorakova"],
  },
  {
    id: "navrh-fotografie",
    authorId: "u-hankova",
    title: "Ateliér reportážní fotografie",
    body: "Ateliér zaměřený na reportážní fotku. Lektorka se už nabídla, potřebujeme jen vědět, jestli je zájem.",
    category: "vyuka",
    goal: "shromazdeni",
    needProposed: 10,
    need: 10,
    status: "open",
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    reachedAt: "2026-10-18T10:00:00Z",
    createdAt: "2026-10-12T08:00:00Z",
    supporters: ["u-hankova", "u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna", "u-kubicek", "u-maly", "u-svobodova", "u-benes", "u-dvorakova"],
  },
  {
    id: "navrh-kola",
    authorId: "u-komarek",
    title: "Jarní expedice na kolech",
    body: "Třídenní cesta podél Vltavy s noclehy v kempech.",
    category: "expedice",
    goal: "schvaleni",
    needProposed: 20,
    need: null,
    status: "open",
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    reachedAt: null,
    createdAt: "2026-10-19T15:30:00Z",
    supporters: ["u-komarek", "u-cerny", "u-jaukner"],
  },
  {
    id: "navrh-mobily",
    authorId: "u-jaukner",
    title: "Zákaz mobilů v ateliérech",
    body: "Telefony by se během ateliérů odkládaly do boxu.",
    category: "vyuka",
    goal: "schvaleni",
    needProposed: 10,
    need: 10,
    status: "zamitnuto",
    resolution: "Telefony v ateliérech často potřebujete k práci (fotky, nahrávky). Domluvte se raději s vyučujícím konkrétního ateliéru.",
    resolvedBy: "u-pavel",
    resolvedAt: "2026-10-08T12:00:00Z",
    reachedAt: "2026-10-06T12:00:00Z",
    createdAt: "2026-10-01T12:00:00Z",
    supporters: ["u-jaukner", "u-maly", "u-svobodova", "u-benes", "u-dvorakova", "u-kral", "u-horakova", "u-vesely", "u-novotna", "u-kubicek"],
  },
];

export const DEMO_PROPOSAL_COMMENTS: Record<string, ProposalComment[]> = {
  "navrh-mikrovlnka": [
    { id: "c1", authorId: "u-komarek", body: "Klidně se složíme, nová stojí kolem dvou tisíc.", createdAt: "2026-10-17T10:02:00Z" },
    { id: "c2", authorId: "u-jakubcova", body: "Ve druhém patře je zásuvka u kuchyňky, tam by šla.", createdAt: "2026-10-18T07:45:00Z" },
  ],
  "navrh-fotografie": [{ id: "c3", authorId: "u-cerny", body: "Šel bych do toho!", createdAt: "2026-10-13T16:20:00Z" }],
};

/** Datum před `days` dny (ukázková přání stárnou s časem, ať nevyprší). */
function daysAgo(days: number, hours = 0): string {
  return new Date(Date.now() - (days * 24 + hours) * 3_600_000).toISOString();
}

type DemoWish = Omit<Wish, "voted" | "voteCount"> & { voters: string[] };

export const DEMO_WISHES: DemoWish[] = [
  {
    id: "prani-podcast",
    authorId: "u-kolarova",
    kind: "atelier",
    title: "Podcast od nápadu po vydání",
    body: "Natočit vlastní podcast, naučit se stříhat zvuk a vydat ho.",
    status: "open",
    activityId: null,
    note: null,
    closedAt: null,
    createdAt: daysAgo(6),
    voters: ["u-kolarova", "u-liska", "u-cerny", "u-novotna", "u-kubicek", "u-hankova", "u-benes"],
  },
  {
    id: "prani-tatry",
    authorId: "u-jaukner",
    kind: "expedice",
    title: "Přechod Tater",
    body: "Pětidenní přechod s noclehy na chatách.",
    status: "open",
    activityId: null,
    note: null,
    closedAt: null,
    createdAt: daysAgo(13, 10),
    voters: ["u-jaukner", "u-komarek", "u-maly", "u-vesely"],
  },
  {
    id: "prani-finance",
    authorId: "u-cerny",
    kind: "kurz",
    title: "Osobní finance a investování",
    body: "Jak funguje rozpočet, spoření, hypotéka a ETF.",
    status: "open",
    activityId: null,
    note: null,
    closedAt: null,
    createdAt: daysAgo(2),
    voters: ["u-cerny", "u-dvorakova", "u-kral", "u-horakova", "u-svobodova", "u-pietraszek", "u-vesely", "u-benes", "u-maly"],
  },
  {
    id: "prani-prezentace",
    authorId: "u-novotna",
    kind: "atelier",
    title: "Jak mluvit před lidmi",
    body: "",
    status: "vypsano",
    activityId: "prezentacni-schopnosti",
    note: null,
    closedAt: daysAgo(2),
    createdAt: daysAgo(10),
    voters: ["u-novotna", "u-liska", "u-kolarova"],
  },
];
