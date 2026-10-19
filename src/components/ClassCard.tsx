import Link from "next/link";
import { Icon } from "./Icon";
import { MeetLink } from "./MeetLink";
import { activityHref } from "@/lib/links";
import { describeWhen } from "@/lib/periods";
import { plural } from "@/lib/format";
import type { Activity, User } from "@/lib/types";
import styles from "./ClassCard.module.css";

export function ClassCard({
  activity,
  teacher,
  isTeacher,
  live,
  extra,
  teacherLabel,
}: {
  activity: Activity;
  teacher: User | null;
  /** Přepíše řádek s vyučujícím (např. všichni vyučující expedice) */
  teacherLabel?: string;
  isTeacher: boolean;
  live: boolean;
  extra?: React.ReactNode;
}) {
  const href = activityHref(activity);
  return (
    <article className={`card ${styles.card}`}>
      <Link href={href} className={styles.head} data-tone={activity.tone}>
        <div className={styles.when}>
          {describeWhen(activity) || "Bez rozvrhu"}
        </div>
        <div className={styles.title}>{activity.title}</div>
        <div className={styles.lector}>{teacherLabel ?? teacher?.name}</div>
      </Link>
      <div className={styles.body}>
        {extra ?? (
          <>
            {activity.location && (
              <div className={styles.line}>
                <Icon name="pin" size={16} />
                {activity.location}
              </div>
            )}
            {activity.period && (activity.kind === "kurz" || activity.kind === "atelier") && (
              <div className={styles.line}>
                <Icon name="clock" size={16} />
                {activity.period.name}
              </div>
            )}
            <div className={styles.line}>
              <Icon name="users" size={16} />
              {activity.studentIds.length} {plural(activity.studentIds.length, "student", "studenti", "studentů")}
              {activity.capacity ? ` z ${activity.capacity} míst` : ""}
            </div>
          </>
        )}
      </div>
      <div className={styles.actions}>
        <Link href={href} className="btn btn-outline" style={{ flex: 1 }}>
          Otevřít
        </Link>
        <MeetLink
          url={activity.meetUrl}
          variant={live ? "primary" : "soft"}
          label={isTeacher && live ? "Zahájit Meet" : "Meet"}
          title={`${isTeacher && live ? "Zahájit" : "Připojit se na"} Google Meet: ${activity.title}`}
        />
      </div>
    </article>
  );
}

export function Milestones({
  done,
  total,
  label,
  tone,
}: {
  done: number;
  total: number;
  label: string;
  tone: Activity["tone"];
}) {
  return (
    <div>
      <div className={styles.msHead}>
        <span>{label}</span>
        <span className="muted">
          {done} z {total} milníků
        </span>
      </div>
      <div className={styles.ms} data-tone={tone} role="img" aria-label={`Hotovo ${done} z ${total} milníků`}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} data-done={i < done} />
        ))}
      </div>
    </div>
  );
}
