import type { Metadata } from "next";
import { AcceptInvite } from "./AcceptInvite";
import styles from "../../prihlaseni/login.module.css";

export const metadata: Metadata = { title: "Přijetí pozvánky" };

export default function AcceptInvitePage() {
  return (
    <main className={styles.main} style={{ minHeight: "100vh" }}>
      <AcceptInvite />
    </main>
  );
}
