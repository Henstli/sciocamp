// Zmínky přes @ ve zprávách a chatech. V textu zprávy se ukládají jako
// „@[Jméno Příjmení](id)“; v aplikaci se zobrazí jako štítek s profilovkou.

export type MentionPerson = { id: string; name: string };

/** @[Jméno](id) — id je uuid (naostro) nebo „u-…“ (ukázkový režim) */
export const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([\w-]{1,40})\)/g;

export const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("cs");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Před odesláním: „@Jméno Příjmení“ (vybrané z nabídky nebo napsané celé)
 * převede na uložený tvar. Delší jména dřív, ať „@Jan Novák“ nevyhraje „@Jan“.
 */
export function encodeMentions(text: string, people: MentionPerson[]): string {
  let out = text;
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(`(^|[^\\p{L}\\]])@${escapeRe(p.name)}(?![\\p{L}])`, "gu");
    out = out.replace(re, (_m, pre: string) => `${pre}@[${p.name}](${p.id})`);
  }
  return out;
}

export type MentionPart = { kind: "text"; text: string } | { kind: "mention"; name: string; id: string };

/** Rozdělí text zprávy na obyčejný text a zmínky. */
export function parseMentions(body: string): MentionPart[] {
  const parts: MentionPart[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index! > last) parts.push({ kind: "text", text: body.slice(last, m.index) });
    parts.push({ kind: "mention", name: m[1], id: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push({ kind: "text", text: body.slice(last) });
  return parts;
}

/** Pro náhledy a notifikace: „@[Eva Nová](id)“ → „@Eva Nová“. */
export function mentionPlain(body: string): string {
  return body.replace(MENTION_RE, "@$1");
}

/** Rozepsaná zmínka před kurzorem: vrátí, kde začíná „@“ a co je za ním napsané. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(?:^|\s)@([\p{L}]{0,30}(?: [\p{L}]{0,30})?)$/u);
  if (!m) return null;
  return { start: caret - m[1].length - 1, query: m[1] };
}

/** Kdo odpovídá napsaným písmenům (začátek jména, příjmení i celého jména). */
export function matchPeople<T extends MentionPerson>(people: T[], query: string, limit = 6): T[] {
  const q = fold(query.trim());
  return people
    .filter((p) => {
      if (!q) return true;
      const name = fold(p.name);
      return name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "cs"))
    .slice(0, limit);
}
