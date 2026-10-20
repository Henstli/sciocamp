import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { PrivateComments, type CommentView } from "@/components/assignments/PrivateComments";
import { ReviewForm } from "@/components/assignments/ReviewForm";
import { StudentWork } from "@/components/assignments/StudentWork";
import { ReviewSummary, WorkFiles } from "@/components/assignments/WorkFiles";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/PageHeader";
import { PublishNow } from "@/components/assignments/PublishNow";
import { STATE_CHIP, STATE_LABEL, formatLate, isHandedIn, isPublished, lateBy, linkTitle, workState } from "@/lib/assignments";
import { requireUser } from "@/lib/auth";
import { isSupabase } from "@/lib/config";
import { canOpenActivity, getActivity, getUsersByIds, teachesActivity } from "@/lib/data";
import { teamChat, teamsForAssignment } from "@/lib/data-teams";
import { ClassChat, type ChatLine } from "@/components/classroom/ClassChat";
import { PendingHint } from "@/components/assignments/PendingHint";
import { TeamPicker } from "@/components/assignments/TeamPicker";
import { TeamMembers, type TeamMember } from "@/components/assignments/TeamMembers";
import type { Person } from "@/components/classroom/people";
import { assignmentFiles, commentCounts, getAssignment, getComments, getWork, workMap } from "@/lib/data-assignments";
import { plural } from "@/lib/format";
import { KIND_LABEL, activityHref } from "@/lib/links";
import { canTeach, initials } from "@/lib/roles";
import { formatDue, formatStamp } from "@/lib/time";
import type { ClassMessage, Comment, User } from "@/lib/types";
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
  // Naplánovaný úkol student nevidí (naostro to hlídá i RLS).
  if (!teaching && !isPublished(a)) notFound();
  const isTask = a.kind === "ukol";
  // Vše nezávislé načíst naráz (každý dotaz je cesta do databáze).
  const [staff, files, teams] = await Promise.all([
    getUsersByIds([activity.teacherId, ...(activity.coTeacherIds ?? [])]),
    assignmentFiles(a.id),
    // Týmový úkol: týmy úkolu (kdo v týmu není, odevzdává sám).
    a.teamWork ? teamsForAssignment(a.id) : Promise.resolve([]),
  ]);
  const teacher = staff.find((u) => u.id === activity.teacherId);
  const teamOfStudent = (sid: string) => teams.find((t) => t.memberIds.includes(sid)) ?? null;

  const people = new Map<string, User>();
  const remember = (list: User[]) => list.forEach((u) => people.set(u.id, u));
  remember([user, ...staff]);
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

  // Členové týmu pro zobrazení (jména a avatary).
  const memberViews = (ids: string[], extra?: (id: string) => Partial<TeamMember>): TeamMember[] =>
    ids
      .map((m) => people.get(m))
      .filter((u): u is User => !!u)
      .sort((x, y) => x.name.localeCompare(y.name, "cs"))
      .map((u) => ({ id: u.id, name: u.name, initials: initials(u.name), me: u.id === user.id, ...extra?.(u.id) }));

  // Týmový chat úkolu (tým studenta, u vyučujícího tým vybraného studenta).
  // Členové týmu musí být v `people` (načtení zajistí volající).
  function teamChatBlock(teamId: string, teamName: string, canModerate: boolean, chat: ClassMessage[]) {
    const team = teams.find((t) => t.id === teamId);
    const personMap: Record<string, Person> = {};
    for (const u of people.values()) personMap[u.id] = { id: u.id, name: u.name, initials: initials(u.name), role: u.role };
    const stampNow = new Date();
    const lines: ChatLine[] = chat.map((m) => ({ ...m, when: formatStamp(m.createdAt, stampNow) }));
    const me = personMap[user.id];
    return (
      <ClassChat
        key={teamId}
        kind="team"
        label={`Týmový chat: ${teamName}`}
        title={`Týmový chat · ${teamName}`}
        // Student vidí svůj tým v kartě „Tvůj tým“, nad chatem by se opakoval.
        members={canModerate ? memberViews(team?.memberIds ?? []) : undefined}
        initial={lines}
        me={me}
        people={personMap}
        activityDbId={isSupabase ? teamId : undefined}
        live={isSupabase}
        canModerate={canModerate}
      />
    );
  }

  // --- Hlavička se zadáním (stejná pro všechny) ---
  const article = (
    <article className={`card ${styles.article}`}>
      <div className={styles.chips}>
        <span className={`chip ${isTask ? "chip-primary" : "chip-info"}`}>
          {isTask ? "Úkol" : "Materiál"}
          {a.topic ? ` · ${a.topic}` : ""}
        </span>
        {a.teamWork && <span className="chip chip-info">Týmový úkol</span>}
        {teaching && !isPublished(a) && a.publishAt && <span className="chip chip-info">Naplánováno na {formatDue(a.publishAt)}</span>}
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

  const scheduledNote =
    teaching && !isPublished(a) && a.publishAt ? (
      <div role="status" className={styles.success} data-tone="wait" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px" }}>
        <span style={{ flex: "1 1 240px" }}>
          Naplánováno: studenti {isTask ? "úkol" : "materiál"} uvidí a dostanou oznámení {formatDue(a.publishAt)}.
        </span>
        <PublishNow id={a.id} />
      </div>
    ) : null;

  const notice =
    soubory === "chyba" ? (
      <p role="alert" className={styles.success} data-tone="error">
        Úkol je uložený, ale některý soubor se nepodařilo nahrát. Zkus ho přidat přes Upravit.
      </p>
    ) : nove || ulozeno ? (
      <p role="status" className={styles.success}>
        {nove
          ? !isPublished(a)
            ? "Uloženo jako naplánované."
            : isTask
              ? "Úkol je zadaný. Studenti ho uvidí ve třídě i v Úkolech."
              : "Materiál je přidaný do třídy."
          : "Změny jsou uložené."}
      </p>
    ) : null;

  // --- Materiál: jen zadání ---
  if (!isTask) {
    return (
      <>
        {header}
        {notice}
        {scheduledNote}
        <div className={styles.narrow}>{article}</div>
      </>
    );
  }

  // --- Pohled vyučujícího ---
  if (teaching) {
    const selectedId = typeof student === "string" && activity.studentIds.includes(student) ? student : null;
    const selectedTeam = selectedId ? teamOfStudent(selectedId) : null;
    const [students, works, counts, selectedWork, comments, chat] = await Promise.all([
      getUsersByIds(activity.studentIds),
      workMap([a.id]),
      commentCounts(a.id),
      selectedId ? getWork(a.id, selectedId, selectedTeam?.id) : Promise.resolve(null),
      selectedId ? getComments(a.id, selectedId) : Promise.resolve([]),
      selectedTeam ? teamChat(selectedTeam.id) : Promise.resolve([]),
    ]);
    remember(students);
    const rows = students.map((s) => {
      const work = works.get(`${a.id}:${s.id}`) ?? null;
      return { s, work, state: workState(a, work), late: lateBy(a, work) };
    });
    const order = { odevzdano: 0, vraceno: 1, pozde: 2, ceka: 3, splneno: 4, nesplneno: 5, material: 6 } as const;
    // Týmový úkol: členové týmu pohromadě (bez týmu na konci).
    const teamKey = (sid: string) => teamOfStudent(sid)?.name ?? "\uffff";
    rows.sort((x, y) =>
      a.teamWork
        ? teamKey(x.s.id).localeCompare(teamKey(y.s.id), "cs") || x.s.name.localeCompare(y.s.name, "cs")
        : order[x.state] - order[y.state] || x.s.name.localeCompare(y.s.name, "cs"),
    );
    const toReview = rows.filter((r) => r.state === "odevzdano").length;
    const submitted = rows.filter((r) => isHandedIn(r.state)).length;
    const lateCount = rows.filter((r) => r.late !== null).length;

    const selected = selectedId ? people.get(selectedId)! : null;
    const selectedState = selectedId ? workState(a, selectedWork) : null;
    const selectedLate = selectedWork ? lateBy(a, selectedWork) : null;
    const thread = toView(comments);

    return (
      <>
        {header}
        {notice}
        {scheduledNote}
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
                  {lateCount > 0 && <span className="chip chip-late">{lateCount} po termínu</span>}
                </div>
              </div>
              {rows.length === 0 && <p className={styles.emptyRow}>Ve třídě zatím nejsou zapsaní žádní studenti.</p>}
              {rows.map(({ s, work, state, late }, i) => {
                const n = counts.get(s.id) ?? 0;
                const team = a.teamWork ? teamOfStudent(s.id) : null;
                const newGroup = a.teamWork && (i === 0 || teamOfStudent(rows[i - 1].s.id)?.id !== team?.id);
                return (
                  <Fragment key={s.id}>
                  {newGroup && (
                    <div className={styles.teamGroup} data-none={team ? undefined : true}>
                      <Icon name="users" size={16} />
                      {team ? team.name : "Bez týmu"}
                      <span className={styles.teamGroupMeta}>
                        {team
                          ? `· ${team.memberIds.length} ${plural(team.memberIds.length, "člen", "členové", "členů")}`
                          : "· odevzdávají sami"}
                      </span>
                    </div>
                  )}
                  <Link
                    key={s.id}
                    href={`/ukoly/${a.id}?student=${s.id}`}
                    scroll={false}
                    prefetch={false}
                    className={styles.studentRow}
                    aria-current={s.id === selectedId ? "true" : undefined}
                  >
                    <Avatar initials={initials(s.name)} size={36} userId={s.id} />
                    <span className={styles.studentMain}>
                      <span className={styles.studentName}>{s.name}</span>
                      <span className={styles.studentMeta}>
                        {work?.submission?.submittedAt && (isHandedIn(state) || state === "vraceno")
                          ? `odevzdáno ${formatStamp(work.submission.submittedAt)}`
                          : "nic neodevzdal(a)"}
                        {late !== null && <strong className={styles.lateText}> · pozdě {formatLate(late)}</strong>}
                        {a.teamWork && work?.review?.individual && " · hodnoceno jednotlivě"}
                        {n > 0 && ` · ${n} ${plural(n, "komentář", "komentáře", "komentářů")}`}
                      </span>
                    </span>
                    {a.maxPoints !== null && work?.review?.points != null && (
                      <span className={styles.studentPoints}>
                        {work.review.points}/{a.maxPoints}
                      </span>
                    )}
                    <span className={`chip ${STATE_CHIP[state]}`}>{STATE_LABEL[state]}</span>
                    <PendingHint className={styles.spinner} />
                  </Link>
                  </Fragment>
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
                  {selectedTeam && (
                    <div className={styles.teamBlock}>
                      <div className={styles.metaLabel}>
                        Tým: {selectedTeam.name} · odevzdávají společně
                      </div>
                      <TeamMembers
                        members={memberViews(selectedTeam.memberIds, (id) => {
                          const r = rows.find((x) => x.s.id === id);
                          return {
                            me: false,
                            current: id === selectedId,
                            href: `/ukoly/${a.id}?student=${id}`,
                            chip: r ? { label: STATE_LABEL[r.state], className: STATE_CHIP[r.state] } : undefined,
                            note: r?.work?.review?.individual ? "hodnoceno jednotlivě" : undefined,
                          };
                        })}
                      />
                    </div>
                  )}
                  {selectedLate !== null && selectedWork.submission?.submittedAt && (
                    <p className={styles.lateNote}>
                      Odevzdáno po termínu ({formatLate(selectedLate)}) — {formatStamp(selectedWork.submission.submittedAt)}, termín byl{" "}
                      {formatDue(a.dueAt!)}.
                    </p>
                  )}
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
                    team={
                      selectedTeam
                        ? {
                            name: selectedTeam.name,
                            members: memberViews(selectedTeam.memberIds).map((m) => m.name),
                          }
                        : null
                    }
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
                {selectedTeam && teamChatBlock(selectedTeam.id, selectedTeam.name, true, chat)}
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
  const myTeam = teamOfStudent(user.id);
  const [members, work, comments, chat] = await Promise.all([
    a.teamWork ? getUsersByIds(teams.flatMap((t) => t.memberIds)) : Promise.resolve([]),
    getWork(a.id, user.id, myTeam?.id),
    getComments(a.id, user.id),
    myTeam ? teamChat(myTeam.id) : Promise.resolve([]),
  ]);
  remember(members);
  const state = workState(a, work);
  const thread = toView(comments);

  return (
    <>
      {header}
      {notice}
      <div className={styles.columns}>
        <div className={styles.mainCol}>
          {article}
          {myTeam && teamChatBlock(myTeam.id, myTeam.name, false, chat)}
        </div>
        <div className={styles.sideCol}>
          {myTeam && (
            <section aria-label="Tvůj tým" className={`card ${styles.panel}`}>
              <div className={styles.panelHead}>
                <h2 className={styles.h2}>Tvůj tým</h2>
                <span className={styles.teamBadge}>
                  <Icon name="users" size={14} />
                  {myTeam.name}
                </span>
              </div>
              <TeamMembers members={memberViews(myTeam.memberIds)} />
            </section>
          )}
          {a.teamWork && !myTeam && a.teamMode === "teacher" && (
            <p className={styles.small}>Do žádného týmu tě vyučující nezařadil, úkol odevzdáváš sám.</p>
          )}
          {a.teamWork && a.teamMode === "students" && (
            <TeamPicker
              assignmentId={a.id}
              teams={teams.map((t) => ({ id: t.id, name: t.name, members: t.memberIds.map((m) => people.get(m)?.name ?? "?") }))}
              myTeamId={myTeam?.id ?? null}
              maxSize={a.teamMaxSize ?? null}
              locked={state === "splneno" || state === "nesplneno"}
            />
          )}
          <StudentWork
            assignmentId={a.id}
            userId={user.id}
            team={
              myTeam
                ? {
                    id: myTeam.id,
                    name: myTeam.name,
                    members: myTeam.memberIds.filter((m) => m !== user.id).map((m) => people.get(m)?.name ?? "?"),
                  }
                : null
            }
            live={isSupabase}
            state={state}
            submission={work.submission}
            review={work.review}
            maxPoints={a.maxPoints}
            late={lateBy(a, work)}
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
