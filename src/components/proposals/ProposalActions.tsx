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
  needPercent,
  needPercentProposed,
  members,
  admin,
}: {
  id: string;
  goal: ProposalGoal;
  status: ProposalStatus;
  needPercent: number | null;
  needPercentProposed: number;
  members: number;
  admin: boolean;
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult>({});
  const [count, setCount] = useState(String(needPercent ?? needPercentProposed));
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
          <h3>Práh (kolik % školy má být pro)</h3>
          <div className={styles.inline}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className={`${f.input} ${styles.number}`}
              aria-label="Práh v procentech"
            />
            <span aria-hidden="true" style={{ fontWeight: 700 }}>
              %
            </span>
            <button type="button" className="btn btn-outline" disabled={pending} onClick={() => act(() => setProposalNeed(id, Number(count)))}>
              {needPercent === null ? "Potvrdit práh" : "Změnit práh"}
            </button>
          </div>
          <span className={f.hint} style={{ marginTop: -6 }}>
            {needPercent === null
              ? `Autor navrhuje ${needPercentProposed} %. Po potvrzení dostane oznámení.`
              : `Potvrzeno ${needPercent} %, autor navrhoval ${needPercentProposed} %.`}{" "}
            {Number(count) >= 1 && Number(count) <= 100 && `Při ${members} lidech ve škole to je aspoň ${Math.ceil((Number(count) * members) / 100)} hlasů pro.`}
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
            <span className={f.hint}>Oznámení dostane autor i všichni, kdo hlasovali pro.</span>
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
      {admin && <DeleteProposal id={id} closed={!open} afterDelete="/navrhy" />}
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

/**
 * Admin: smazání návrhu. Uzavřený z historie jen po zaškrtnutí, že byl
 * uskutečněn nebo řádně zapsán; otevřený jen kvůli nevhodnému obsahu.
 */
export function DeleteProposal({ id, closed, afterDelete }: { id: string; closed: boolean; afterDelete?: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult>({});

  if (!asking) {
    return (
      <button type="button" className={styles.linkBtn} style={{ alignSelf: "flex-start" }} onClick={() => setAsking(true)}>
        {closed ? "Smazat z historie" : "Smazat návrh (nevhodný obsah)"}
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {closed && (
        <label className={f.check} style={{ minHeight: 0 }}>
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
          <span>Návrh byl uskutečněn nebo řádně zapsán</span>
        </label>
      )}
      <div className={styles.inline}>
        <button
          type="button"
          className="btn btn-outline"
          style={{ minHeight: 36, color: "var(--late)", borderColor: "#e7b4b4" }}
          disabled={pending || (closed && !done)}
          onClick={() =>
            start(async () => {
              const r = await deleteProposal(id, done);
              setRes(r);
              if (r.ok && afterDelete) router.push(afterDelete);
            })
          }
        >
          {closed ? "Smazat z historie" : "Opravdu smazat"}
        </button>
        <button type="button" className="btn btn-soft" style={{ minHeight: 36 }} onClick={() => setAsking(false)}>
          Zpět
        </button>
      </div>
      <Message res={res} />
    </div>
  );
}
