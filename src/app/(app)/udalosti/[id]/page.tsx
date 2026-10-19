import type { Metadata } from "next";
import { ClassroomPage } from "@/components/classroom/ClassroomPage";
import { getActivity } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/udalosti/[id]">): Promise<Metadata> {
  const activity = await getActivity((await params).id);
  return { title: activity?.title ?? "Událost" };
}

export default async function EventPage({ params, searchParams }: PageProps<"/udalosti/[id]">) {
  const { id } = await params;
  const { tab, tym } = await searchParams;
  return <ClassroomPage id={id} kinds={["ostatni"]} back={{ href: "/udalosti", label: "Události" }} tab={typeof tab === "string" ? tab : undefined} team={typeof tym === "string" ? tym : undefined} />;
}
