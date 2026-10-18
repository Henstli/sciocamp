"use client";

import { useActionState, useState } from "react";
import { GoogleLogo } from "@/components/Icon";
import { loginAsDemo, loginWithEmail, loginWithGoogle, requestPasswordReset, type LoginState } from "./actions";
import styles from "./login.module.css";

type DemoAccount = { id: string; name: string; email: string; caption: string };

export function LoginForm({
  demoAccounts,
  live,
  initialError,
}: {
  demoAccounts: DemoAccount[];
  /** true = napojeno na Supabase, false = ukázkový režim */
  live: boolean;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginWithEmail, {});
  const [reset, resetAction, resetPending] = useActionState<LoginState, FormData>(requestPasswordReset, {});
  const [showDemo, setShowDemo] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [email, setEmail] = useState("");
  const error = state.error ?? initialError;

  return (
    <div className={styles.form}>
      <div>
        <h2 className={styles.title}>Vítej zpět</h2>
        <p className={styles.subtitle}>Přihlas se svým školním účtem.</p>
      </div>

      {live ? (
        <form action={loginWithGoogle}>
          <button type="submit" className={styles.google} style={{ width: "100%" }}>
            <GoogleLogo />
            Pokračovat přes Google
          </button>
        </form>
      ) : (
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
      )}

      {!live && showDemo && (
        <div id="demo-accounts" className={styles.demo}>
          <div className={styles.demoNote}>
            <strong>Ukázkový režim.</strong> Aplikace zatím není napojená na databázi. Vyber ukázkový účet:
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
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor="heslo">Heslo</label>
            <button
              type="button"
              className={styles.linkButton}
              aria-expanded={showReset}
              onClick={() => setShowReset((v) => !v)}
            >
              Zapomenuté heslo?
            </button>
          </div>
          <input id="heslo" name="password" type="password" autoComplete="current-password" placeholder="••••••••" className="input" />
        </div>
        {!live && (
          <label className={styles.remember}>
            <input type="checkbox" name="remember" defaultChecked />
            Zapamatovat si mě
          </label>
        )}

        {error && (
          <p id="login-error" role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" style={{ minHeight: 48, fontSize: 15 }} disabled={pending}>
          {pending ? "Přihlašuji…" : "Přihlásit se"}
        </button>
      </form>

      {showReset && (
        <form action={resetAction} className={styles.demo}>
          <div className={styles.demoNote}>
            Pošleme ti odkaz, přes který si nastavíš nové heslo. Platí i pro první nastavení hesla, když ti nepřišla pozvánka.
          </div>
          <input type="hidden" name="email" value={email || state.email || ""} />
          <button type="submit" className="btn btn-outline-primary" disabled={resetPending || !(email || state.email)}>
            {resetPending ? "Posílám…" : `Poslat odkaz na ${email || state.email || "e-mail výše"}`}
          </button>
          {(reset.info || reset.error) && (
            <p role="status" className={reset.error ? styles.error : styles.hint}>
              {reset.error ?? reset.info}
            </p>
          )}
        </form>
      )}

      <p className={styles.footnote}>Nemáš účet? Přístup ti založí správce školy.</p>
    </div>
  );
}
