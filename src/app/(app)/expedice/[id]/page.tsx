import type { Metadata } from "next";
import { ClassroomPage } from "@/components/classroom/ClassroomPage";
import { getActivity } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/expedice/[id]">): Promise<Metadata> {
  const activity = await getActivity((await params).id);
  return { title: activity?.title ?? "Expedice" };
}

export default async function ExpeditionPage({ params, searchParams }: PageProps<"/expedice/[id]">) {
  const { id } = await params;
  const { tab, tym } = await searchParams;
  return <ClassroomPage id={id} kinds={["expedice"]} back={{ href: "/expedice", label: "Expedice" }} tab={typeof tab === "string" ? tab : undefined} team={typeof tym === "string" ? tym : undefined} />;
}
