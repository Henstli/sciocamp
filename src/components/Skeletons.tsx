import { Icon } from "./Icon";
import styles from "./Skeletons.module.css";

export function SidebarSkeleton() {
  return (
    <div className={styles.side} aria-hidden="true">
      <div className={styles.brand}>
        <span className={styles.mark}>
          <Icon name="logo" size={22} />
        </span>
        ScioCamp
      </div>
      <div className={styles.navLines}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={styles.line} />
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className={styles.page} role="status" aria-label="Načítám">
      <div className={styles.title} />
      <div className={styles.cards}>
        <div className={styles.card} />
        <div className={styles.card} />
        <div className={styles.card} />
      </div>
      <div className={styles.big} />
    </div>
  );
}
