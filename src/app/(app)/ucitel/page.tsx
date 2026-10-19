import type { Metadata } from "next";
import Link from "next/link";
import { MeetLink } from "@/components/MeetLink";
import { EmptyNote, PageHeader } from "@/components/PageHeader";
import { requireTeacher } from "@/lib/auth";
import { activitiesTaughtBy, listActivities, listPeriods } from "@/lib/data";
import { readyTeachers } from "@/lib/data-enroll";
import { ReadyToggle } from "./ReadyToggle";
import { plural } from "@/lib/format";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { expeditionBlocker, isLiveNow } from "@/lib/schedule";
import { describeWhen, formatDateRange } from "@/lib/periods";
import { formatDue, formatLongDate, pragueNow, toIso } from "@/lib/time";
import styles from "./ucitel.module.css";

export const metadata: Metadata = { title: "Moje třídy" };

export default async function TeacherPage({ searchParams }: PageProps<"/ucitel">) {
  const user = await requireTeacher();
  const now = pragueNow();
  const blocked = expeditionBlocker(await listActivities());
  const classes = await activitiesTaughtBy(user);
  const { smazano } = await searchParams;
  const today = toIso(now);
  // Období v přípravě: učitel zadá kurzy a potvrdí, že má hotovo.
  const preparing = await Promise.all(
    (await listPeriods())
      .filter((p) => !p.publishedAt && p.endsOn >= today)
      .map(async (p) => ({ period: p, ready: (await readyTeachers(p.id)).includes(user.id) })),
  );

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

      {preparing.map(({ period: p, ready }) => {
        const mine = classes.filter((c) => c.kind === "kurz" && c.period?.id === p.id);
        return (
          <section key={p.id} aria-label={`Příprava: ${p.name}`} className={`card ${styles.prepare}`}>
            <div className={styles.prepareText}>
              <div className={styles.kind}>Příprava období · {formatDateRange(p.startsOn, p.endsOn)}</div>
              <h2 className={styles.title}>{p.name}</h2>
              <p className={styles.prepareNote}>
                {mine.length === 0
                  ? "Zatím tu nemáš žádný kurz. Založ ho přes „Nová aktivita“ a vyber toto období."
                  : `Máš tu ${mine.length} ${plural(mine.length, "kurz", "kurzy", "kurzů")}: ${mine.map((c) => c.title).join(", ")}.`}{" "}
                Studenti je uvidí, až admin období zveřejní
                {p.enrollOpensAt ? ` (zápis se má otevřít ${formatDue(p.enrollOpensAt)})` : ""}. Až budeš mít kurzy připravené,
                dej vědět.
              </p>
            </div>
            <ReadyToggle periodId={p.id} ready={ready} />
          </section>
        );
      })}

      {classes.length === 0 ? (
        <EmptyNote>
          Zatím neučíš žádný kurz ani ateliér. Založ si ho tlačítkem <strong>Nová aktivita</strong> — zadáš název, rozvrh a pak do
          něj zapíšeš studenty.
        </EmptyNote>
      ) : (
        <div className={styles.grid}>
          {classes.map((c) => {
            const live = isLiveNow(c, now, blocked);
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
                  {c.published === false &&
                    (c.announceReady ? (
                      <span className="chip chip-info">Připraveno k vyhlášení</span>
                    ) : (
                      <span className="chip chip-wait">Studenti zatím nevidí</span>
                    ))}
                </div>
                <div className={styles.actions}>
                  <Link href={activityHref(c)} className="btn btn-outline">
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
