"use client";

import { useActionState } from "react";
import { setPassword, type PasswordState } from "./actions";
import styles from "../prihlaseni/login.module.css";

export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, {});
  return (
    <form action={action} className={styles.form} noValidate>
      <div>
        <h1 className={styles.title}>Nastav si heslo</h1>
        <p className={styles.subtitle}>
          Pro účet <strong>{email}</strong>. Heslem se přihlásíš, i když přihlášení přes Google nepůjde.
        </p>
      </div>
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className={styles.field}>
        <label htmlFor="password">Nové heslo</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} className="input" />
        <p className={styles.hint}>Aspoň 10 znaků.</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="again">Heslo znovu</label>
        <input id="again" name="again" type="password" autoComplete="new-password" className="input" />
      </div>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" style={{ minHeight: 48, fontSize: 15 }} disabled={pending}>
        {pending ? "Ukládám…" : "Uložit heslo a pokračovat"}
      </button>
    </form>
  );
}
