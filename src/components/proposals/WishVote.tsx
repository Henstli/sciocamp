"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleWishVote } from "@/lib/actions/proposals";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

/** Hlas u přání: šipka nahoru a počet (jako na Redditu). Změna se ukáže hned. */
export function WishVote({ id, count, on, disabled }: { id: string; count: number; on: boolean; disabled?: boolean }) {
  const [state, setState] = useOptimistic({ count, on });
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (disabled) return;
    const next = !state.on;
    setError(null);
    start(async () => {
      setState({ on: next, count: state.count + (next ? 1 : -1) });
      const res = await toggleWishVote(id, next);
      if (res.error) setError(res.error);
      else if (res.info) setError(res.info);
    });
  };

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
