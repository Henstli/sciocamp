"use client";

import { useState, useTransition } from "react";
import { Icon } from "../Icon";
import { Avatar } from "../PageHeader";
import { addComment } from "@/lib/actions/assignments";
import styles from "./assignment.module.css";

export type CommentView = { id: string; author: string; initials: string; mine: boolean; staff: boolean; body: string; time: string };

/** Soukromé vlákno mezi studentem a vyučujícím u jednoho úkolu. */
export function PrivateComments({
  assignmentId,
  studentId,
  comments,
  hint,
  placeholder,
}: {
  assignmentId: string;
  studentId: string;
  comments: CommentView[];
  hint: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <section aria-label="Soukromé komentáře" className={`card ${styles.panel}`}>
      <div>
        <h2 className={styles.h2}>Soukromé komentáře</h2>
        <p className={styles.small}>{hint}</p>
      </div>
      {comments.length > 0 && (
        <ol className={styles.comments}>
          {comments.map((c) => (
            <li key={c.id} className={styles.comment}>
              <Avatar initials={c.initials} size={32} tone={c.mine ? "me" : c.staff ? "late" : "student"} />
              <div>
                <div className={styles.commentHead}>
                  <span className={styles.commentName}>{c.author}</span>
                  <span className={styles.small}>{c.time}</span>
                </div>
                <p className={styles.commentBody}>{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form
        className={styles.addRow}
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft;
          start(async () => {
            setError(undefined);
            setInfo(undefined);
            const res = await addComment(assignmentId, studentId, text);
            if (res.error) setError(res.error);
            else {
              setDraft("");
              setInfo(res.info);
            }
          });
        }}
      >
        <label htmlFor={`komentar-${studentId}`} className="sr-only">
          {placeholder}
        </label>
        <input
          id={`komentar-${studentId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          maxLength={4000}
          className={styles.input}
        />
        <button type="submit" className="btn btn-primary" disabled={pending || !draft.trim()} aria-label="Odeslat komentář">
          <Icon name="send" size={18} />
        </button>
      </form>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {info && (
        <p role="status" className={styles.small}>
          {info}
        </p>
      )}
    </section>
  );
}
