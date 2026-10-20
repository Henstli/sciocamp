"use client";

import { useOptimistic, useState, useTransition } from "react";
import { voteProposal } from "@/lib/actions/proposals";
import { plural } from "@/lib/format";
import { CHOICE_LABEL, percentOf, type VoteChoice } from "@/lib/proposals";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

type Counts = { pro: number; jedno: number; proti: number };
const ORDER: VoteChoice[] = ["pro", "jedno", "proti"];

/**
 * Hlasování o návrhu (pro / je mi to jedno / proti) a průběžný výsledek:
 * podíly z celé školy, ryska na prahu, kolik lidí hlasovalo.
 */
export function ProposalVote({
  id,
  counts,
  myChoice,
  members,
  needPercent,
  needConfirmed,
  open,
  isAuthor,
}: {
  id: string;
  counts: Counts;
  myChoice: VoteChoice | null;
  /** Kolik lidí ve škole může hlasovat */
  members: number;
  needPercent: number;
  /** Práh potvrdil vyučující (jinak je jen navržený autorem) */
  needConfirmed: boolean;
  open: boolean;
  isAuthor: boolean;
}) {
  const [state, setState] = useOptimistic({ counts, mine: myChoice });
  const [, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const pick = (choice: VoteChoice) => {
    if (!open) return;
    if (isAuthor) {
      setMessage("Svůj návrh podporuješ automaticky.");
      return;
    }
    const next = state.mine === choice ? null : choice;
    setMessage(null);
    start(async () => {
      const c = { ...state.counts };
      if (state.mine) c[state.mine]--;
      if (next) c[next]++;
      setState({ counts: c, mine: next });
      const res = await voteProposal(id, next);
      if (res.error || res.info) setMessage(res.error ?? res.info ?? null);
    });
  };

  const voted = state.counts.pro + state.counts.jedno + state.counts.proti;
  const pct = (n: number) => percentOf(n, members);
  const reached = needConfirmed && state.counts.pro * 100 >= needPercent * members;

  return (
    <div className={styles.poll}>
      {open && (
        <div className={styles.choices} role="group" aria-label="Tvůj hlas">
          {ORDER.map((c) => (
            <button
              key={c}
              type="button"
              className={styles.choice}
              data-choice={c}
              aria-pressed={state.mine === c}
              onClick={() => pick(c)}
              title={state.mine === c && !isAuthor ? "Klikni znovu pro zrušení hlasu" : undefined}
            >
              {CHOICE_LABEL[c]}
            </button>
          ))}
        </div>
      )}
      <div className={styles.results} aria-label="Průběžný výsledek">
        <div className={styles.stack}>
          {ORDER.map((c) => (
            <span key={c} data-choice={c} style={{ width: `${(state.counts[c] / Math.max(members, 1)) * 100}%` }} />
          ))}
          <i className={styles.mark} data-reached={reached} style={{ left: `${needPercent}%` }} title={`Práh ${needPercent} % pro`} />
        </div>
        <div className={styles.legend}>
          <span data-choice="pro">Pro {pct(state.counts.pro)} %</span>
          <span data-choice="jedno">Je mi to jedno {pct(state.counts.jedno)} %</span>
          <span data-choice="proti">Proti {pct(state.counts.proti)} %</span>
          <span data-choice="none">Nehlasovali {Math.max(0, 100 - pct(state.counts.pro) - pct(state.counts.jedno) - pct(state.counts.proti))} %</span>
        </div>
        <div className={styles.meta}>
          <span>
            Hlasovalo {voted} z {members} {plural(members, "člověka", "lidí", "lidí")}
          </span>
          <span>
            Práh: {needPercent} % školy pro{needConfirmed ? "" : " (navrženo autorem, čeká na potvrzení)"}
          </span>
          {state.mine && open && <span>Tvůj hlas: {CHOICE_LABEL[state.mine].toLowerCase()}</span>}
        </div>
      </div>
      {message && (
        <span role="status" className={styles.voteError} style={{ width: "auto", textAlign: "left" }}>
          {message}
        </span>
      )}
    </div>
  );
}
