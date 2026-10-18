import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { activitiesForUser, getUserById } from "@/lib/data";
import { activityHref } from "@/lib/links";
import { ROLE_LABEL, initials } from "@/lib/roles";
import styles from "./profil.module.css";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const activities = await activitiesForUser(user);
  const courses = activities.filter((a) => a.kind === "kurz");
  const ateliers = activities.filter((a) => a.kind === "atelier");
  const homeroom = user.homeroomTeacherId ? await getUserById(user.homeroomTeacherId) : null;
  const teaching = activities.filter((a) => a.teacherId === user.id);

  return (
    <div className={styles.wrap}>
      <section className={`card ${styles.cover}`}>
        <div aria-hidden="true" className={styles.banner}>
          <div className={styles.b1} />
          <div className={styles.b2} />
        </div>
        <div className={styles.identity}>
          <div className={styles.bigAvatar}>{initials(user.name)}</div>
          <div className={styles.idText}>
            <h1 className={styles.name}>{user.name}</h1>
            <div className={styles.sub}>
              {ROLE_LABEL[user.role]} · {user.group}
            </div>
          </div>
          <Link href="/nastaveni" className="btn btn-outline">
            Upravit profil
          </Link>
        </div>
        {user.bio && <p className={styles.bio}>{user.bio}</p>}
      </section>

      <div className={styles.stats}>
        {user.role === "student" ? (
          <>
            <Stat label="Kurzy v bloku" value={courses.length} />
            <Stat label="Ateliéry" value={ateliers.length} />
          </>
        ) : (
          <>
            <Stat label="Třídy, které učíš" value={teaching.length} />
            <Stat label="Studentů celkem" value={new Set(teaching.flatMap((a) => a.studentIds)).size} />
          </>
        )}
      </div>

      <div className={styles.columns}>
        <section aria-label="Kontakt" className={`card ${styles.panel}`} style={{ flex: "1 1 300px" }}>
          <h2 className={styles.h2}>Kontakt</h2>
          <Field label="Školní e-mail" value={user.email} />
          {homeroom && <Field label="Třídní učitel" value={homeroom.name} />}
          <Link href="/zpravy" className="btn btn-soft">
            Napsat zprávu
          </Link>
        </section>

        <section aria-label="Kurzy a ateliéry" className={`card ${styles.panel}`} style={{ flex: "2 1 420px" }}>
          <h2 className={styles.h2}>{user.role === "student" ? "Kurzy a ateliéry" : "Výuka"}</h2>
          <div className={styles.pills}>
            {[...ateliers, ...courses, ...activities.filter((a) => a.kind === "ostatni" && a.teacherId === user.id)].map((a) => (
              <Link key={a.id} href={activityHref(a)} className={styles.pill} data-tone={a.kind === "atelier" ? a.tone : "soft"}>
                {a.title}
              </Link>
            ))}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={styles.fieldValue}>{value}</div>
    </div>
  );
}
