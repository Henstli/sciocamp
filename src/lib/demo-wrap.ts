// Ukázkový wrap (ukázkový režim a ukázky ve Správě → Nástroje).

import type { WrapData, WrapSchool } from "./wrap";

const SCHOOL: WrapSchool = {
  handed: 18420,
  reviews: 14900,
  messages: 96300,
  expeditions: 9,
  approved: 7,
  wishes: 11,
  topAtelier: "Prezentační schopnosti",
};

export function demoStudentWrap(name = "Šimon Samuel Liška", userId = "u-liska", season = 2026): WrapData {
  return {
    name,
    userId,
    season,
    school: SCHOOL,
    demo: true,
    kind: "student",
    mine: {
      handed: 128,
      onTime: 106,
      withDue: 117,
      topWeekday: 2,
      points: 1240,
      fullPoints: 18,
      passed: 121,
      reviewed: 126,
      courses: 14,
      ateliers: 4,
      teachers: 9,
      milestones: 17,
      expeditions: ["Za vlky do Javorníků", "Šumava pěšky", "Krkonoše na lyžích", "Vodou po Vltavě", "Pálava", "České Švýcarsko", "Jeseníky"],
      expeditionDays: 35,
      votes: 34,
      wishVotes: 12,
      wishes: 2,
      wishesFulfilled: ["Ateliér vaření"],
      proposals: 1,
      polls: 3,
      consultations: 7,
      consultationTop: "Anežka Jakubcová",
      messages: 2846,
      gifs: 41,
      topEmoji: "❤️",
      people: [
        { id: "u-komarek", name: "Eliot Komárek", count: 612 },
        { id: "u-kolarova", name: "Tereza Kolářová", count: 388 },
        { id: "u-jaukner", name: "Standa Jaukner", count: 201 },
      ],
      badges: [
        { key: "zakladatel", tier: 1 },
        { key: "pracant", tier: 2 },
        { key: "vypravnik", tier: 1 },
        { key: "vcas", tier: 1 },
        { key: "hlas-skoly", tier: 1 },
        { key: "snilek", tier: 1 },
      ],
      type: { key: "vypravnik", value: 7, beat: 0.94 },
    },
  };
}

export function demoStaffWrap(name = "Tereza Hanková", userId = "u-hankova", season = 2026): WrapData {
  return {
    name,
    userId,
    season,
    school: SCHOOL,
    demo: true,
    kind: "staff",
    mine: {
      courses: 3,
      ateliers: 2,
      expeditions: 1,
      students: 64,
      tasks: 42,
      materials: 18,
      topClass: "Prezentační schopnosti",
      reviews: 812,
      reviewDays: 2.3,
      feedback: 640,
      livelyTitle: "Prezentační schopnosti",
      livelyChat: 1204,
      livelyPosts: 37,
      posts: 37,
      consultations: 46,
      wishesFulfilled: ["Ateliér vaření", "Expedice Krkonoše"],
      proposalsResolved: 5,
      votes: 9,
      polls: 1,
      messages: 1530,
      gifs: 4,
      topEmoji: "👍",
      people: [
        { id: "u-jakubcova", name: "Anežka Jakubcová", count: 284 },
        { id: "u-liska", name: "Šimon Samuel Liška", count: 96 },
        { id: "u-pavel", name: "Miroslav Pavel", count: 71 },
      ],
      badges: [
        { key: "zakladatel", tier: 1 },
        { key: "mentor", tier: 2 },
        { key: "pruvodce", tier: 1 },
        { key: "konzultant", tier: 2 },
      ],
      type: { key: "mentor", value: 812, beat: 0.9 },
    },
  };
}
