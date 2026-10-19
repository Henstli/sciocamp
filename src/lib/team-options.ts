import "server-only";
import { getUsersByIds } from "./data";
import { teamPresets } from "./data-teams";
import type { Activity } from "./types";

/**
 * Podklady pro rozdělení do týmů ve formuláři úkolu: zapsaní studenti
 * a týmy z dřívějších týmových úkolů pro každou třídu.
 */
export async function teamOptions(classes: Activity[], exceptAssignmentId?: string) {
  const entries = await Promise.all(
    classes.map(async (c) => {
      const students = (await getUsersByIds(c.studentIds))
        .map((u) => ({ id: u.id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "cs"));
      const presets = (await teamPresets(c, exceptAssignmentId)).map((p) => ({
        assignmentId: p.assignmentId,
        title: p.title,
        teams: p.teams.map((t) => ({ name: t.name, memberIds: t.memberIds })),
      }));
      return [c.id, students, presets] as const;
    }),
  );
  return {
    classStudents: Object.fromEntries(entries.map(([id, students]) => [id, students])),
    presets: Object.fromEntries(entries.map(([id, , presets]) => [id, presets])),
  };
}
