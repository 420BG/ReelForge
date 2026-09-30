import { projects } from "@/db/schema";
import type { Character, ProjectStatus, StudioProject } from "@/lib/types";
import { normalizeEditorSettings, sceneDefaults } from "@/lib/timeline";

export function serializeProject(row: typeof projects.$inferSelect): StudioProject {
  return {
    ...row,
    character: row.character as Character,
    scenes: row.scenes.map((scene, index) => ({ ...sceneDefaults(index), ...scene })),
    editSettings: normalizeEditorSettings(row.editSettings),
    status: row.status as ProjectStatus,
    privacy: row.privacy as StudioProject["privacy"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function projectInsertFromSample(project: StudioProject): typeof projects.$inferInsert {
  return {
    id: project.id,
    title: project.title,
    idea: project.idea,
    category: project.category,
    ageGroup: project.ageGroup,
    duration: project.duration,
    style: project.style,
    character: project.character,
    scenes: project.scenes.map((scene, index) => ({ ...sceneDefaults(index), duration: project.duration / project.scenes.length, ...scene })),
    editSettings: normalizeEditorSettings(project.editSettings),
    status: project.status,
    thumbnail: project.thumbnail,
    youtubeTitle: project.youtubeTitle,
    description: project.description,
    tags: project.tags,
    privacy: project.privacy,
  };
}
