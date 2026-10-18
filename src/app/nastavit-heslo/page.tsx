import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";
import styles from "../prihlaseni/login.module.css";

export const metadata: Metadata = { title: "Nastavit heslo" };

// Sem vede odkaz z pozvánky a z obnovy hesla (přes /auth/confirm).
export default function SetPasswordPage() {
  return (
    <main className={styles.main} style={{ minHeight: "100vh" }}>
      <Suspense fallback={<div className={styles.form} aria-busy="true" />}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  const user = await requireUser();
  return <PasswordForm email={user.email} />;
}
