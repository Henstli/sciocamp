import type { Metadata } from "next";
import { ClassroomPage } from "@/components/classroom/ClassroomPage";
import { getActivity } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/kurzy/[id]">): Promise<Metadata> {
  const activity = await getActivity((await params).id);
  return { title: activity?.title ?? "Kurz" };
}

export default async function CoursePage({ params, searchParams }: PageProps<"/kurzy/[id]">) {
  const { id } = await params;
  const { tab, tym } = await searchParams;
  return <ClassroomPage id={id} kinds={["kurz"]} back={{ href: "/kurzy", label: "Kurzy" }} tab={typeof tab === "string" ? tab : undefined} team={typeof tym === "string" ? tym : undefined} />;
}
