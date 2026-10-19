import type { Metadata } from "next";
import { ClassroomPage } from "@/components/classroom/ClassroomPage";
import { getActivity } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/ateliery/[id]">): Promise<Metadata> {
  const activity = await getActivity((await params).id);
  return { title: activity?.title ?? "Ateliér" };
}

export default async function AtelierPage({ params, searchParams }: PageProps<"/ateliery/[id]">) {
  const { id } = await params;
  const { tab, tym } = await searchParams;
  return <ClassroomPage id={id} kinds={["atelier"]} back={{ href: "/ateliery", label: "Ateliéry" }} tab={typeof tab === "string" ? tab : undefined} team={typeof tym === "string" ? tym : undefined} />;
}
