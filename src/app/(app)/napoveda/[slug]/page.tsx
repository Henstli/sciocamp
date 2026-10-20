import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { HelpFeedback } from "@/components/help/HelpFeedback";
import { HelpShot } from "@/components/help/HelpShot";
import { AudienceChip } from "@/components/help/HelpIndex";
import { requireUser } from "@/lib/auth";
import { isSupabase } from "@/lib/config";
import { myHelpFeedback } from "@/lib/data-help";
import { HELP_TOPICS, guidesFor, helpGuide } from "@/lib/help/guides";
import { shotFor } from "@/lib/help/shots";
import { initials } from "@/lib/roles";
import styles from "@/components/help/help.module.css";

export async function generateMetadata({ params }: PageProps<"/napoveda/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: helpGuide(slug)?.title ?? "Nápověda" };
}

export default async function HelpGuidePage({ params }: PageProps<"/napoveda/[slug]">) {
  const { slug } = await params;
  const user = await requireUser();
  const mine = guidesFor(user.role);
  const guide = mine.find((g) => g.slug === slug);
  if (!guide) notFound();
  const feedback = await myHelpFeedback(user, slug);
  const topic = HELP_TOPICS.find((t) => t.key === guide.topic)!;
  const index = mine.indexOf(guide);
  const next = mine[index + 1] ?? null;

  return (
    <>
      <PageHeader title="Nápověda" avatar={{ initials: initials(user.name), name: user.name }} />
      <div className={styles.layout}>
        <nav aria-label="Návody" className={styles.nav}>
          <Link href="/napoveda" className={styles.back}>
            <span aria-hidden="true">←</span> Všechny návody
          </Link>
          {HELP_TOPICS.map((t) => {
            const list = mine.filter((g) => g.topic === t.key);
            if (list.length === 0) return null;
            return (
              <div key={t.key} className={styles.navGroup}>
                <span className={styles.navTitle}>{t.title}</span>
                {list.map((g) => (
                  <Link key={g.slug} href={`/napoveda/${g.slug}`} className={styles.navItem} aria-current={g.slug === slug ? "page" : undefined}>
                    {g.title}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <article className={`card ${styles.article}`}>
          <header className={styles.head}>
            <span className={styles.kicker}>
              <AudienceChip audience={guide.audience} />
              {topic.title} · asi {guide.minutes} min
            </span>
            <h1 className={styles.title}>{guide.title}</h1>
            <p className={styles.intro}>{guide.intro}</p>
          </header>

          <ol className={styles.steps}>
            {guide.steps.map((step, i) => {
              const shot = shotFor(guide.slug, i);
              return (
                <li key={i} className={styles.step}>
                  <span className={styles.num} aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className={styles.stepBody}>
                    <h2 className={styles.stepTitle}>{step.title}</h2>
                    <p className={styles.stepText}>{step.text}</p>
                    {shot && <HelpShot shot={shot} label={`Krok ${i + 1}: ${step.title}`} />}
                  </div>
                </li>
              );
            })}
          </ol>

          {guide.tip && (
            <aside className={styles.tip}>
              <strong>Na co si dát pozor</strong>
              {guide.tip}
            </aside>
          )}

          <footer className={styles.foot}>
            <HelpFeedback slug={guide.slug} initial={feedback} live={isSupabase} />
            {next && (
              <Link href={`/napoveda/${next.slug}`} className={styles.next}>
                Další: {next.title} <span aria-hidden="true">→</span>
              </Link>
            )}
          </footer>
        </article>
      </div>
    </>
  );
}
