"use client";

import { useActionState, useState } from "react";
import { GoogleLogo } from "@/components/Icon";
import { loginAsDemo, loginWithEmail, type LoginState } from "./actions";
import styles from "./login.module.css";

type DemoAccount = { id: string; name: string; email: string; caption: string };

export function LoginForm({ demoAccounts }: { demoAccounts: DemoAccount[] }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginWithEmail, {});
  const [showDemo, setShowDemo] = useState(false);
  const [showReset, setShowReset] = useState(false);

  return (
    <div className={styles.form}>
      <div>
        <h2 className={styles.title}>Vítej zpět</h2>
        <p className={styles.subtitle}>Přihlas se svým školním účtem.</p>
      </div>

      <button
        type="button"
        className={styles.google}
        aria-expanded={showDemo}
        aria-controls="demo-accounts"
        onClick={() => setShowDemo((v) => !v)}
      >
        <GoogleLogo />
        Pokračovat přes Google
      </button>

      {showDemo && (
        <div id="demo-accounts" className={styles.demo}>
          <div className={styles.demoNote}>
            <strong>Ukázkový režim.</strong> Přihlášení přes Google zapojíme se Supabase. Zatím vyber ukázkový účet:
          </div>
          {demoAccounts.map((a) => (
            <form key={a.id} action={loginAsDemo}>
              <input type="hidden" name="userId" value={a.id} />
              <button type="submit" className={styles.demoAccount}>
                <span className={styles.demoName}>{a.name}</span>
                <span className={styles.demoMeta}>
                  {a.caption} · {a.email}
                </span>
              </button>
            </form>
          ))}
        </div>
      )}

      <div className={styles.divider}>
        <span />
        nebo e-mailem
        <span />
      </div>

      <form action={formAction} className={styles.fields} noValidate>
        <div className={styles.field}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="jmeno@scioskola.cz"
            defaultValue={state.email}
            className="input"
            aria-invalid={!!state.error}
            aria-describedby={state.error ? "login-error" : undefined}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor="heslo">Heslo</label>
            <button type="button" className={styles.linkButton} onClick={() => setShowReset((v) => !v)}>
              Zapomenuté heslo?
            </button>
          </div>
          <input id="heslo" name="password" type="password" autoComplete="current-password" placeholder="••••••••" className="input" />
          {showReset && (
            <p className={styles.hint}>Odkaz na nastavení nového hesla ti pošleme na školní e-mail. V ukázkovém režimu zatím nefunguje.</p>
          )}
        </div>
        <label className={styles.remember}>
          <input type="checkbox" name="remember" defaultChecked />
          Zapamatovat si mě
        </label>

        {state.error && (
          <p id="login-error" role="alert" className={styles.error}>
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" style={{ minHeight: 48, fontSize: 15 }} disabled={pending}>
          {pending ? "Přihlašuji…" : "Přihlásit se"}
        </button>
      </form>

      <p className={styles.footnote}>Nemáš účet? Přístup ti založí správce školy.</p>
    </div>
  );
}
