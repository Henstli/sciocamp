import { PageHeader, EmptyNote } from "./PageHeader";

/** Stránka z návrhu, která přijde v některé z dalších etap. */
export function ComingSoon({ title, stage, what }: { title: string; stage: number; what: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={`Přijde v etapě ${stage}`} />
      <EmptyNote>{what}</EmptyNote>
    </>
  );
}
