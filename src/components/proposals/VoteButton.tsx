"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { toggleSupport, toggleWishVote } from "@/lib/actions/proposals";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

/**
 * Tlačítko podpory návrhu / „Chci to“ u přání: šipka a počet. Změna se ukáže
 * hned, při chybě se vrátí zpět.
 */
export function VoteButton({
  id,
  kind,
  count,
  on,
  disabled,
  locked,
  label,
}: {
  id: string;
  kind: "proposal" | "wish";
  count: number;
  on: boolean;
  /** Uzavřené — jen ukazuje počet */
  disabled?: boolean;
  /** Autor návrhu podporu odebrat nemůže */
  locked?: boolean;
  /** Popisek pod číslem („podpora“, „chci to“) */
  label: string;
}) {
  const [state, setState] = useOptimistic({ count, on });
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (disabled || locked) return;
    const next = !state.on;
    setError(null);
    start(async () => {
      setState({ on: next, count: state.count + (next ? 1 : -1) });
      const res = await (kind === "proposal"
        ? toggleSupport(id, next)
        : toggleWishVote(id, next));
      if (res.error) setError(res.error);
      else if (res.info) setError(res.info);
    });
  };

  const what = kind === "proposal" ? "Podpořit návrh" : "Chci to";

  // Přání: šipka nahoru a počet pod ní (jako na Redditu).
  if (kind === "wish") {
    return (
      <div className={styles.voteWrap}>
        <div className={styles.arrowVote} data-on={state.on}>
          <button
            type="button"
            className={styles.arrowBtn}
            aria-pressed={state.on}
            disabled={disabled}
            onClick={toggle}
            aria-label={`Chci to (${state.count})`}
            title={error ?? (disabled ? "Uzavřeno" : state.on ? "Zrušit hlas" : "Chci to")}
          >
            <svg viewBox="0 0 24 24" width={26} height={26} aria-hidden="true">
              <path
                d="M12 3.5 4 12.5h4.75V20h6.5v-7.5H20z"
                fill={state.on ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className={styles.arrowCount}>{state.count}</span>
        </div>
        {error && (
          <span role="status" className={styles.voteError}>
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={styles.voteWrap}>
      <button
        type="button"
        className={styles.vote}
        aria-pressed={state.on}
        disabled={disabled}
        onClick={toggle}
        aria-label={`${what} (${state.count})`}
        title={
          error ??
          (locked
            ? "Svůj návrh podporuješ automaticky"
            : disabled
              ? "Uzavřeno"
              : state.on
                ? "Klikni znovu pro zrušení"
                : what)
        }
      >
        <Icon name={state.on ? "tick" : "plus"} size={16} strokeWidth={2.6} />
        {state.count}
        <span className={styles.voteLabel}>{label}</span>
      </button>
      {error && (
        <span role="status" className={styles.voteError}>
          {error}
        </span>
      )}
    </div>
  );
}
