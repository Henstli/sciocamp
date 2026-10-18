import type { Metadata } from "next";
import { ClassroomPage } from "@/components/classroom/ClassroomPage";
import { getActivity } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/kurzy/[id]">): Promise<Metadata> {
  const activity = await getActivity((await params).id);
  return { title: activity?.title ?? "Kurz" };
}

export default async function CoursePage({ params }: PageProps<"/kurzy/[id]">) {
  const { id } = await params;
  return <ClassroomPage id={id} kinds={["kurz", "ostatni"]} back={{ href: "/kurzy", label: "Kurzy" }} />;
}
