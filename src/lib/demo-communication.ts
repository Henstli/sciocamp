// Ukázková data pro etapu 3 (nástěnka, chat třídy, zprávy, notifikace).
// Časy jsou pevné (kolem 18.–19. 10. 2026), aby ukázka vypadala stále stejně.

import type { ClassMessage, ConversationSummary, DirectMessage, NotificationItem, Post } from "./types";

export const DEMO_POSTS: Record<string, Post[]> = {
  "prezentacni-schopnosti": [
    {
      id: "p1",
      authorId: "u-hankova",
      body: "Dobré ráno! Dnes začínáme o 15 minut později, sejdeme se na Meetu v 9:15. Do příští hodiny si prosím projděte přiložený materiál ke struktuře prezentace.",
      links: [{ title: "Šablona osnovy", url: "https://docs.google.com/document/d/sablona-osnovy" }],
      files: [{ path: "demo/struktura.pdf", name: "Struktura prezentace.pdf", size: 2_500_000 }],
      createdAt: "2026-10-19T06:12:00Z",
      comments: [
        { id: "pc1", authorId: "u-komarek", body: "Díky, budu tam.", createdAt: "2026-10-19T06:20:00Z" },
        { id: "pc2", authorId: "u-kolarova", body: "Platí i pro tým B?", createdAt: "2026-10-19T06:31:00Z" },
        { id: "pc3", authorId: "u-hankova", body: "Ano, pro všechny.", createdAt: "2026-10-19T06:35:00Z" },
      ],
    },
  ],
  "literatura-ve-filmu": [
    {
      id: "p2",
      authorId: "u-jakubcova",
      body: "Vítejte v kurzu! Odkaz na Meet najdete vpravo a platí pro celé období. Seznam filmů k povinnému zhlédnutí je v materiálech.",
      links: [],
      files: [],
      createdAt: "2026-09-01T07:00:00Z",
      comments: [],
    },
  ],
};

export const DEMO_CLASS_CHAT: Record<string, ClassMessage[]> = {
  "prezentacni-schopnosti": [
    { id: "c1", authorId: "u-hankova", body: "Kdo se dnes připojuje online, napište sem, ať vím, s kým počítat.", createdAt: "2026-10-19T06:14:00Z", file: null },
    { id: "c2", authorId: "u-komarek", body: "Já budu na Meetu, jsem ještě ve vlaku.", createdAt: "2026-10-19T06:20:00Z", file: null },
    { id: "c3", authorId: "u-jaukner", body: "Můžeme si v pátek sdílet obrazovku všichni najednou?", createdAt: "2026-10-19T06:31:00Z", file: null },
  ],
};

/** Konverzace ukázkového studenta (u-liska) podle návrhu design/Zpravy.dc.html. */
export const DEMO_CONVERSATIONS: ConversationSummary[] = [
  { id: "k-lukes", otherId: "u-lukes", lastAt: "2026-10-19T08:12:00Z", lastBody: "Ve čtvrtek začínáme o půl hodiny dřív.", lastMine: false, lastHasFile: false, unread: 0 },
  { id: "k-jaukner", otherId: "u-jaukner", lastAt: "2026-10-19T07:40:00Z", lastBody: "Nevíš, jestli zítra platí sraz u vchodu?", lastMine: false, lastHasFile: false, unread: 1 },
  { id: "k-jakubcova", otherId: "u-jakubcova", lastAt: "2026-10-18T12:06:00Z", lastBody: "Děkuju za odevzdaný seznam povinné literatury. Vypadá to v pořádku :)", lastMine: false, lastHasFile: false, unread: 0 },
  { id: "k-cerny", otherId: "u-cerny", lastAt: "2026-10-12T15:00:00Z", lastBody: "Díky, mám to.", lastMine: false, lastHasFile: false, unread: 0 },
  { id: "k-komarek", otherId: "u-komarek", lastAt: "2026-10-11T18:00:00Z", lastBody: "Půjdeš se mnou odevzdat ten projekt?", lastMine: false, lastHasFile: false, unread: 2 },
];

export const DEMO_MESSAGES: Record<string, DirectMessage[]> = {
  "k-jakubcova": [
    { id: "dm1", authorId: "u-jakubcova", body: "Ahoj Šimone, nezapomeň prosím na seznam povinné literatury, potřebuju ho do zítřka.", file: null, createdAt: "2026-10-18T11:20:00Z" },
    { id: "dm2", authorId: "u-liska", body: "Tady je, snad je kompletní.", file: { path: "demo/seznam.pdf", name: "Seznam_literatury.pdf", size: 1_200_000 }, createdAt: "2026-10-18T11:58:00Z" },
    { id: "dm3", authorId: "u-jakubcova", body: "Děkuju za odevzdaný seznam povinné literatury. Vypadá to v pořádku :)", file: null, createdAt: "2026-10-18T12:06:00Z" },
  ],
  "k-jaukner": [{ id: "dm4", authorId: "u-jaukner", body: "Nevíš, jestli zítra platí sraz u vchodu?", file: null, createdAt: "2026-10-19T07:40:00Z" }],
  "k-lukes": [{ id: "dm5", authorId: "u-lukes", body: "Ve čtvrtek začínáme o půl hodiny dřív.", file: null, createdAt: "2026-10-19T08:12:00Z" }],
  "k-cerny": [
    { id: "dm6", authorId: "u-liska", body: "Posílám ti poznámky z fyziky.", file: null, createdAt: "2026-10-12T14:40:00Z" },
    { id: "dm7", authorId: "u-cerny", body: "Díky, mám to.", file: null, createdAt: "2026-10-12T15:00:00Z" },
  ],
  "k-komarek": [
    { id: "dm8", authorId: "u-komarek", body: "Ahoj!", file: null, createdAt: "2026-10-11T17:58:00Z" },
    { id: "dm9", authorId: "u-komarek", body: "Půjdeš se mnou odevzdat ten projekt?", file: null, createdAt: "2026-10-11T18:00:00Z" },
  ],
};

export const DEMO_NOTIFICATIONS: NotificationItem[] = [
  { id: "n1", kind: "oznameni", title: "Tereza Hanková přidala oznámení", body: "Prezentační schopnosti: Dobré ráno! Dnes začínáme o 15 minut později…", href: "/ateliery/prezentacni-schopnosti", createdAt: "2026-10-19T06:12:00Z", read: false },
  { id: "n2", kind: "hodnoceni", title: "Úkol je vrácený k doplnění: Rozbor scény z filmu", body: "Doplň prosím rozbor střihu v závěru scény.", href: "/ukoly", createdAt: "2026-10-18T15:30:00Z", read: false },
  { id: "n3", kind: "ukol", title: "Nový úkol: Reflexe prezentace z TEDx", body: "Prezentační schopnosti", href: "/ukoly", createdAt: "2026-10-17T10:00:00Z", read: true },
];
