import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import { ProposalForm } from "@/components/proposals/ProposalForm";
import { requireUser } from "@/lib/auth";
import { getUsersByIds } from "@/lib/data";
import { listProposals } from "@/lib/data-proposals";
import { plural } from "@/lib/format";
import type { Proposal } from "@/lib/proposals";
import { canTeach, initials } from "@/lib/roles";
import { nowMs } from "@/lib/time";
import styles from "./navrhy.module.css";

export const metadata: Metadata = { title: "Návrhy" };

/** Co má vyučující udělat: potvrdit počet, nebo rozhodnout. */
function staffTodo(p: Proposal) {
  if (p.status !== "open") return 0;
  if (p.need === null) return 2;
  return p.supportCount >= p.need ? 1 : 0;
}

export default async function ProposalsPage() {
  const user = await requireUser();
  const all = await listProposals(user);
  const people = await getUsersByIds([...new Set(all.map((p) => p.authorId))]);
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? "Bývalý člen školy";
  const staff = canTeach(user.role);
  const now = new Date(nowMs());

  // Otevřené: vyučujícím nahoru ty, které čekají na ně; jinak nejnovější.
  const open = all
    .filter((p) => p.status === "open")
    .sort((a, b) => (staff ? staffTodo(b) - staffTodo(a) : 0) || b.createdAt.localeCompare(a.createdAt));
  const closed = all
    .filter((p) => p.status !== "open")
    .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt));
  const waiting = open.filter((p) => staffTodo(p) > 0).length;

  return (
    <>
      <PageHeader
        title="Návrhy"
        subtitle={
          staff && waiting > 0
            ? `${waiting} ${plural(waiting, "návrh čeká", "návrhy čekají", "návrhů čeká")} na potvrzení počtu nebo rozhodnutí`
            : "Návrh s dostatečnou podporou jde na shromáždění, nebo ho posoudí vyučující."
        }
        avatar={{ initials: initials(user.name), name: user.name }}
      >
        <a href="#formular" className={`btn btn-primary ${styles.mobileOnly}`}>
          <Icon name="plus" size={16} strokeWidth={2.8} />
          Podat návrh
        </a>
      </PageHeader>
      <div className={styles.layout}>
        <div className={styles.side} id="formular">
          <ProposalForm />
        </div>
        <div className={styles.list}>
          {open.length === 0 ? (
            <div className="card" style={{ padding: 24 }}>
              <p className={styles.empty}>Zatím tu není žádný otevřený návrh. Máš nápad, co ve škole zlepšit? Podej ho vlevo.</p>
            </div>
          ) : (
            open.map((p) => <ProposalCard key={p.id} p={p} authorName={nameOf(p.authorId)} meId={user.id} now={now} />)
          )}
          {closed.length > 0 && (
            <details className={styles.closed}>
              <summary>
                Uzavřené návrhy <span>{closed.length}</span>
              </summary>
              <div className={styles.closedList}>
                {closed.map((p) => (
                  <ProposalCard key={p.id} p={p} authorName={nameOf(p.authorId)} meId={user.id} now={now} />
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
