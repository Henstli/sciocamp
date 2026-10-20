import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { HelpIndex } from "@/components/help/HelpIndex";
import { requireUser } from "@/lib/auth";
import { HELP_TOPICS, guidesFor } from "@/lib/help/guides";
import { coverFor } from "@/lib/help/shots";
import { initials } from "@/lib/roles";

export const metadata: Metadata = { title: "Nápověda" };

export default async function HelpPage() {
  const user = await requireUser();
  const guides = guidesFor(user.role);
  return (
    <>
      <PageHeader
        title="Nápověda"
        subtitle="Krátké návody krok za krokem, na skutečných obrazovkách aplikace."
        avatar={{ initials: initials(user.name), name: user.name }}
      />
      <HelpIndex
        topics={HELP_TOPICS.map((t) => ({
          key: t.key,
          title: t.title,
          guides: guides
            .filter((g) => g.topic === t.key)
            .map((g) => ({
              slug: g.slug,
              title: g.title,
              intro: g.intro,
              minutes: g.minutes,
              steps: g.steps.length,
              audience: g.audience,
              cover: coverFor(g.slug, g.cover)?.frames[0] ?? null,
              keywords: g.steps.map((s) => `${s.title} ${s.text}`).join(" "),
            })),
        })).filter((t) => t.guides.length > 0)}
      />
    </>
  );
}
