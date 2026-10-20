"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { addProposalComment, deleteProposalComment } from "@/lib/actions/proposals";
import f from "@/components/manage/manage.module.css";
import styles from "@/app/(app)/navrhy/navrhy.module.css";

export type CommentView = { id: string; authorId: string; name: string; initials: string; when: string; body: string; canDelete: boolean };

/** Diskuse pod návrhem. */
export function ProposalComments({ id, comments, me }: { id: string; comments: CommentView[]; me: { initials: string } }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const res = await addProposalComment(id, text);
      if (res.error) setError(res.error);
      else {
        setError(res.info ?? null);
        if (res.ok) setText("");
      }
    });

  return (
    <section id="komentare" className={`card ${styles.panel}`} aria-label="Komentáře">
      <h2>Komentáře</h2>
      {comments.length === 0 && <p className={styles.empty}>Zatím nikdo nekomentoval. Napiš, co si o návrhu myslíš.</p>}
      {comments.map((c) => (
        <div key={c.id} className={styles.comment}>
          <Avatar initials={c.initials} size={34} href={`/lide/${c.authorId}`} title={c.name} />
          <div className={styles.commentBody}>
            <div className={styles.commentHead}>
              <strong>{c.name}</strong>
              <span>{c.when}</span>
              {c.canDelete && (
                <button
                  type="button"
                  className={styles.linkBtn}
                  style={{ marginLeft: "auto" }}
                  onClick={() => start(async () => void (await deleteProposalComment(c.id)))}
                >
                  Smazat
                </button>
              )}
            </div>
            {c.body}
          </div>
        </div>
      ))}
      <div className={styles.comment}>
        <Avatar initials={me.initials} size={34} tone="me" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            className={f.textarea}
            rows={2}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Napiš komentář…"
            aria-label="Nový komentář"
          />
          {error && (
            <p role="status" className={f.formError}>
              {error}
            </p>
          )}
          <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={pending || !text.trim()} onClick={send}>
            Odeslat
          </button>
        </div>
      </div>
    </section>
  );
}
