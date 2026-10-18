"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Icon } from "../Icon";
import { Avatar, EmptyNote } from "../PageHeader";
import { addPostComment, createPost, deletePost, deletePostComment } from "@/lib/actions/communication";
import { linkTitle } from "@/lib/assignments";
import type { LinkItem, SubmissionFile } from "@/lib/types";
import { removeFile, uploadFilesDetailed, type UploadedFile } from "@/lib/upload";
import { toneFor, type Person } from "./people";
import styles from "./classroom.module.css";

const BUCKET = "prispevky";

export type StreamComment = { id: string; author: Person; body: string; when: string; canDelete: boolean };
export type StreamPost = {
  type: "post";
  id: string;
  author: Person;
  when: string;
  body: string;
  links: LinkItem[];
  files: SubmissionFile[];
  comments: StreamComment[];
  canDelete: boolean;
};
export type StreamEvent = { type: "task" | "material"; id: string; title: string; meta: string; href: string };
export type StreamEntry = StreamPost | StreamEvent;

export function Stream({
  items,
  me,
  canPost,
  activitySlug,
  activityDbId,
  live,
}: {
  items: StreamEntry[];
  me: Person;
  canPost: boolean;
  activitySlug: string;
  activityDbId?: string;
  live: boolean;
}) {
  return (
    <>
      {canPost ? (
        <PostComposer me={me} activitySlug={activitySlug} activityDbId={activityDbId} live={live} />
      ) : null}

      {items.length === 0 && (
        <EmptyNote>
          {canPost
            ? "Nástěnka je zatím prázdná. Napiš třídě první oznámení, objeví se tu i nové úkoly a materiály."
            : "Nástěnka je zatím prázdná. Objeví se tu oznámení vyučujícího a nové úkoly."}
        </EmptyNote>
      )}
      {items.map((item) =>
        item.type === "post" ? (
          <PostCard key={item.id} post={item} me={me} live={live} />
        ) : (
          <Link key={item.id} href={item.href} className={`card ${styles.event}`}>
            <div className={styles.eventIcon} data-kind={item.type}>
              <Icon name={item.type === "task" ? "file" : "play"} size={22} />
            </div>
            <div className={styles.grow}>
              <div className={styles.strong}>{item.title}</div>
              <div className={styles.meta}>{item.meta}</div>
            </div>
            <Icon name="chevronRight" size={18} style={{ color: "var(--text-muted)" }} />
          </Link>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Psaní příspěvku (vyučující a admin)
// ---------------------------------------------------------------------------

function PostComposer({ me, activitySlug, activityDbId, live }: { me: Person; activitySlug: string; activityDbId?: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [links, setLinks] = useState("");
  const [showLinks, setShowLinks] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; info?: string }>({});
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  async function pick(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = "";
    if (picked.length === 0) return;
    setMessage({});
    if (!live || !activityDbId) return setMessage({ info: "Ukázkový režim: soubory se nenahrávají." });
    const { problem, uploaded } = await uploadFilesDetailed(BUCKET, activityDbId, picked, setUploading);
    setFiles((f) => [...f, ...uploaded]);
    if (problem) setMessage({ error: problem });
  }

  async function drop(path: string) {
    setFiles((f) => f.filter((x) => x.path !== path));
    await removeFile(BUCKET, path);
  }

  function publish() {
    const data = new FormData();
    data.set("body", body);
    data.set("links", links);
    data.set("files", JSON.stringify(files));
    start(async () => {
      const res = await createPost(activitySlug, data);
      if (res.error) return setMessage({ error: res.error });
      setMessage({ info: res.info });
      if (live) {
        setBody("");
        setLinks("");
        setFiles([]);
        setShowLinks(false);
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <div className={`card ${styles.composer}`}>
        <Avatar initials={me.initials} size={40} tone="me" />
        <button type="button" className={styles.composerOpen} onClick={() => setOpen(true)}>
          Napiš oznámení třídě…
        </button>
      </div>
    );
  }

  return (
    <form
      className={`card ${styles.composerOpenCard}`}
      onSubmit={(e) => {
        e.preventDefault();
        publish();
      }}
    >
      <div className={styles.composerTop}>
        <Avatar initials={me.initials} size={40} tone="me" />
        <label className={styles.grow}>
          <span className="sr-only">Text oznámení</span>
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Napiš oznámení třídě…"
            className={styles.composerTextarea}
          />
        </label>
      </div>

      {files.length > 0 && (
        <ul className={styles.pendingFiles}>
          {files.map((f) => (
            <li key={f.path} className={styles.pendingFile}>
              <Icon name="file" size={16} />
              <span className={styles.grow}>{f.name}</span>
              <button type="button" className={styles.iconBtn} aria-label={`Odebrat ${f.name}`} onClick={() => void drop(f.path)}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showLinks && (
        <label className={styles.linksField}>
          <span className={styles.metaStrong}>Odkazy — jeden na řádek, volitelně „Název | https://…“</span>
          <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={2} className={styles.composerTextarea} placeholder="https://docs.google.com/…" />
        </label>
      )}

      <div className={styles.composerBar}>
        <input ref={fileInput} type="file" multiple id={`prispevek-${activitySlug}`} className="sr-only" onChange={(e) => void pick(e.target.files)} />
        <label htmlFor={`prispevek-${activitySlug}`} className="btn btn-outline" aria-disabled={!!uploading}>
          <Icon name="paperclip" size={18} />
          {uploading ? `Nahrávám ${uploading}…` : "Soubor"}
        </label>
        <button type="button" className="btn btn-outline" onClick={() => setShowLinks((v) => !v)} aria-expanded={showLinks}>
          <Icon name="link" size={18} />
          Odkaz
        </button>
        <span className={styles.grow} />
        <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
          Zrušit
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending || !!uploading || !body.trim()}>
          {pending ? "Zveřejňuji…" : "Zveřejnit"}
        </button>
      </div>
      {(message.error || message.info) && (
        <p role={message.error ? "alert" : "status"} className={message.error ? styles.formError : styles.formInfo}>
          {message.error ?? message.info}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Příspěvek s komentáři
// ---------------------------------------------------------------------------

function fileCode(name: string) {
  const ext = name.split(".").pop()?.toUpperCase() ?? "";
  return ext.length >= 2 && ext.length <= 4 && ext !== name.toUpperCase() ? ext : "SOUB";
}

function fileSize(bytes: number | null) {
  if (!bytes) return "Soubor";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function PostCard({ post, me, live }: { post: StreamPost; me: Person; live: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = post.comments.length;

  const run = (fn: () => Promise<{ error?: string; info?: string }>, after?: () => void) =>
    start(async () => {
      setMessage(null);
      const res = await fn();
      if (res.error || res.info) setMessage(res.error ?? res.info ?? null);
      else after?.();
    });

  return (
    <article className={`card ${styles.post}`}>
      <div className={styles.postHead}>
        <Avatar initials={post.author.initials} size={40} tone={toneFor(post.author, me.id)} />
        <div className={styles.grow}>
          <div className={styles.strong}>{post.author.name}</div>
          <div className={styles.meta}>{post.when} · oznámení</div>
        </div>
        {post.canDelete &&
          (confirming ? (
            <span className={styles.confirm}>
              <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)}>
                Ne
              </button>
              <button type="button" className={`btn ${styles.dangerBtn}`} disabled={pending} onClick={() => run(() => deletePost(post.id))}>
                Smazat
              </button>
            </span>
          ) : (
            <button type="button" className={styles.iconBtn} aria-label="Smazat příspěvek" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={18} />
            </button>
          ))}
      </div>
      <p className={styles.postText}>{post.body}</p>

      {(post.files.length > 0 || post.links.length > 0) && (
        <div className={styles.attachments}>
          {post.files.map((f) => (
            <a key={f.path} href={f.url} target="_blank" rel="noopener noreferrer" className={styles.attachment} aria-disabled={!f.url}>
              <div className={styles.fileBadge} data-kind={fileCode(f.name) === "PDF" ? "pdf" : "doc"}>
                {fileCode(f.name)}
              </div>
              <div className={styles.attachmentText}>
                <div className={styles.strong}>{f.name}</div>
                <div className={styles.meta}>{fileSize(f.size)}</div>
              </div>
            </a>
          ))}
          {post.links.map((l, i) => (
            <a key={`${l.url}-${i}`} href={l.url} target="_blank" rel="noopener noreferrer" className={styles.attachment}>
              <div className={styles.fileBadge} data-kind="link">
                <Icon name="link" size={18} />
              </div>
              <div className={styles.attachmentText}>
                <div className={styles.strong}>{l.title}</div>
                <div className={styles.meta}>{linkTitle(l.url)}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      <button type="button" className={styles.comments} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="comment" size={16} />
        {n === 0 ? "Přidat komentář" : `${n} ${n === 1 ? "komentář" : n < 5 ? "komentáře" : "komentářů"} třídy`}
      </button>

      {open && (
        <div className={styles.commentList}>
          {post.comments.map((c) => (
            <div key={c.id} className={styles.comment}>
              <Avatar initials={c.author.initials} size={32} tone={toneFor(c.author, me.id)} />
              <div className={styles.grow}>
                <div className={styles.msgHead}>
                  <span className={styles.strong}>{c.author.name}</span>
                  <span className={styles.meta}>{c.when}</span>
                </div>
                <div className={styles.msgText}>{c.body}</div>
              </div>
              {c.canDelete && (
                <button type="button" className={styles.iconBtn} aria-label="Smazat komentář" onClick={() => run(() => deletePostComment(c.id))}>
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          ))}
          <form
            className={styles.commentForm}
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft;
              run(
                () => addPostComment(post.id, text),
                () => setDraft(""),
              );
            }}
          >
            <Avatar initials={me.initials} size={32} tone="me" />
            <label className={styles.grow}>
              <span className="sr-only">Komentář pro třídu</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
                placeholder="Komentář pro třídu…"
                className={styles.composerInput}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={pending || !draft.trim()} aria-label="Odeslat komentář">
              <Icon name="send" size={18} />
            </button>
          </form>
        </div>
      )}
      {message && (
        <p role="status" className={live ? styles.formError : styles.formInfo}>
          {message}
        </p>
      )}
    </article>
  );
}
