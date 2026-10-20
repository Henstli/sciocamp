import { getUsersByIds } from "@/lib/data";
import { pendingMandatory } from "@/lib/data-proposals";
import { requireUser } from "@/lib/auth";
import { formatDue } from "@/lib/time";
import { MandatoryVoteModal } from "./MandatoryVoteModal";

/** Povinná hlasování, o kterých přihlášený ještě nehlasoval — okno na každé stránce. */
export async function MandatoryVote() {
  const user = await requireUser();
  const pending = await pendingMandatory(user);
  if (pending.length === 0) return null;
  const authors = await getUsersByIds([...new Set(pending.map((p) => p.authorId))]);
  return (
    <MandatoryVoteModal
      items={pending.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        author: authors.find((u) => u.id === p.authorId)?.name ?? "Bývalý člen školy",
        until: formatDue(p.votingEndsAt),
      }))}
    />
  );
}
