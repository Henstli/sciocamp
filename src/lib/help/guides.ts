// Návody v Nápovědě. Text kroků je tady, obrázky a animace vyrábí skript
// `npm run napoveda:snimky` (scripts/help-shots.ts) podle `shot` u každého
// kroku: projde skutečný postup v ukázkovém režimu a uloží snímky do
// public/napoveda/ a souřadnice do src/lib/help/shots.json.
//
// Když se změní vzhled nebo postup, uprav kroky tady a spusť skript znovu.

/** Jak skript najde prvek na stránce (stejně jako Playwright). */
export type HelpLocator =
  | { role: "button" | "link" | "textbox" | "combobox" | "radio" | "checkbox" | "tab"; name: string; exact?: boolean }
  | { label: string; exact?: boolean }
  | { css: string }
  | { text: string; exact?: boolean };

export type HelpShot = {
  /** Kam jít před krokem (jinak pokračuje, kde skončil předchozí krok) */
  goto?: string;
  /** Výřez obrazovky: oblast kolem tohoto prvku */
  area: HelpLocator;
  /** Okraj kolem výřezu (px) */
  pad?: number;
  /** Nejvyšší výška výřezu (px), delší oblast se ořízne odshora */
  maxHeight?: number;
  /** Prvek, na který se v kroku ukazuje (hledá se uvnitř oblasti) */
  target?: HelpLocator;
  /** Co se s prvkem udělá: klik, psaní textu, výběr v seznamu, nebo jen ukázat */
  action?: "click" | "point" | { type: string; clear?: boolean } | { select: string };
  /** Po kliknutí zachytit, jak stránka vypadá potom (rozbalení, nové pole…) */
  after?: boolean;
  /** Příprava před snímkem (neukazuje se), např. zaškrtnout předchozí volbu */
  prepare?: ({ click: HelpLocator } | { fill: HelpLocator; text: string } | { check: HelpLocator })[];
};

export type HelpStep = {
  title: string;
  text: string;
  shot?: HelpShot;
};

export type HelpAudience = "all" | "staff" | "admin";

export type HelpGuide = {
  slug: string;
  title: string;
  topic: HelpTopic;
  audience: HelpAudience;
  /** Odhad čtení v minutách */
  minutes: number;
  /** Jedna věta: k čemu návod je */
  intro: string;
  /** Ukázkový účet, kterým skript postup prochází (jméno na přihlašovací stránce) */
  demoUser: string;
  steps: HelpStep[];
  /** Na co si dát pozor */
  tip?: string;
  /** Který krok (od 0) dát jako náhled v přehledu; jinak první se snímkem */
  cover?: number;
};

export type HelpTopic = "zaciname" | "ukoly" | "trida" | "sprava";

export const HELP_TOPICS: { key: HelpTopic; title: string }[] = [
  { key: "zaciname", title: "Začínáme" },
  { key: "trida", title: "Třída" },
  { key: "ukoly", title: "Úkoly a hodnocení" },
  { key: "sprava", title: "Správa školy" },
];

const ANEZKA = "Anežka Jakubcová";

export const HELP_GUIDES: HelpGuide[] = [
  {
    slug: "profil",
    title: "Nastav si profil",
    topic: "zaciname",
    audience: "all",
    minutes: 2,
    intro: "Profil vidí všichni ve škole. Fotka a pár slov o tobě pomůžou ostatním poznat, s kým mluví.",
    demoUser: ANEZKA,
    cover: 1,
    steps: [
      {
        title: "Otevři Nastavení",
        text: "Vlevo dole vedle svého jména klikni na ikonu s posuvníky. Na telefonu ji najdeš v menu.",
        shot: { goto: "/", area: { css: "aside" }, pad: 0, maxHeight: 240, target: { role: "link", name: "Nastavení" }, action: "click" },
      },
      {
        title: "Nahraj profilovou fotku",
        text: "Klikni na „Nahrát fotku“ a vyber obrázek z počítače nebo telefonu. Aplikace ho sama ořízne na čtverec a zmenší.",
        shot: {
          goto: "/nastaveni",
          area: { css: "section[aria-label='Profilová fotka']" },
          target: { role: "button", name: "Nahrát fotku" },
          action: "point",
        },
      },
      {
        title: "Napiš pár slov o sobě",
        text: "Do pole „O mně“ napiš, co učíš nebo co tě baví. Zobrazí se na tvém profilu.",
        shot: {
          area: { css: "main form:has(h2:text-is('Osobní údaje'))" },
          maxHeight: 420,
          target: { label: "O mně (nepovinné)" },
          action: { type: "Učím literaturu a film. Ráda poradím s výběrem knih na maturitu.", clear: true },
        },
      },
      {
        title: "Doplň telefon a Instagram",
        text: "Obojí je nepovinné. Telefon vyučujících vidí celá škola, telefon studenta jen vyučující. Instagram stačí napsat bez @.",
        shot: {
          area: { css: "main form:has(h2:text-is('Osobní údaje'))" },
          maxHeight: 300,
          target: { label: "Telefon (nepovinné)" },
          action: { type: "+420 604 555 210", clear: true },
        },
      },
      {
        title: "Ulož změny",
        text: "Klikni na „Uložit změny“ dole pod formulářem. Barvu profilu můžeš vybrat kolečky nad tlačítkem.",
        shot: {
          area: { css: "main form:has(h2:text-is('Osobní údaje'))" },
          target: { role: "button", name: "Uložit změny" },
          action: "point",
        },
      },
    ],
    tip: "Fotku a jméno uvidí všichni ve škole. Jméno a e-mail měnit nejde, ty spravuje škola.",
  },
  {
    slug: "meet",
    title: "Vlož odkaz na Meet do třídy",
    topic: "trida",
    audience: "staff",
    minutes: 2,
    intro: "Studenti se na online hodinu připojí jedním klikem. Stačí jednou vložit odkaz na Google Meet, platí pro celé období.",
    demoUser: ANEZKA,
    steps: [
      {
        title: "Otevři svou třídu",
        text: "V menu klikni na Kurzy (nebo Ateliéry) a u třídy na „Otevřít“.",
        shot: {
          goto: "/kurzy",
          area: { css: "article:has(:text-is('Literatura ve filmu'))" },
          target: { role: "link", name: "Otevřít" },
          action: "click",
        },
      },
      {
        title: "V panelu Příští hodina klikni na „Změnit odkaz na Meet“",
        text: "Panel je vpravo vedle nástěnky. Když třída ještě odkaz nemá, pole na vložení je rovnou otevřené.",
        shot: {
          goto: "/kurzy/literatura-ve-filmu",
          area: { css: "section[aria-label='Příští hodina']" },
          pad: 12,
          target: { role: "button", name: "Změnit odkaz na Meet" },
          action: "click",
          after: true,
        },
      },
      {
        title: "Vytvoř nový Meet",
        text: "Klikni na „Vytvoř nový Meet“. V nové kartě se otevře Google Meet: zkopíruj adresu z řádku prohlížeče (meet.google.com/…).",
        shot: {
          area: { css: "section[aria-label='Příští hodina']" },
          pad: 12,
          target: { role: "link", name: "Vytvoř nový Meet" },
          action: "point",
        },
      },
      {
        title: "Vlož odkaz",
        text: "Klikni do pole a vlož zkopírovanou adresu (Ctrl+V, na Macu Cmd+V).",
        shot: {
          area: { css: "section[aria-label='Příští hodina']" },
          pad: 12,
          target: { label: "Odkaz na Meet pro celé období" },
          action: { type: "https://meet.google.com/lit-film-tue", clear: true },
        },
      },
      {
        title: "Ulož",
        text: "Klikni na „Uložit“. Odkaz se hned ukáže studentům v třídě i v rozvrhu na Domově.",
        shot: {
          area: { css: "section[aria-label='Příští hodina']" },
          pad: 12,
          target: { role: "button", name: "Uložit", exact: true },
          action: "point",
        },
      },
    ],
    tip: "Odkaz platí pro celé období, nemusíš ho měnit před každou hodinou. Prázdné pole odkaz odebere.",
  },
  {
    slug: "zadat-ukol",
    title: "Zadej úkol",
    topic: "ukoly",
    audience: "staff",
    minutes: 3,
    intro: "Úkol uvidí všichni studenti zapsaní ve třídě. Můžeš ho zveřejnit hned, nebo připravit dopředu.",
    demoUser: ANEZKA,
    steps: [
      {
        title: "Klikni na „Zadat úkol“",
        text: "Tlačítko najdeš na stránce Úkoly nahoře vpravo. Úkol jde zadat i přímo ze třídy v záložce Úkoly a materiály.",
        shot: {
          goto: "/ukoly",
          area: { css: "main" },
          maxHeight: 260,
          target: { role: "link", name: "Zadat úkol" },
          action: "click",
        },
      },
      {
        title: "Vyber, co zadáváš, a třídu",
        text: "„Úkol“ studenti odevzdávají a ty ho hodnotíš. „Materiál“ je jen ke čtení (podklady, video). Pod tím vyber třídu.",
        shot: {
          goto: "/ukoly/novy?trida=literatura-ve-filmu",
          area: { css: "main form" },
          maxHeight: 250,
          target: { css: "label:has(select) select" },
          action: "point",
        },
      },
      {
        title: "Napiš název a zadání",
        text: "Název je to, co studenti uvidí v seznamu. Do zadání napiš, co mají udělat, co odevzdat a podle čeho budeš hodnotit.",
        shot: {
          area: { css: "main form" },
          maxHeight: 440,
          target: { label: "Název", exact: true },
          action: { type: "Recenze filmu Duna" },
        },
      },
      {
        title: "Doplň zadání",
        text: "Piš konkrétně, ať se studenti nemusí doptávat. Odkazy a soubory přidáš níž ve formuláři.",
        shot: {
          area: { css: "main form" },
          maxHeight: 440,
          target: { label: "Zadání", exact: true },
          action: { type: "Podívej se na film Duna (2021) a napiš recenzi na 1 stranu: co se ti líbilo, co ne a proč." },
        },
      },
      {
        title: "Nastav termín a body",
        text: "Termín napiš nebo vyber v kalendáři. Maximum bodů je nepovinné: bez bodů hodnotíš jen splněno / nesplněno a slovně.",
        shot: {
          area: { css: "main form" },
          maxHeight: 300,
          prepare: [],
          target: { label: "Maximum bodů (nepovinné)" },
          action: { type: "10" },
        },
      },
      {
        title: "Rozhodni, kdy ho studenti uvidí",
        text: "„Hned“ úkol zveřejní po uložení. „Naplánovat“ ho schová do zvoleného dne a času, studenti do té doby nic nevidí.",
        shot: {
          area: { css: "main form" },
          maxHeight: 360,
          target: { css: "label:has(:text-is('Naplánovat'))" },
          action: "click",
          after: true,
        },
      },
      {
        title: "Ulož úkol",
        text: "Tlačítko je úplně dole: „Zadat úkol“, u naplánovaného „Naplánovat“. Studenti dostanou oznámení hned, nebo až ve zvolený čas.",
        shot: {
          area: { css: "main form" },
          maxHeight: 220,
          target: { role: "button", name: "Naplánovat", exact: true },
          action: "point",
        },
      },
    ],
    tip: "Naplánovaný úkol studenti nevidí vůbec. Když ho chceš ukázat dřív, otevři ho a dej „Zveřejnit hned“.",
  },
  {
    slug: "hodnoceni",
    title: "Ohodnoť odevzdanou práci",
    topic: "ukoly",
    audience: "staff",
    minutes: 3,
    intro: "Hodnotí se bez známek: splněno, nesplněno, nebo vráceno k doplnění, body (pokud je úkol má) a slovní hodnocení.",
    demoUser: ANEZKA,
    steps: [
      {
        title: "Otevři úkol a vyber studenta",
        text: "V seznamu Práce studentů klikni na jméno. Odevzdané práce mají modrý štítek „Odevzdáno“.",
        shot: {
          goto: "/ukoly/a-recenze",
          area: { css: "section[aria-label='Práce studentů']" },
          maxHeight: 260,
          target: { css: "a:has(:text-is('Eliot Komárek'))" },
          action: "click",
        },
      },
      {
        title: "Prohlédni si odevzdanou práci",
        text: "Vpravo nahoře uvidíš soubory, odkazy a poznámku studenta. Kliknutím je otevřeš.",
        shot: {
          goto: "/ukoly/a-recenze?student=u-komarek",
          area: { css: "section[aria-label^='Práce: ']" },
          maxHeight: 170,
          target: { role: "link", name: "Google Dokument" },
          action: "point",
        },
      },
      {
        title: "Vyber výsledek",
        text: "„Splněno“ = práce je hotová. „Nesplněno“ úkol uzavře. „Vrátit k doplnění“ pošle práci zpátky studentovi.",
        shot: {
          area: { css: "section[aria-label^='Práce: ']" },
          maxHeight: 520,
          target: { css: "label:has(:text-is('Splněno'))" },
          action: "click",
        },
      },
      {
        title: "Zadej body a napiš hodnocení",
        text: "Body napiš z maxima úkolu. Slovní hodnocení je nepovinné, ale studentům hodně pomůže.",
        shot: {
          area: { css: "section[aria-label^='Práce: ']" },
          maxHeight: 520,
          target: { label: "Body" },
          action: { type: "18" },
        },
      },
      {
        title: "Ulož hodnocení",
        text: "Student dostane oznámení a hodnocení uvidí u úkolu. Pak můžeš vybrat dalšího studenta.",
        shot: {
          area: { css: "section[aria-label^='Práce: ']" },
          maxHeight: 520,
          target: { role: "button", name: "Uložit hodnocení" },
          action: "point",
        },
      },
      {
        title: "Když je potřeba něco doplnit",
        text: "Vyber „Vrátit k doplnění“ a napiš, co má student opravit. Práce se mu vrátí a může ji odevzdat znovu.",
        shot: {
          area: { css: "section[aria-label^='Práce: ']" },
          maxHeight: 620,
          target: { css: "label:has(:text-is('Vrátit k doplnění'))" },
          action: "click",
          after: true,
        },
      },
    ],
    tip: "Hodnocení můžeš kdykoli změnit. Pod hodnocením jsou soukromé komentáře: vidíš je jen ty a student.",
  },
  {
    slug: "tymovy-ukol",
    title: "Zadej týmový úkol",
    topic: "ukoly",
    audience: "staff",
    minutes: 2,
    intro: "Tým odevzdává jednu společnou práci. Týmy rozdělíš sám, nebo si je studenti vytvoří v úkolu.",
    demoUser: ANEZKA,
    steps: [
      {
        title: "Zaškrtni „Týmový úkol“",
        text: "Ve formuláři nového úkolu (nebo při úpravě) zaškrtni políčko pod termínem a body.",
        shot: {
          goto: "/ukoly/novy?trida=literatura-ve-filmu",
          area: { css: "main form" },
          maxHeight: 340,
          target: { role: "checkbox", name: "Týmový úkol" },
          action: "click",
          after: true,
        },
      },
      {
        title: "Vyber, kdo týmy rozdělí",
        text: "„Týmy rozdělím já“: rozdělíš je hned tady. „Studenti se rozdělí sami“: v úkolu si založí tým nebo se přidají k existujícímu, ty jen nastavíš největší velikost týmu.",
        shot: {
          area: { css: "main form" },
          maxHeight: 260,
          target: { role: "radio", name: "Týmy rozdělím já" },
          action: "point",
        },
      },
      {
        title: "Rozděl studenty náhodně",
        text: "Napiš počet týmů a klikni na „Rozdělit náhodně“. Studenty pak můžeš mezi týmy přesouvat.",
        shot: {
          area: { css: "main form" },
          maxHeight: 520,
          target: { role: "button", name: "Rozdělit náhodně", exact: true },
          action: "click",
          after: true,
        },
      },
    ],
    tip: "Hodnocení týmu se zkopíruje všem jeho členům. Když chceš někoho ohodnotit jinak, vyber u hodnocení „Koho hodnotíš“ jednotlivce.",
  },
  {
    slug: "pridat-uzivatele",
    title: "Přidej uživatele",
    topic: "sprava",
    audience: "admin",
    minutes: 2,
    intro: "Účty zakládá jen admin. Nový člověk dostane na školní e-mail pozvánku a nastaví si heslo.",
    demoUser: "Miroslav Pavel",
    steps: [
      {
        title: "Otevři Správu a klikni na „Přidat uživatele“",
        text: "V menu vyber Uživatelé a škola. Tlačítko je nad seznamem uživatelů.",
        shot: {
          goto: "/admin",
          area: { css: "main" },
          maxHeight: 470,
          target: { role: "button", name: "Přidat uživatele" },
          action: "click",
          after: true,
        },
      },
      {
        title: "Napiš celé jméno",
        text: "Jméno a příjmení tak, jak se má ukazovat v aplikaci. Později ho jde opravit tužkou v seznamu.",
        shot: {
          area: { css: "main form:has(h2:text-is('Přidat uživatele'))" },
          target: { label: "Celé jméno" },
          action: { type: "Jana Nováková" },
        },
      },
      {
        title: "Napiš školní e-mail",
        text: "Musí končit na @scioskola.cz, jiné adresy aplikace nepustí. Pozvánka přijde právě sem.",
        shot: {
          area: { css: "main form:has(h2:text-is('Přidat uživatele'))" },
          target: { label: "Školní e-mail" },
          action: { type: "jana.novakova@scioskola.cz" },
        },
      },
      {
        title: "Vyber roli a ročník",
        text: "Studentovi vyber ročník, učiteli můžeš napsat úvazek. Roli jde později změnit v seznamu.",
        shot: {
          area: { css: "main form:has(h2:text-is('Přidat uživatele'))" },
          target: { label: "Ročník" },
          action: { select: "2" },
        },
      },
      {
        title: "Pošli pozvánku",
        text: "Klikni na „Poslat pozvánku“. Člověk se objeví v seznamu se štítkem „Pozvánka odeslána“, dokud se poprvé nepřihlásí.",
        shot: {
          area: { css: "main form:has(h2:text-is('Přidat uživatele'))" },
          target: { role: "button", name: "Poslat pozvánku" },
          action: "point",
        },
      },
    ],
    tip: "Když pozvánka nedorazí, zkontroluj v seznamu, jestli je e-mail napsaný správně. Student bez ročníku je v seznamu zvýrazněný.",
  },
];

export const helpGuide = (slug: string) => HELP_GUIDES.find((g) => g.slug === slug);

/** Návody, které daný člověk uvidí. */
export function guidesFor(role: "student" | "ucitel" | "admin"): HelpGuide[] {
  return HELP_GUIDES.filter((g) => g.audience === "all" || (g.audience === "staff" && role !== "student") || (g.audience === "admin" && role === "admin"));
}
