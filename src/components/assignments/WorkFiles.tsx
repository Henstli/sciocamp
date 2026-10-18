import { Icon } from "../Icon";
import { linkTitle } from "@/lib/assignments";
import type { LinkItem, Review, SubmissionFile } from "@/lib/types";
import styles from "./assignment.module.css";

const RESULT: Record<Review["result"], { label: string; chip: string }> = {
  splneno: { label: "Splněno", chip: "chip-ok" },
  nesplneno: { label: "Nesplněno", chip: "chip-late" },
  vraceno: { label: "Vráceno k doplnění", chip: "chip-wait" },
};

function fileCode(name: string) {
  const ext = name.split(".").pop()?.toUpperCase() ?? "";
  return ext.length >= 2 && ext.length <= 4 ? ext : "SOUB";
}

function size(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Přiložené soubory a odkazy (u studenta i u vyučujícího). */
export function WorkFiles({
  files,
  links,
  onRemoveFile,
  onRemoveLink,
  emptyText,
}: {
  files: SubmissionFile[];
  links: LinkItem[];
  onRemoveFile?: (path: string) => void;
  onRemoveLink?: (index: number) => void;
  emptyText?: string | null;
}) {
  if (files.length === 0 && links.length === 0) {
    return emptyText ? <p className={styles.small}>{emptyText}</p> : null;
  }
  return (
    <ul className={styles.items}>
      {files.map((f) => (
        <li key={f.path} className={styles.item}>
          <span className={styles.badge} data-kind={fileCode(f.name) === "PDF" ? "pdf" : "file"}>
            {fileCode(f.name)}
          </span>
          <span className={styles.itemText}>
            {f.url ? (
              <a href={f.url} target="_blank" rel="noopener noreferrer" className={styles.itemName}>
                {f.name}
              </a>
            ) : (
              <span className={styles.itemName}>{f.name}</span>
            )}
            <span className={styles.itemMeta}>Soubor{f.size ? ` · ${size(f.size)}` : ""}</span>
          </span>
          {onRemoveFile && (
            <button type="button" className={styles.remove} aria-label={`Odebrat ${f.name}`} onClick={() => onRemoveFile(f.path)}>
              <Icon name="trash" size={16} />
            </button>
          )}
        </li>
      ))}
      {links.map((l, i) => (
        <li key={`${l.url}-${i}`} className={styles.item}>
          <span className={styles.badge} data-kind="link">
            <Icon name="link" size={16} />
          </span>
          <span className={styles.itemText}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className={styles.itemName}>
              {l.title || linkTitle(l.url)}
            </a>
            <span className={styles.itemMeta}>{shortUrl(l.url)}</span>
          </span>
          {onRemoveLink && (
            <button type="button" className={styles.remove} aria-label={`Odebrat odkaz ${l.title}`} onClick={() => onRemoveLink(i)}>
              <Icon name="trash" size={16} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 24 ? `${u.pathname.slice(0, 24)}…` : u.pathname;
    return `${u.hostname.replace(/^www\./, "")}${path === "/" ? "" : path}`;
  } catch {
    return url;
  }
}

/** Výsledek hodnocení: stav, body, slovní hodnocení a případný požadavek. */
export function ReviewSummary({ review, maxPoints, forStudent }: { review: Review; maxPoints: number | null; forStudent?: boolean }) {
  const r = RESULT[review.result];
  return (
    <div className={styles.review} data-result={review.result}>
      <div className={styles.reviewHead}>
        <span className={styles.reviewTitle}>{forStudent ? "Hodnocení vyučujícího" : `Hodnocení: ${r.label.toLowerCase()}`}</span>
        {maxPoints !== null && review.points !== null && (
          <span className={styles.points}>
            {review.points} <span>/ {maxPoints} b.</span>
          </span>
        )}
      </div>
      {review.result === "vraceno" && review.request && (
        <div>
          <div className={styles.metaLabel}>{forStudent ? "Co doplnit" : "Požadavek"}</div>
          <p className={styles.reviewText}>{review.request}</p>
        </div>
      )}
      {review.feedback && (
        <div>
          <div className={styles.metaLabel}>Slovní hodnocení</div>
          <p className={styles.reviewText}>{review.feedback}</p>
        </div>
      )}
    </div>
  );
}
