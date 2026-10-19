import Link from "next/link";
import { activityHref } from "@/lib/links";
import { hasEnded, hasStarted } from "@/lib/periods";
import { ROLE_LABEL, initials } from "@/lib/roles";
import type { Activity, User } from "@/lib/types";
import styles from "@/app/(app)/profil/profil.module.css";

const KIND_ORDER: Activity["kind"][] = ["atelier", "kurz", "ostatni", "expedice"];

/**
 * Profil člověka — vlastní (/profil) i cizí (/lide/[id]). Ukazuje jen
 * aktivity, které ještě neskončily.
 */
export function ProfileView({
  person,
  isMe,
  phone,
  socials = null,
  activities,
  todayIso,
}: {
  /** Instagram (vidí všichni ve škole) */
  socials?: { instagram: string | null; discord: string | null } | null;
  person: User;
  isMe: boolean;
  /** Telefon, pokud ho divák smí vidět */
  phone: string | null;
  activities: Activity[];
  todayIso: string;
}) {
  // Jen kurzy a ateliéry, které právě běží (začaly a ještě neskončily).
  const current = activities
    .filter((a) => (a.kind === "kurz" || a.kind === "atelier") && hasStarted(a, todayIso) && !hasEnded(a, todayIso))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, "cs"));
  const student = person.role === "student";
  // Třídy = kurzy a ateliéry (události a expedice se nepočítají).
  const teaching = current.filter(
    (a) => (a.kind === "kurz" || a.kind === "atelier") && (a.teacherId === person.id || (a.coTeacherIds ?? []).includes(person.id)),
  );
  const courses = current.filter((a) => a.kind === "kurz");
  const ateliers = current.filter((a) => a.kind === "atelier");

  return (
    <div className={styles.wrap}>
      <section className={`card ${styles.cover}`}>
        <div aria-hidden="true" className={styles.banner}>
          <div className={styles.b1} />
          <div className={styles.b2} />
        </div>
        <div className={styles.identity}>
          <div className={styles.bigAvatar}>{initials(person.name)}</div>
          <div className={styles.idText}>
            <h1 className={styles.name}>{person.name}</h1>
            <div className={styles.sub}>
              {ROLE_LABEL[person.role]} · {person.group}
            </div>
          </div>
          {isMe ? (
            <Link href="/nastaveni" className="btn btn-outline">
              Upravit profil
            </Link>
          ) : (
            <Link href={`/zpravy?s=${person.id}`} className="btn btn-primary">
              Napsat zprávu
            </Link>
          )}
        </div>
        {person.bio && <p className={styles.bio}>{person.bio}</p>}
      </section>

      <div className={styles.stats}>
        {student ? (
          <>
            <Stat label="Kurzy" value={courses.length} />
            <Stat label="Ateliéry" value={ateliers.length} />
          </>
        ) : (
          <>
            <Stat label={isMe ? "Třídy, které učíš" : "Třídy, které učí"} value={teaching.length} />
            <Stat label="Studentů celkem" value={new Set(teaching.flatMap((a) => a.studentIds)).size} />
          </>
        )}
      </div>

      <div className={styles.columns}>
        <section aria-label="Kontakt" className={`card ${styles.panel}`} style={{ flex: "1 1 300px" }}>
          <h2 className={styles.h2}>Kontakt</h2>
          <Field label="Školní e-mail" value={<a href={`mailto:${person.email}`}>{person.email}</a>} />
          {phone ? (
            <Field label="Telefon" value={<a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>} />
          ) : isMe ? (
            <Field label="Telefon" value={<Link href="/nastaveni">Doplnit telefon</Link>} />
          ) : null}
          {socials?.instagram ? (
            <Field
              label="Instagram"
              value={
                <a href={`https://www.instagram.com/${socials.instagram}/`} target="_blank" rel="noopener noreferrer">
                  @{socials.instagram}
                </a>
              }
            />
          ) : isMe ? (
            <Field label="Instagram" value={<Link href="/nastaveni">Přidat Instagram</Link>} />
          ) : null}
          {!isMe && (
            <Link href={`/zpravy?s=${person.id}`} className="btn btn-soft">
              Napsat zprávu
            </Link>
          )}
        </section>

        <section aria-label="Výuka" className={`card ${styles.panel}`} style={{ flex: "2 1 420px" }}>
          <h2 className={styles.h2}>{student ? "Kurzy a ateliéry" : "Výuka"}</h2>
          {current.length === 0 ? (
            <p className={styles.empty}>{isMe ? "Teď nemáš žádné probíhající třídy." : "Žádné společné probíhající třídy."}</p>
          ) : (
            <div className={styles.pills}>
              {current.map((a) => (
                <Link key={a.id} href={activityHref(a)} className={styles.pill} data-kind={a.kind}>
                  {a.title}
                </Link>
              ))}
            </div>
          )}
          <div className={styles.legend}>
            <span><i data-kind="kurz" />Kurz</span>
            <span><i data-kind="atelier" />Ateliér</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={`card ${styles.stat}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={styles.fieldValue}>{value}</div>
    </div>
  );
}
