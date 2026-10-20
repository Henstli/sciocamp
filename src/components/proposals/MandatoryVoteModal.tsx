"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { voteProposal } from "@/lib/actions/proposals";
import { CHOICE_LABEL, type VoteChoice } from "@/lib/proposals";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

type Item = { id: string; title: string; body: string; author: string; until: string };
const ORDER: VoteChoice[] = ["pro", "jedno", "proti"];

/**
 * Okno, které nejde zavřít, dokud člověk o návrhu nehlasuje. Na stránce
 * samotného návrhu se neukazuje (tam se dá hlasovat a číst komentáře).
 */
export function MandatoryVoteModal({ items }: { items: Item[] }) {
  const pathname = usePathname();
  // Ukázkový režim hlas neuloží — okno pak pro daný návrh schováme jen v prohlížeči.
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDivElement>(null);
  const current = items.find((i) => !skipped.includes(i.id) && pathname !== `/navrhy/${i.id}`);

  useEffect(() => {
    if (current) dialog.current?.focus();
  }, [current]);

  if (!current) return null;
  const rest = items.filter((i) => !skipped.includes(i.id)).length - 1;

  const vote = (choice: VoteChoice) =>
    start(async () => {
      setError(null);
      const res = await voteProposal(current.id, choice);
      if (res.error) setError(res.error);
      else if (res.info) setSkipped((s) => [...s, current.id]);
    });

  return (
    <div className={styles.overlay}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="povinne-titulek" tabIndex={-1} className={`card ${styles.dialog}`}>
        <div className={styles.chips}>
          <span className="chip chip-primary">Povinné hlasování</span>
          <span className="chip chip-wait">do {current.until}</span>
          {rest > 0 && <span className="chip chip-info">a ještě {rest} další</span>}
        </div>
        <h2 id="povinne-titulek" className={styles.title} style={{ fontSize: 20 }}>
          {current.title}
        </h2>
        <div className={styles.meta}>Navrhl(a) {current.author}</div>
        {current.body && <p className={`${styles.desc} ${styles.dialogBody}`}>{current.body}</p>}
        <p className={styles.dialogNote}>Vedení školy chce znát názor všech. Hlasuj, jak chceš — i „Je mi to jedno“ se počítá. Kdo jak hlasoval, nikdo neuvidí.</p>
        <div className={styles.choices} role="group" aria-label="Tvůj hlas">
          {ORDER.map((c) => (
            <button key={c} type="button" className={styles.choice} data-choice={c} disabled={pending} onClick={() => vote(c)}>
              {CHOICE_LABEL[c]}
            </button>
          ))}
        </div>
        {error && (
          <p role="status" className={styles.voteError} style={{ width: "auto", textAlign: "left", margin: 0 }}>
            {error}
          </p>
        )}
        <Link href={`/navrhy/${current.id}`} className={styles.back} style={{ alignSelf: "flex-start" }}>
          Přečíst celý návrh a komentáře
        </Link>
      </div>
    </div>
  );
}
