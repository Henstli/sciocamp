"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { setAvatar } from "@/lib/actions/profile";
import { isSupabase } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import styles from "@/components/manage/manage.module.css";

const SIZE = 320;

/** Ořízne obrázek na čtverec ze středu a zmenší na 320 × 320 px (JPEG). */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.85),
  );
}

export function AvatarUpload({ userId, initials, hasPhoto }: { userId: string; initials: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const working = busy || pending;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMsg({});
    if (!file.type.startsWith("image/")) return setMsg({ error: "Vyber obrázek (JPG, PNG, WebP…)." });
    if (!isSupabase) return setMsg({ info: "Ukázkový režim: fotka se neukládá." });
    setBusy(true);
    try {
      const blob = await squareJpeg(file);
      const path = `${userId}/${Date.now()}.jpg`;
      const { error } = await createClient().storage.from("avatary").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      start(async () => setMsg(await setAvatar(path)));
    } catch {
      setMsg({ error: "Fotku se nepodařilo nahrát. Zkus jiný obrázek (iPhone fotky HEIC ulož nejdřív jako JPG)." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className={`card ${styles.form}`} aria-label="Profilová fotka">
      <div>
        <h2 className="section-title">Profilová fotka</h2>
        <p className={styles.hint}>Uvidí ji jen přihlášení lidé ze školy. Obrázek se ořízne na čtverec a zmenší.</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Avatar initials={initials} size={72} tone="me" />
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" className="btn btn-primary" disabled={working} onClick={() => input.current?.click()}>
          {working ? "Nahrávám…" : hasPhoto ? "Změnit fotku" : "Nahrát fotku"}
        </button>
        {hasPhoto && (
          <button
            type="button"
            className="btn btn-outline"
            disabled={working}
            onClick={() => start(async () => setMsg(await setAvatar(null)))}
          >
            Odstranit fotku
          </button>
        )}
      </div>
      {(msg.error || msg.info) && (
        <p role="status" className={msg.error ? styles.formError : styles.formInfo}>
          {msg.error ?? msg.info}
        </p>
      )}
    </section>
  );
}
