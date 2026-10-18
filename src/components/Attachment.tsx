"use client";

// Příloha ve zprávě nebo chatu. Obrázky ukáže rovnou jako náhled, ostatní
// soubory jako kartičku ke stažení. Když server nedodal odkaz (zpráva přišla
// živě nebo ji uživatel právě poslal), vyžádá si dočasný odkaz sama.

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { createClient } from "@/lib/supabase/client";
import type { SubmissionFile } from "@/lib/types";
import styles from "./Attachment.module.css";

const IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;

export function isImageName(name: string) {
  return IMAGE.test(name);
}

function fileSize(bytes: number | null) {
  if (!bytes) return "Soubor";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function Attachment({
  bucket,
  file,
  live,
  /** Náhled obrázku, který uživatel právě vybral (ještě bez odkazu ze serveru) */
  localUrl,
}: {
  bucket: string;
  file: SubmissionFile;
  live: boolean;
  localUrl?: string;
}) {
  const [signed, setSigned] = useState<string | null>(null);
  const url = file.url ?? signed ?? localUrl ?? null;

  useEffect(() => {
    if (file.url || !live || !file.path) return;
    let alive = true;
    createClient()
      .storage.from(bucket)
      .createSignedUrl(file.path, 60 * 60)
      .then(({ data }) => {
        if (alive && data?.signedUrl) setSigned(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [bucket, file.path, file.url, live]);

  if (isImageName(file.name)) {
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.imageLink} title={`Otevřít ${file.name}`}>
        {/* Obrázky jsou za dočasným odkazem ze Storage, optimalizace Next.js tu nepomůže. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={file.name} className={styles.image} loading="lazy" />
      </a>
    ) : (
      <span className={styles.imagePlaceholder} aria-label={`Načítám obrázek ${file.name}`}>
        <Icon name="file" size={20} />
      </span>
    );
  }

  const body = (
    <>
      <span className={styles.icon}>
        <Icon name="file" size={20} />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{file.name}</span>
        <span className={styles.meta}>{url || !live ? fileSize(file.size) : "Připravuji odkaz…"}</span>
      </span>
    </>
  );
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.file} download={file.name}>
      {body}
    </a>
  ) : (
    <span className={styles.file} aria-disabled="true">
      {body}
    </span>
  );
}
