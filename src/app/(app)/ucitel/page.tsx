import type { Metadata } from "next";
import Link from "next/link";
import { MeetLink } from "@/components/MeetLink";
import { EmptyNote, PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { activitiesTaughtBy } from "@/lib/data";
import { plural } from "@/lib/format";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { isLiveNow } from "@/lib/schedule";
import { formatLongDate, formatSlots, pragueNow } from "@/lib/time";
import styles from "./ucitel.module.css";

export const metadata: Metadata = { title: "Moje třídy" };

export default async function TeacherPage() {
  const user = await requireTeacher();
  const now = pragueNow();
  const classes = await activitiesTaughtBy(user);

  return (
    <>
      <PageHeader eyebrow={`${formatLongDate(now)} · pohled učitele`} title="Moje třídy" />

      {classes.length === 0 ? (
        <EmptyNote>Zatím neučíš žádný kurz ani ateliér. Přiřadit ti ho může admin ve Správě.</EmptyNote>
      ) : (
        <div className={styles.grid}>
          {classes.map((c) => {
            const live = isLiveNow(c, now);
            return (
              <article key={c.id} className={`card ${styles.card}`}>
                <div>
                  <div className={styles.kind}>
                    {KIND_LABEL[c.kind]} · {formatSlots(c.slots)}
                  </div>
                  <h2 className={styles.title}>{c.title}</h2>
                </div>
                <div className={styles.facts}>
                  <span>
                    {c.studentIds.length} {plural(c.studentIds.length, "student", "studenti", "studentů")}
                  </span>
                  <span>{c.room}</span>
                  {live && <span className="chip chip-primary">Právě probíhá</span>}
                </div>
                <div className={styles.actions}>
                  <Link href={activityHref(c)} className="btn btn-outline" style={{ flex: 1 }}>
                    Otevřít
                  </Link>
                  <MeetLink url={c.meetUrl} variant={live ? "primary" : "soft"} label={live ? "Zahájit Meet" : "Meet"} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <EmptyNote>
        Zadávání úkolů, opravování a hodnocení s body přidáme v etapě 2, oznámení třídě a chaty v etapě 3.
      </EmptyNote>
    </>
  );
}
