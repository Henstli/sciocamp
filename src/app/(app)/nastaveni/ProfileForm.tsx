"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileState } from "@/lib/actions/profile";
import { keepForm } from "@/lib/use-keep-form";
import styles from "@/components/manage/manage.module.css";

export function ProfileForm({
  name,
  email,
  phone,
  bio,
  isStudent,
}: {
  name: string;
  email: string;
  phone: string;
  bio: string;
  isStudent: boolean;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form onSubmit={keepForm(action)} className={`card ${styles.form}`} noValidate>
      <div>
        <h2 className="section-title">Osobní údaje</h2>
        <p className={styles.hint}>Jméno a e-mail spravuje škola. Ostatní si můžeš upravit sám.</p>
      </div>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.label}>Jméno a příjmení</span>
          <input value={name} readOnly disabled className={styles.input} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Školní e-mail</span>
          <input value={email} readOnly disabled className={styles.input} />
        </label>
        <label className={styles.field} data-invalid={!!fe.phone}>
          <span className={styles.label}>Telefon (nepovinné)</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={phone}
            placeholder="+420 777 123 456"
            className={styles.input}
          />
          {fe.phone ? (
            <span className={styles.fieldError}>{fe.phone}</span>
          ) : (
            <span className={styles.hint}>
              {isStudent
                ? "Tvoje číslo uvidí jen učitelé a vedení školy."
                : "Číslo vyučujících vidí v profilu všichni ve škole."}
            </span>
          )}
        </label>
        <label className={styles.field} data-wide="true">
          <span className={styles.label}>O mně (nepovinné)</span>
          <textarea name="bio" defaultValue={bio} rows={3} maxLength={600} className={styles.textarea} placeholder="Co tě baví, na čem právě pracuješ…" />
        </label>
      </div>
      {(state.error || state.info) && (
        <p role="status" className={state.error ? styles.formError : styles.formInfo}>
          {state.error ?? state.info}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Ukládám…" : "Uložit změny"}
        </button>
      </div>
    </form>
  );
}
