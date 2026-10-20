"use client";

// Přehled návodů po tématech s hledáním (bez diakritiky).

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { plural } from "@/lib/format";
import styles from "./help.module.css";

const AUDIENCE_LABEL = { all: "Všichni", staff: "Učitelé", admin: "Admin" } as const;

/** Pro koho návod je: Všichni (zeleně), Učitelé (fialově), Admin (modře). */
export function AudienceChip({ audience }: { audience: keyof typeof AUDIENCE_LABEL }) {
  return (
    <span className={styles.aud} data-a={audience}>
      {AUDIENCE_LABEL[audience]}
    </span>
  );
}

type Item = { slug: string; title: string; intro: string; minutes: number; steps: number; audience: "all" | "staff" | "admin"; cover: string | null; keywords: string };
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function HelpIndex({ topics }: { topics: { key: string; title: string; guides: Item[] }[] }) {
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const shown = topics
    .map((t) => ({ ...t, guides: t.guides.filter((g) => !q || fold(`${g.title} ${g.intro} ${g.keywords}`).includes(q)) }))
    .filter((t) => t.guides.length > 0);

  return (
    <div className={styles.index}>
      <label className={styles.search}>
        <Icon name="search" size={18} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat v návodech, třeba „týmy“ nebo „Meet“"
          aria-label="Hledat v návodech"
        />
      </label>
      {shown.length === 0 && <p className={styles.empty}>Žádný návod neodpovídá. Zkus jiné slovo.</p>}
      {shown.map((t) => (
        <section key={t.key} aria-label={t.title} className={styles.topic}>
          <h2 className={styles.topicTitle}>{t.title}</h2>
          <div className={styles.cards}>
            {t.guides.map((g) => (
              <Link key={g.slug} href={`/napoveda/${g.slug}`} className={`card ${styles.guideCard}`}>
                <span className={styles.cover} data-a={g.audience} aria-hidden="true">
                  {g.cover && (
                    // eslint-disable-next-line @next/next/no-img-element -- statický náhled
                    <img src={g.cover} alt="" loading="lazy" />
                  )}
                </span>
                <span className={styles.guideText}>
                  <span className={styles.guideTitle}>
                    {g.title}
                    <AudienceChip audience={g.audience} />
                  </span>
                  <span className={styles.guideIntro}>{g.intro}</span>
                  <span className={styles.guideMeta}>
                    {g.steps} {plural(g.steps, "krok", "kroky", "kroků")} · asi {g.minutes} min
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
