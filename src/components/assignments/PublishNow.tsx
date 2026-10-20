"use client";

import { useState, useTransition } from "react";
import { publishAssignmentNow } from "@/lib/actions/assignments";

/** Vyučující: naplánovaný úkol zveřejní hned. */
export function PublishNow({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-outline"
        style={{ minHeight: 36, padding: "0 12px" }}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await publishAssignmentNow(id);
            setError(res.error ?? null);
          })
        }
      >
        {pending ? "Zveřejňuji…" : "Zveřejnit hned"}
      </button>
      {error && <span style={{ color: "var(--late-fg)", fontSize: 13, fontWeight: 600 }}>{error}</span>}
    </>
  );
}
