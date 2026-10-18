import type { Metadata } from "next";
import Link from "next/link";
import { MeetLink } from "@/components/MeetLink";
import { EmptyNote, PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { activitiesTaughtBy } from "@/lib/data";
import { plural } from "@/lib/format";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { isLiveNow } from "@/lib/schedule";
import { describeWhen } from "@/lib/periods";
import { formatLongDate, pragueNow } from "@/lib/time";
import styles from "./ucitel.module.css";

export const metadata: Metadata = { title: "Moje třídy" };

export default async function TeacherPage({ searchParams }: PageProps<"/ucitel">) {
  const user = await requireTeacher();
  const now = pragueNow();
  const classes = await activitiesTaughtBy(user);
  const { smazano } = await searchParams;

  return (
    <>
      <PageHeader eyebrow={`${formatLongDate(now)} · pohled učitele`} title="Moje třídy">
        <Link href="/ucitel/nova" className="btn btn-primary">
          + Nová aktivita
        </Link>
      </PageHeader>

      {smazano && (
        <p role="status" className={styles.success}>
          Aktivita je smazaná.
        </p>
      )}

      {classes.length === 0 ? (
        <EmptyNote>
          Zatím neučíš žádný kurz ani ateliér. Založ si ho tlačítkem <strong>Nová aktivita</strong> — zadáš název, rozvrh a pak do
          něj zapíšeš studenty.
        </EmptyNote>
      ) : (
        <div className={styles.grid}>
          {classes.map((c) => {
            const live = isLiveNow(c, now);
            return (
              <article key={c.id} className={`card ${styles.card}`}>
                <div>
                  <div className={styles.kind}>
                    {[KIND_LABEL[c.kind], describeWhen(c)].filter(Boolean).join(" · ")}
                  </div>
                  <h2 className={styles.title}>{c.title}</h2>
                </div>
                <div className={styles.facts}>
                  <span>
                    {c.studentIds.length} {plural(c.studentIds.length, "student", "studenti", "studentů")}
                  </span>
                  {c.location && <span>{c.location}</span>}
                  {c.period && <span>{c.period.name}</span>}
                  {live && <span className="chip chip-primary">Právě probíhá</span>}
                </div>
                <div className={styles.actions}>
                  <Link href={activityHref(c)} className="btn btn-outline" style={{ flex: 1 }}>
                    Otevřít
                  </Link>
                  <Link href={`/ucitel/${c.id}`} className="btn btn-outline" aria-label={`Upravit: ${c.title}`}>
                    Upravit
                  </Link>
                  <MeetLink url={c.meetUrl} variant={live ? "primary" : "soft"} label={live ? "Zahájit Meet" : "Meet"} />
                </div>
              </article>
            );
          })}
        </div>
      )}


    </>
  );
}
