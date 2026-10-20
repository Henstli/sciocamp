"use client";

import { useOptimistic, useState, useTransition } from "react";
import { voteProposal } from "@/lib/actions/proposals";
import { plural } from "@/lib/format";
import { CHOICE_LABEL, percentOf, type VoteChoice } from "@/lib/proposals";
import { Icon } from "@/components/Icon";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

type Counts = { pro: number; jedno: number; proti: number };
const ORDER: VoteChoice[] = ["pro", "jedno", "proti"];

/**
 * Hlasování o návrhu (pro / je mi to jedno / proti) a průběžný výsledek:
 * podíly z celé školy, ryska na prahu, kolik lidí hlasovalo. Můj hlas = zvýrazněný díl lišty.
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
              {state.mine === c && <Icon name="tick" size={14} strokeWidth={3} />}
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
        <div className={styles.summary}>
          <span>
            Pro {pct(state.counts.pro)} % · jedno {pct(state.counts.jedno)} % · proti {pct(state.counts.proti)} %
          </span>
          <span>
            Práh {needPercent} %{needConfirmed ? "" : " (navržený)"} · {plural(voted, "hlasoval", "hlasovali", "hlasovalo")} {voted} z {members}
          </span>
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
