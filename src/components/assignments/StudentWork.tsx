"use client";

import { useRef, useState, useTransition } from "react";
import { Icon } from "../Icon";
import { STATE_CHIP, STATE_LABEL } from "@/lib/assignments";
import { addSubmissionLink, filesChanged, removeSubmissionLink, setSubmitted } from "@/lib/actions/assignments";
import { createClient } from "@/lib/supabase/client";
import type { Review, Submission, WorkState } from "@/lib/types";
import { ReviewSummary, WorkFiles } from "./WorkFiles";
import styles from "./assignment.module.css";

const BUCKET = "odevzdani";
const MAX_BYTES = 25 * 1024 * 1024;

/** Název souboru bezpečný pro úložiště (bez diakritiky a zvláštních znaků). */
function safeName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (cleaned || "soubor").slice(-100);
}

/** Panel „Tvoje práce“: soubory, odkazy, poznámka, odevzdání a výsledek hodnocení. */
export function StudentWork({
  assignmentId,
  userId,
  live,
  state,
  submission,
  review,
  maxPoints,
}: {
  assignmentId: string;
  userId: string;
  /** false = ukázkový režim, nic se neukládá */
  live: boolean;
  state: WorkState;
  submission: Submission | null;
  review: Review | null;
  maxPoints: number | null;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ error?: string; info?: string }>({});
  const [link, setLink] = useState("");
  const [note, setNote] = useState(submission?.note ?? "");
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const final = state === "splneno" || state === "nesplneno";
  const editable = state === "ceka" || state === "pozde" || state === "vraceno";
  const files = submission?.files ?? [];
  const links = submission?.links ?? [];
  const hasContent = files.length > 0 || links.length > 0 || note.trim().length > 0;

  const run = (fn: () => Promise<{ error?: string; info?: string }>) =>
    start(async () => {
      setMessage({});
      const res = await fn();
      setMessage(res ?? {});
    });

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    if (!live) {
      setMessage({ info: "Ukázkový režim: soubory se nenahrávají." });
      return;
    }
    const sb = createClient();
    setMessage({});
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) {
        setMessage({ error: `Soubor „${file.name}“ je větší než 25 MB. Nahraj ho na Google Disk a přidej odkaz.` });
        continue;
      }
      setUploading(file.name);
      const path = `${assignmentId}/${userId}/${Date.now()}-${safeName(file.name)}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) {
        setMessage({ error: `Soubor „${file.name}“ se nepodařilo nahrát. Zkus to znovu.` });
        break;
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
    start(() => filesChanged());
  }

  async function removeFile(path: string) {
    if (!live) return setMessage({ info: "Ukázkový režim: změny se neukládají." });
    const { error } = await createClient().storage.from(BUCKET).remove([path]);
    if (error) return setMessage({ error: "Soubor se nepodařilo odebrat." });
    start(() => filesChanged());
  }

  const submitLabel = state === "vraceno" ? "Odevzdat znovu" : state === "pozde" ? "Odevzdat pozdě" : "Odevzdat";

  return (
    <section aria-label="Tvoje práce" className={`card ${styles.panel}`}>
      <div className={styles.panelHead}>
        <h2 className={styles.h2}>Tvoje práce</h2>
        <span className={`chip ${STATE_CHIP[state]}`}>{STATE_LABEL[state]}</span>
      </div>

      {review && <ReviewSummary review={review} maxPoints={maxPoints} forStudent />}

      <WorkFiles
        files={files}
        links={links}
        onRemoveFile={editable ? (p) => void removeFile(p) : undefined}
        onRemoveLink={editable ? (i) => run(() => removeSubmissionLink(assignmentId, i)) : undefined}
        emptyText={editable ? null : "Nic nepřiloženo."}
      />

      {editable && (
        <>
          <div className={styles.addRow}>
            <input
              ref={fileInput}
              type="file"
              multiple
              id={`soubor-${assignmentId}`}
              className="sr-only"
              onChange={(e) => void upload(e.target.files)}
            />
            <label htmlFor={`soubor-${assignmentId}`} className={`btn btn-outline ${styles.grow}`} aria-disabled={!!uploading}>
              <Icon name="upload" size={18} />
              {uploading ? `Nahrávám ${uploading}…` : "Nahrát soubor"}
            </label>
          </div>
          <form
            className={styles.addRow}
            onSubmit={(e) => {
              e.preventDefault();
              const value = link;
              run(async () => {
                const res = await addSubmissionLink(assignmentId, value);
                if (!res.error) setLink("");
                return res;
              });
            }}
          >
            <label htmlFor={`odkaz-${assignmentId}`} className="sr-only">
              Odkaz na Google dokument nebo jiný web
            </label>
            <input
              id={`odkaz-${assignmentId}`}
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Odkaz na Google dokument…"
              className={styles.input}
            />
            <button type="submit" className="btn btn-outline" disabled={pending || !link.trim()} aria-label="Přidat odkaz">
              <Icon name="link" size={18} />
              Přidat
            </button>
          </form>
          <label className={styles.noteLabel}>
            Poznámka pro vyučujícího (nepovinné)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={styles.textarea} maxLength={2000} />
          </label>
        </>
      )}
      {!editable && submission?.note && (
        <div className={styles.note}>
          <div className={styles.metaLabel}>Poznámka</div>
          {submission.note}
        </div>
      )}

      {editable && (
        <button
          type="button"
          className={`btn btn-primary ${styles.submit}`}
          disabled={pending || !!uploading}
          onClick={() => {
            if (!hasContent) return setMessage({ error: "Přilož soubor, odkaz nebo napiš poznámku." });
            run(() => setSubmitted(assignmentId, true, note));
          }}
        >
          {pending ? "Ukládám…" : submitLabel}
        </button>
      )}
      {state === "odevzdano" && (
        <button type="button" className={`btn btn-outline ${styles.submit}`} disabled={pending} onClick={() => run(() => setSubmitted(assignmentId, false))}>
          Zrušit odevzdání
        </button>
      )}
      <p className={styles.small}>
        {final
          ? "Práce je ohodnocená, už ji měnit nejde. Kdyby něco nesedělo, napiš vyučujícímu do komentářů."
          : state === "odevzdano"
            ? "Odevzdáno. Dokud práci nikdo neohodnotí, můžeš odevzdání zrušit a upravit ji."
            : state === "vraceno"
              ? "Doplň, co vyučující chce, a odevzdej znovu."
              : "Soubory do 25 MB. Větší věci nahraj na Google Disk a přidej odkaz."}
      </p>

      {(message.error || message.info) && (
        <p role={message.error ? "alert" : "status"} className={message.error ? styles.error : styles.info}>
          {message.error ?? message.info}
        </p>
      )}
    </section>
  );
}
