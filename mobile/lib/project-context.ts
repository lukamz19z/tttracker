export type ProjectChoice = { id: string; status?: string | null };

export function resolveInitialProjectId<T extends ProjectChoice>(
  projects: T[],
  localProjectId: string | null,
  serverProjectId: string | null,
) {
  return projects.find((project) => project.id === localProjectId)?.id ??
    projects.find((project) => project.id === serverProjectId)?.id ??
    projects.find((project) => project.status?.trim().toLowerCase() === "active")?.id ??
    projects[0]?.id ?? null;
}

export function isCurrentProjectGeneration(responseGeneration: number, currentGeneration: number) {
  return responseGeneration === currentGeneration;
}
