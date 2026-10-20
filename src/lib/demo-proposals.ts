// Ukázková data pro Návrhy a Hlasování (režim bez Supabase).

import type { Proposal, ProposalComment, VoteChoice, Wish } from "./proposals";

/** Datum před `days` dny (ukázkové návrhy stárnou s časem). */
function ago(days: number, hours = 0): string {
  return new Date(Date.now() - (days * 24 + hours) * 3_600_000).toISOString();
}
function plus7(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 86_400_000).toISOString();
}

type DemoProposal = Omit<Proposal, "myChoice" | "commentCount" | "proCount" | "againstCount" | "neutralCount"> & {
  votes: Record<string, VoteChoice>;
};

const V = (pro: string[], proti: string[] = [], jedno: string[] = []): Record<string, VoteChoice> =>
  Object.fromEntries([...pro.map((u) => [u, "pro"]), ...proti.map((u) => [u, "proti"]), ...jedno.map((u) => [u, "jedno"])]);

export const DEMO_PROPOSALS: DemoProposal[] = [
  {
    id: "navrh-desata",
    authorId: "u-liska",
    title: "Začínat v onlinu v 10:00",
    body: "Ranní hodiny od 9:00 jsou pro hodně lidí brzo — kdo dojíždí nebo pracuje večer, nestíhá. Posunout začátek online výuky na 10:00 a obědovou pauzu zkrátit.",
    category: "rozvrh",
    goal: "schvaleni",
    needPercentProposed: 40,
    needPercent: 40,
    status: "open",
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    reachedAt: null,
    createdAt: ago(3),
    votingEndsAt: plus7(ago(3)),
    votes: V(["u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jaukner", "u-novotna"], ["u-maly", "u-pietraszek"], ["u-svobodova"]),
  },
  {
    id: "navrh-kamery",
    authorId: "u-hankova",
    title: "Zapnuté kamery aspoň na začátku hodiny",
    body: "Na začátku každé online hodiny se na pět minut všichni ukážeme, ať víme, s kým se učíme.",
    category: "online",
    goal: "shromazdeni",
    needPercentProposed: 25,
    needPercent: 25,
    status: "open",
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    reachedAt: ago(5),
    createdAt: ago(8),
    votingEndsAt: plus7(ago(8)),
    votes: V(["u-hankova", "u-liska", "u-komarek", "u-kolarova", "u-cerny", "u-jakubcova", "u-pavel"], ["u-jaukner", "u-kubicek"], ["u-maly", "u-benes"]),
  },
  {
    id: "navrh-sraz",
    authorId: "u-komarek",
    title: "Společný sraz naživo jednou za pololetí",
    body: "Celá škola se jednou za pololetí potká naživo — výlet, hry, poznat se mimo obrazovku.",
    category: "komunita",
    goal: "schvaleni",
    needPercentProposed: 30,
    needPercent: null,
    status: "open",
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    reachedAt: null,
    createdAt: ago(6, 14),
    votingEndsAt: plus7(ago(6, 14)),
    votes: V(["u-komarek", "u-cerny", "u-jaukner"]),
  },
  {
    id: "navrh-bez-znamek",
    authorId: "u-jaukner",
    title: "Úkoly bez termínu odevzdání",
    body: "Úkoly by neměly mít pevný termín, každý by si je odevzdal, kdy stihne.",
    category: "pravidla",
    goal: "schvaleni",
    needPercentProposed: 20,
    needPercent: 20,
    status: "zamitnuto",
    resolution: "Termíny pomáhají plánovat vám i vyučujícím. Kdo potřebuje víc času, domluví se s vyučujícím — odevzdání po termínu je povolené.",
    resolvedBy: "u-pavel",
    resolvedAt: ago(11),
    reachedAt: ago(14),
    createdAt: ago(19),
    votingEndsAt: plus7(ago(19)),
    votes: V(["u-jaukner", "u-maly", "u-svobodova", "u-benes", "u-dvorakova", "u-kral"], ["u-pietraszek", "u-kubesova"]),
  },
];

export const DEMO_PROPOSAL_COMMENTS: Record<string, ProposalComment[]> = {
  "navrh-desata": [
    { id: "c1", authorId: "u-komarek", body: "Ráno se mi líp soustředí, ale chápu, že pro dojíždějící je to těžký.", createdAt: "2026-10-17T10:02:00Z" },
    { id: "c2", authorId: "u-jakubcova", body: "Rozvrh na další období se dá ještě upravit, pokud se shodneme do konce listopadu.", createdAt: "2026-10-18T07:45:00Z" },
  ],
  "navrh-kamery": [{ id: "c3", authorId: "u-cerny", body: "Šel bych do toho!", createdAt: "2026-10-13T16:20:00Z" }],
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
