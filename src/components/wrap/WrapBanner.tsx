import { seasonLabel } from "@/lib/wrap";
import { WrapButton } from "./WrapPlayer";
import styles from "./wrap.module.css";

/** Pruh ve vlastním profilu: wrap jde přehrát znovu, dokud je k dispozici. */
export function WrapBanner({ until, season, trial }: { until: string; season: number; trial: boolean }) {
  return (
    <section aria-label="Tvůj rok v Campu" className={styles.banner}>
      <span className={styles.bannerIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
        </svg>
      </span>
      <div className={styles.bannerText}>
        <strong>Tvůj rok v Campu {seasonLabel(season)}</strong>
        <span>
          Shrnutí tvého školního roku. K dispozici do {until}
          {trial && " · zkouška spuštění jen pro tebe"}.
        </span>
      </div>
      <WrapButton markSeen className={styles.bannerBtn}>
        Přehrát
      </WrapButton>
    </section>
  );
}
