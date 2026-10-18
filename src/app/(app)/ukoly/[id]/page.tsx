import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrivateComments, type CommentView } from "@/components/assignments/PrivateComments";
import { ReviewForm } from "@/components/assignments/ReviewForm";
import { StudentWork } from "@/components/assignments/StudentWork";
import { ReviewSummary, WorkFiles } from "@/components/assignments/WorkFiles";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/PageHeader";
import { STATE_CHIP, STATE_LABEL, isHandedIn, linkTitle, workState } from "@/lib/assignments";
import { requireUser } from "@/lib/auth";
import { isSupabase } from "@/lib/config";
import { canOpenActivity, getActivity, getUsersByIds, teachesActivity } from "@/lib/data";
import { assignmentFiles, commentCounts, getAssignment, getComments, getWork, workMap } from "@/lib/data-assignments";
import { plural } from "@/lib/format";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { canTeach, initials } from "@/lib/roles";
import { formatDue, formatStamp } from "@/lib/time";
import type { Comment, User } from "@/lib/types";
import styles from "../ukol.module.css";

export async function generateMetadata({ params }: PageProps<"/ukoly/[id]">): Promise<Metadata> {
  const a = await getAssignment((await params).id).catch(() => null);
  return { title: a?.title ?? "Úkol" };
}

export default async function AssignmentPage({ params, searchParams }: PageProps<"/ukoly/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { student, nove, ulozeno, soubory } = await searchParams;
  const a = await getAssignment(id);
  const activity = a ? await getActivity(a.activityId) : null;
  if (!a || !activity || !canOpenActivity(user, activity)) notFound();

  const teaching = teachesActivity(user, activity);
  const [teacher] = await getUsersByIds([activity.teacherId]);
  const isTask = a.kind === "ukol";
  const files = await assignmentFiles(a.id);

  const people = new Map<string, User>();
  const remember = (list: User[]) => list.forEach((u) => people.set(u.id, u));
  remember([user, ...(teacher ? [teacher] : [])]);
  const toView = (list: Comment[]): CommentView[] =>
    list.map((c) => {
      const author = people.get(c.authorId);
      return {
        id: c.id,
        author: author?.name ?? "Neznámý uživatel",
        initials: author ? initials(author.name) : "?",
        mine: c.authorId === user.id,
        staff: author ? canTeach(author.role) : false,
        body: c.body,
        time: formatStamp(c.createdAt),
      };
    });

  // --- Hlavička se zadáním (stejná pro všechny) ---
  const article = (
    <article className={`card ${styles.article}`}>
      <div className={styles.chips}>
        <span className={`chip ${isTask ? "chip-primary" : "chip-info"}`}>
          {isTask ? "Úkol" : "Materiál"}
          {a.topic ? ` · ${a.topic}` : ""}
        </span>
        {a.dueAt && <span className="chip chip-wait">Termín {formatDue(a.dueAt)}</span>}
        {a.maxPoints !== null && (
          <span className="chip chip-info">
            {a.maxPoints} {plural(a.maxPoints, "bod", "body", "bodů")}
          </span>
        )}
      </div>
      <div>
        <h1 className={styles.title}>{a.title}</h1>
        <div className={styles.byline}>
          {teacher?.name} · zadáno {formatStamp(a.createdAt)}
        </div>
      </div>
      {a.instructions && <div className={styles.instructions}>{a.instructions}</div>}
      {(a.links.length > 0 || files.length > 0) && (
        <div className={styles.attachments}>
          {files.map((f) => (
            <a key={f.path} href={f.url} target="_blank" rel="noopener noreferrer" className={styles.attachment}>
              <span className={styles.attachmentIcon}>
                <Icon name="file" size={18} />
              </span>
              <span className={styles.attachmentText}>
                <span className={styles.attachmentName}>{f.name}</span>
                <span className={styles.attachmentMeta}>Soubor{f.size ? ` · ${fileSize(f.size)}` : ""}</span>
              </span>
            </a>
          ))}
          {a.links.map((l, i) => (
            <a key={`${l.url}-${i}`} href={l.url} target="_blank" rel="noopener noreferrer" className={styles.attachment}>
              <span className={styles.attachmentIcon}>
                <Icon name="link" size={18} />
              </span>
              <span className={styles.attachmentText}>
                <span className={styles.attachmentName}>{l.title}</span>
                <span className={styles.attachmentMeta}>{linkTitle(l.url)}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </article>
  );

  const header = (
    <div className={styles.topRow}>
      <Link href={`${activityHref(activity)}?tab=work`} className={styles.back}>
        <Icon name="chevronLeft" size={16} strokeWidth={2.2} />
        {KIND_LABEL[activity.kind]} {activity.title}
      </Link>
      {teaching && (
        <Link href={`/ukoly/${a.id}/upravit`} className="btn btn-outline">
          <Icon name="edit" size={16} />
          Upravit
        </Link>
      )}
    </div>
  );

  const notice =
    soubory === "chyba" ? (
      <p role="alert" className={styles.success} data-tone="error">
        Úkol je uložený, ale některý soubor se nepodařilo nahrát. Zkus ho přidat přes Upravit.
      </p>
    ) : nove || ulozeno ? (
      <p role="status" className={styles.success}>
        {nove ? (isTask ? "Úkol je zadaný. Studenti ho uvidí ve třídě i v Úkolech." : "Materiál je přidaný do třídy.") : "Změny jsou uložené."}
      </p>
    ) : null;

  // --- Materiál: jen zadání ---
  if (!isTask) {
    return (
      <>
        {header}
        {notice}
        <div className={styles.narrow}>{article}</div>
      </>
    );
  }

  // --- Pohled vyučujícího ---
  if (teaching) {
    const students = await getUsersByIds(activity.studentIds);
    remember(students);
    const works = await workMap([a.id]);
    const counts = await commentCounts(a.id);
    const rows = students.map((s) => {
      const work = works.get(`${a.id}:${s.id}`) ?? null;
      return { s, work, state: workState(a, work) };
    });
    const order = { odevzdano: 0, vraceno: 1, pozde: 2, ceka: 3, splneno: 4, nesplneno: 5, material: 6 } as const;
    rows.sort((x, y) => order[x.state] - order[y.state] || x.s.name.localeCompare(y.s.name, "cs"));
    const toReview = rows.filter((r) => r.state === "odevzdano").length;
    const submitted = rows.filter((r) => isHandedIn(r.state)).length;

    const selectedId = typeof student === "string" && activity.studentIds.includes(student) ? student : null;
    const selected = selectedId ? people.get(selectedId)! : null;
    const selectedWork = selectedId ? await getWork(a.id, selectedId) : null;
    const selectedState = selectedId ? workState(a, selectedWork) : null;
    const thread = selectedId ? toView(await getComments(a.id, selectedId)) : [];

    return (
      <>
        {header}
        {notice}
        <div className={styles.columns}>
          <div className={styles.mainCol}>
            {article}
            <section aria-label="Práce studentů" className={`card ${styles.table}`}>
              <div className={styles.tableHead}>
                <h2 className={styles.h2}>Práce studentů</h2>
                <div className={styles.chips}>
                  <span className="chip chip-primary">{toReview} k opravení</span>
                  <span className="chip chip-info">
                    odevzdalo {submitted} z {rows.length}
                  </span>
                </div>
              </div>
              {rows.length === 0 && <p className={styles.emptyRow}>Ve třídě zatím nejsou zapsaní žádní studenti.</p>}
              {rows.map(({ s, work, state }) => {
                const n = counts.get(s.id) ?? 0;
                return (
                  <Link
                    key={s.id}
                    href={`/ukoly/${a.id}?student=${s.id}`}
                    scroll={false}
                    className={styles.studentRow}
                    aria-current={s.id === selectedId ? "true" : undefined}
                  >
                    <Avatar initials={initials(s.name)} size={36} />
                    <span className={styles.studentMain}>
                      <span className={styles.studentName}>{s.name}</span>
                      <span className={styles.studentMeta}>
                        {work?.submission?.submittedAt ? `odevzdáno ${formatStamp(work.submission.submittedAt)}` : "nic neodevzdal(a)"}
                        {n > 0 && ` · ${n} ${plural(n, "komentář", "komentáře", "komentářů")}`}
                      </span>
                    </span>
                    {a.maxPoints !== null && work?.review?.points != null && (
                      <span className={styles.studentPoints}>
                        {work.review.points}/{a.maxPoints}
                      </span>
                    )}
                    <span className={`chip ${STATE_CHIP[state]}`}>{STATE_LABEL[state]}</span>
                  </Link>
                );
              })}
            </section>
          </div>

          <div className={styles.sideCol} id="prace">
            {selected && selectedWork && selectedState ? (
              <>
                <section aria-label={`Práce: ${selected.name}`} className={`card ${styles.panel}`}>
                  <div className={styles.panelHead}>
                    <h2 className={styles.h2}>{selected.name}</h2>
                    <span className={`chip ${STATE_CHIP[selectedState]}`}>{STATE_LABEL[selectedState]}</span>
                  </div>
                  <WorkFiles
                    files={selectedWork.submission?.files ?? []}
                    links={selectedWork.submission?.links ?? []}
                    emptyText="Student zatím nic nepřiložil."
                  />
                  {selectedWork.submission?.note && (
                    <div className={styles.note}>
                      <div className={styles.metaLabel}>Poznámka studenta</div>
                      {selectedWork.submission.note}
                    </div>
                  )}
                  {selectedWork.review && <ReviewSummary review={selectedWork.review} maxPoints={a.maxPoints} />}
                  <ReviewForm
                    key={`${selected.id}-${selectedWork.review?.reviewedAt ?? "nove"}`}
                    assignmentId={a.id}
                    studentId={selected.id}
                    studentName={selected.name}
                    maxPoints={a.maxPoints}
                    current={selectedWork.review}
                  />
                </section>
                <PrivateComments
                  key={selected.id}
                  assignmentId={a.id}
                  studentId={selected.id}
                  comments={thread}
                  hint={`Vidíš jen ty a ${selected.name.split(" ")[0]}.`}
                  placeholder={`Napiš: ${selected.name.split(" ")[0]}…`}
                />
              </>
            ) : (
              <section className={`card ${styles.panel}`}>
                <h2 className={styles.h2}>Hodnocení</h2>
                <p className={styles.small}>
                  Vyber studenta v seznamu. Uvidíš jeho práci, ohodnotíš ji body {a.maxPoints ? `(max. ${a.maxPoints})` : ""}, výsledkem
                  splněno / nesplněno / vráceno a slovně, a můžeš mu napsat soukromý komentář.
                </p>
              </section>
            )}
          </div>
        </div>
      </>
    );
  }

  // --- Pohled studenta ---
  const work = await getWork(a.id, user.id);
  const state = workState(a, work);
  const thread = toView(await getComments(a.id, user.id));

  return (
    <>
      {header}
      {notice}
      <div className={styles.columns}>
        <div className={styles.mainCol}>{article}</div>
        <div className={styles.sideCol}>
          <StudentWork
            assignmentId={a.id}
            userId={user.id}
            live={isSupabase}
            state={state}
            submission={work.submission}
            review={work.review}
            maxPoints={a.maxPoints}
          />
          <PrivateComments
            assignmentId={a.id}
            studentId={user.id}
            comments={thread}
            hint="Vidíš jen ty a vyučující."
            placeholder="Napiš vyučujícímu…"
          />
        </div>
      </div>
    </>
  );
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
