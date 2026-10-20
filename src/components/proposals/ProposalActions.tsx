"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteProposal,
  reopenProposal,
  resolveProposal,
  setProposalNeed,
  withdrawProposal,
  type ActionResult,
} from "@/lib/actions/proposals";
import type { ProposalGoal, ProposalStatus } from "@/lib/proposals";
import f from "@/components/manage/manage.module.css";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

function Message({ res }: { res: ActionResult }) {
  if (!res.error && !res.info) return null;
  return (
    <p role="status" className={res.error ? f.formError : f.formInfo}>
      {res.error ?? res.info}
    </p>
  );
}

/** Panel vyučujícího / admina: potvrzení počtu, rozhodnutí, vrácení, smazání. */
export function StaffPanel({
  id,
  goal,
  status,
  need,
  needProposed,
  admin,
}: {
  id: string;
  goal: ProposalGoal;
  status: ProposalStatus;
  need: number | null;
  needProposed: number;
  admin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult>({});
  const [count, setCount] = useState(String(need ?? needProposed));
  const results =
    goal === "shromazdeni"
      ? ([
          ["projednano", "Projednáno"],
          ["zamitnuto", "Zamítnout"],
        ] as const)
      : ([
          ["schvaleno", "Schválit"],
          ["zamitnuto", "Zamítnout"],
        ] as const);
  const [result, setResult] = useState<(typeof results)[number][0]>(results[0][0]);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const act = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setRes(r.ok ? { info: "Uloženo." } : r);
      if (r.ok) after?.();
    });

  const open = status === "open";
  return (
    <section className={`card ${styles.staff}`} aria-label="Pro vyučující">
      {open && (
        <>
          <h3>Počet podporovatelů</h3>
          <div className={styles.inline}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className={`${f.input} ${styles.number}`}
              aria-label="Potřebný počet podporovatelů"
            />
            <button type="button" className="btn btn-outline" disabled={pending} onClick={() => act(() => setProposalNeed(id, Number(count)))}>
              {need === null ? "Potvrdit počet" : "Změnit počet"}
            </button>
          </div>
          <span className={f.hint} style={{ marginTop: -6 }}>
            {need === null ? `Autor navrhuje ${needProposed}. Po potvrzení se mu pošle oznámení.` : `Potvrzeno: ${need}. Autor navrhoval ${needProposed}.`}
          </span>

          <h3>{goal === "shromazdeni" ? "Po shromáždění" : "Rozhodnutí"}</h3>
          <div className={styles.segmented} role="radiogroup" aria-label="Výsledek">
            {results.map(([key, label]) => (
              <label key={key}>
                <input type="radio" name={`result-${id}`} checked={result === key} onChange={() => setResult(key)} />
                {label}
              </label>
            ))}
          </div>
          <textarea
            className={f.textarea}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={result === "projednano" ? "Na čem jste se na shromáždění domluvili?" : "Zdůvodnění pro autora a podporovatele"}
            aria-label={result === "projednano" ? "Závěr ze shromáždění" : "Zdůvodnění"}
          />
          <div className={styles.inline}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !note.trim()}
              onClick={() => act(() => resolveProposal(id, result, note), () => setNote(""))}
            >
              Uložit a oznámit
            </button>
            <span className={f.hint}>Oznámení dostane autor i všichni, kdo návrh podpořili.</span>
          </div>
        </>
      )}
      {!open && (
        <div className={styles.inline}>
          <button type="button" className="btn btn-outline" disabled={pending} onClick={() => act(() => reopenProposal(id))}>
            Vrátit mezi otevřené
          </button>
          <span className={f.hint}>Pro případ, že se rozhodnutí uložilo omylem.</span>
        </div>
      )}
      {admin &&
        (confirmDelete ? (
          <div className={styles.inline}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ color: "var(--late)", borderColor: "#e7b4b4" }}
              disabled={pending}
              onClick={() => act(() => deleteProposal(id), () => router.push("/navrhy"))}
            >
              Opravdu smazat
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setConfirmDelete(false)}>
              Zpět
            </button>
          </div>
        ) : (
          <button type="button" className={styles.linkBtn} style={{ alignSelf: "flex-start" }} onClick={() => setConfirmDelete(true)}>
            Smazat návrh (nevhodný obsah)
          </button>
        ))}
      <Message res={res} />
    </section>
  );
}

/** Autor může otevřený návrh stáhnout. */
export function WithdrawButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [res, setRes] = useState<ActionResult>({});
  if (!confirm) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setConfirm(true)}>
        Stáhnout návrh
      </button>
    );
  }
  return (
    <div className={styles.inline}>
      <span className={f.hint}>Návrh se uzavře a už nepůjde podpořit.</span>
      <button
        type="button"
        className="btn btn-outline"
        style={{ color: "var(--late)", borderColor: "#e7b4b4" }}
        disabled={pending}
        onClick={() => start(async () => setRes(await withdrawProposal(id)))}
      >
        Ano, stáhnout
      </button>
      <button type="button" className="btn btn-soft" onClick={() => setConfirm(false)}>
        Zpět
      </button>
      <Message res={res} />
    </div>
  );
}
