"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, EmptyNote, profileHref } from "@/components/PageHeader";
import { enrollAction } from "@/lib/actions/enroll";
import { clusterBySchedule, formatCountdown, windowState, type EnrollWindow } from "@/lib/enroll";
import { formatDateRange } from "@/lib/periods";
import { formatSlots } from "@/lib/time";
import type { Period, Slot } from "@/lib/types";
import { plural } from "@/lib/format";
import { formatDue } from "@/lib/time";
import { AnnouncePanel, type AnnouncePanelData } from "./AnnouncePanel";
import styles from "./zapisy.module.css";

export type EnrollItem = {
  slug: string;
  kind: "kurz" | "atelier" | "expedice";
  title: string;
  description: string | null;
  when: string;
  location: string | null;
  startsOn: string | null;
  endsOn: string | null;
  slots: Slot[];
  period: Period | null;
  /** Název termínu od admina (ateliér, expedice) */
  term: string | null;
  teacher: { id: string; name: string; initials: string } | null;
  enrolled: boolean;
  taken: number;
  capacity: number | null;
  waiting: number;
  myPosition: number | null;
  window: EnrollWindow;
  /** Kurzy se seskupí podle období */
  group: { id: string; name: string } | null;
  clash: string | null;
  gradeNote: string | null;
  href: string | null;
};

const TABS = [
  ["kurzy", "kurz", "Kurzy"],
  ["ateliery", "atelier", "Ateliéry"],
  ["expedice", "expedice", "Expedice"],
] as const;
type TabKey = (typeof TABS)[number][0];

/** Aktuální čas v prohlížeči (po načtení), ať odpočet a tlačítka sedí na sekundu. */
function useNow(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

export function EnrollBoard({
  items,
  student,
  serverNow,
  initialTab,
  panels = null,
}: {
  items: EnrollItem[];
  student: boolean;
  serverNow: number;
  initialTab?: string;
  /** Učitelé: vyhlášení zápisu do ateliérů a na expedice */
  panels?: Record<"atelier" | "expedice", AnnouncePanelData> | null;
}) {
  const counts = Object.fromEntries(TABS.map(([key, kind]) => [key, items.filter((i) => i.kind === kind).length])) as Record<TabKey, number>;
  const firstWithItems = TABS.find(([key]) => counts[key] > 0)?.[0] ?? "kurzy";
  const [tab, setTab] = useState<TabKey>(TABS.some(([k]) => k === initialTab) ? (initialTab as TabKey) : firstWithItems);
  const [query, setQuery] = useState("");
  const now = useNow(serverNow);

  const kind = TABS.find(([k]) => k === tab)![1];
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("cs");
    return items
      .filter((i) => i.kind === kind)
      .filter(
        (i) =>
          !q ||
          [i.title, i.description, i.teacher?.name, i.location].some((t) => t?.toLocaleLowerCase("cs").includes(q)),
      );
  }, [items, kind, query]);

  // Skupiny podle termínu zápisu (u kurzů zároveň podle období).
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; title: string | null; window: EnrollWindow; items: EnrollItem[] }>();
    for (const i of visible) {
      const key = `${i.group?.id ?? ""}|${i.window.opens}|${i.window.closes}`;
      if (!map.has(key)) map.set(key, { key, title: i.group?.name ?? null, window: i.window, items: [] });
      map.get(key)!.items.push(i);
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        items: g.items.sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? "") || a.title.localeCompare(b.title, "cs")),
      }))
      .sort((a, b) => a.window.opens.localeCompare(b.window.opens));
  }, [visible]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className={styles.toolbar}>
        <div role="tablist" aria-label="Druh nabídky" className="tablist">
          {TABS.map(([key, , label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className="tab"
              onClick={() => {
                setTab(key);
                const url = new URL(window.location.href);
                url.searchParams.set("tab", key);
                window.history.replaceState(null, "", url);
              }}
            >
              {label}
              <span className={styles.tabCount}>{counts[key]}</span>
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Icon name="search" size={18} />
          <span className="sr-only">Hledat v nabídce</span>
          <input type="search" placeholder="Hledat v nabídce…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      {panels && kind !== "kurz" && <AnnouncePanel key={kind} data={panels[kind]} />}

      {groups.length === 0 && (
        <EmptyNote>
          {query
            ? "Nic takového v nabídce není."
            : tab === "kurzy"
              ? "Zápis do kurzů teď není vyhlášený. Až admin zveřejní nové období, uvidíš ho tady i s termínem zápisu."
              : tab === "ateliery"
                ? "Žádný ateliér teď nemá vyhlášený zápis."
                : "Žádná expedice teď nemá vyhlášený zápis."}
        </EmptyNote>
      )}

      {groups.map((g) => (
        <section key={g.key} className="stack" style={{ gap: 14 }} aria-label={g.title ?? "Zápis"}>
          <WindowBanner
            title={g.title}
            window={g.window}
            now={now}
            mineCount={student ? g.items.filter((i) => i.enrolled).length : null}
            kind={kind}
          />
          {clusters(g.items).map((c) => (
            <div key={c.key} className={styles.cluster}>
              <div className={styles.clusterHead}>
                <span className={styles.clusterTitle} data-kind={kind}>
                  <Icon name={kind === "kurz" ? "clock" : "calendar"} size={16} />
                  {c.title}
                </span>
                {c.items.length > 1 && (
                  <span className={styles.clusterNote}>
                    {c.items.length} {plural(c.items.length, "možnost", "možnosti", "možností")} ve stejném čase — vybereš si jednu
                  </span>
                )}
              </div>
              <div className={styles.grid}>
                {c.items.map((i) => (
                  <EnrollCard key={i.slug} item={i} student={student} now={now} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Souběžné nabídky pohromadě: kurzy podle dne a času, ateliéry a expedice podle
 * termínu. Skupiny jdou po sobě v čase.
 */
function clusters(items: EnrollItem[]) {
  return clusterBySchedule(items.map((i) => ({ ...i, startsOn: i.startsOn, endsOn: i.endsOn })))
    .map((list) => {
      const first = list[0];
      let title: string;
      let sortKey: string;
      if (first.kind === "kurz") {
        const slots = [...new Map(list.flatMap((i) => i.slots).map((s) => [`${s.day}${s.start}${s.end}`, s])).values()].sort(
          (a, b) => a.day - b.day || a.start.localeCompare(b.start),
        );
        title = formatSlots(slots) || "Bez rozvrhu";
        sortKey = slots[0] ? `${slots[0].day}${slots[0].start}` : "9";
      } else {
        const from = list.map((i) => i.startsOn ?? "").sort()[0] ?? "";
        const to = list.map((i) => i.endsOn ?? "").sort().at(-1) ?? "";
        const names = [...new Set(list.map((i) => i.term).filter(Boolean))];
        title = [names.length === 1 ? names[0] : null, formatDateRange(from || null, to || null)].filter(Boolean).join(" · ");
        sortKey = from;
      }
      return {
        key: list.map((i) => i.slug).join("|"),
        title,
        sortKey,
        items: list.sort((a, b) => a.title.localeCompare(b.title, "cs")),
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function WindowBanner({
  title,
  window: w,
  now,
  mineCount,
  kind,
}: {
  title: string | null;
  window: EnrollWindow;
  now: number;
  mineCount: number | null;
  kind: EnrollItem["kind"];
}) {
  const state = windowState(w, now);
  const noun = kind === "kurz" ? ["kurz", "kurzy", "kurzů"] : kind === "atelier" ? ["ateliér", "ateliéry", "ateliérů"] : ["expedici", "expedice", "expedic"];
  const mine =
    mineCount !== null && mineCount > 0 ? ` Máš zapsáno ${mineCount} ${plural(mineCount, noun[0], noun[1], noun[2])}.` : "";
  return (
    <div className={styles.banner} data-state={state} role="status">
      <Icon name="clock" size={20} />
      <div className={styles.bannerText}>
        {title && <strong>{title} · </strong>}
        {state === "soon" && (
          <>
            Zápis se otevře {formatDue(w.opens)} a skončí {formatDue(w.closes)}.
          </>
        )}
        {state === "open" && (
          <>
            Zápis běží, končí {formatDue(w.closes)}.{mine}
          </>
        )}
        {state === "closed" && (
          <>
            Zápis skončil {formatDue(w.closes)}.{mine} Změny teď dělá vyučující.
          </>
        )}
      </div>
      {state !== "closed" && (
        <div className={styles.countdown} aria-label={state === "soon" ? "Do otevření zápisu" : "Do konce zápisu"}>
          <span className={styles.countdownLabel}>{state === "soon" ? "otevře se za" : "končí za"}</span>
          <span className={styles.countdownValue}>{formatCountdown(Date.parse(state === "soon" ? w.opens : w.closes) - now)}</span>
        </div>
      )}
    </div>
  );
}

function EnrollCard({ item: i, student, now }: { item: EnrollItem; student: boolean; now: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const state = windowState(i.window, now);
  const full = i.capacity !== null && i.taken >= i.capacity;
  const pct = i.capacity ? Math.min(100, Math.round((i.taken / i.capacity) * 100)) : 0;
  const run = (action: Parameters<typeof enrollAction>[1]) =>
    start(async () => {
      setMsg(await enrollAction(i.slug, action));
    });

  let control: React.ReactNode = null;
  if (student) {
    if (i.enrolled) {
      control =
        state === "open" ? (
          <button type="button" className={`btn ${styles.leave}`} disabled={pending} onClick={() => run("leave")}>
            {pending ? "Odhlašuji…" : "Odhlásit se"}
          </button>
        ) : state === "closed" ? (
          <p className={styles.note}>Odhlásit tě teď může jen vyučující.</p>
        ) : null;
    } else if (i.myPosition !== null) {
      control = (
        <>
          <p className={styles.note}>
            Jsi <strong>{i.myPosition}.</strong> na čekací řadě. Když se uvolní místo, zapíšeme tě a dáme vědět.
          </p>
          <button type="button" className="btn btn-outline" disabled={pending} onClick={() => run("unwait")}>
            Odejít z čekací řady
          </button>
        </>
      );
    } else if (i.gradeNote) {
      control = <Disabled>{i.gradeNote}</Disabled>;
    } else if (state === "soon") {
      control = <Disabled>Zápis se otevře {formatDue(i.window.opens)}</Disabled>;
    } else if (state === "closed") {
      control = <Disabled>Zápis skončil</Disabled>;
    } else if (i.clash) {
      control = <Disabled>Kříží se s „{i.clash}“</Disabled>;
    } else if (full) {
      control = (
        <button type="button" className={`btn ${styles.wait}`} disabled={pending} onClick={() => run("wait")}>
          {pending ? "Přidávám…" : "Obsazeno · přidat se na čekačku"}
        </button>
      );
    } else {
      control = (
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run("enroll")}>
          {pending ? "Zapisuji…" : "Zapsat se"}
        </button>
      );
    }
  }

  return (
    <article className={`card ${styles.card}`} data-kind={i.kind} data-enrolled={i.enrolled || undefined}>
      <div className={styles.chips}>
        <span className={styles.when}>{i.when}</span>
        {i.enrolled && (
          <span className={styles.enrolled}>
            <Icon name="tick" size={14} strokeWidth={2.6} /> Zapsáno
          </span>
        )}
        {!i.enrolled && i.myPosition !== null && <span className="chip chip-wait">Čekačka · {i.myPosition}.</span>}
      </div>
      <div>
        <h3 className={styles.title}>{i.href ? <Link href={i.href}>{i.title}</Link> : i.title}</h3>
        {i.description && <p className={styles.desc}>{i.description}</p>}
        {i.location && (
          <p className={styles.meta}>
            <Icon name="pin" size={14} /> {i.location}
          </p>
        )}
      </div>
      {i.teacher && (
        <div className={styles.teacher}>
          <Avatar initials={i.teacher.initials} size={32} tone="ucitel" href={profileHref(i.teacher.id)} title={i.teacher.name} />
          <span>{i.teacher.name}</span>
        </div>
      )}
      <div className={styles.capacity}>
        <div className={styles.capacityRow}>
          <span>Obsazenost</span>
          <span>
            {i.capacity !== null ? `${i.taken} / ${i.capacity} míst` : `${i.taken} zapsáno`}
            {i.waiting > 0 && ` · ${i.waiting} čeká`}
          </span>
        </div>
        {i.capacity !== null && (
          <div className={styles.bar} aria-hidden>
            <span style={{ width: `${pct}%` }} data-full={full || undefined} />
          </div>
        )}
      </div>
      {control && <div className={styles.actions}>{control}</div>}
      {(msg.error || msg.info) && (
        <p role={msg.error ? "alert" : "status"} className={msg.error ? styles.error : styles.note}>
          {msg.error ?? msg.info}
        </p>
      )}
    </article>
  );
}

function Disabled({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" className={`btn ${styles.disabled}`} disabled>
      {children}
    </button>
  );
}
