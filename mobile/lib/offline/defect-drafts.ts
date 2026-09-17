import { getCache, setCache } from "@/lib/offline/db";
import type { LocalQualityPhoto } from "@/types/quality";

export type DefectWorkingDraft = {
  projectId: string;
  towerId: string;
  issueTypeId: string | null;
  memberNumber: string;
  segment: string;
  drawingNumber: string;
  description: string;
  responsibility: string;
  clientReference: string;
  severity: "Minor" | "Major" | "Critical";
  assignedToUserId: string | null;
  photos: LocalQualityPhoto[];
  updatedAt: string;
};

function key(projectId: string) {
  return `quality:defect-draft:${projectId}`;
}

export async function loadDefectWorkingDraft(
  projectId: string,
): Promise<DefectWorkingDraft | null> {
  if (!projectId) return null;
  const cached = await getCache<DefectWorkingDraft>(key(projectId));
  return cached?.value ?? null;
}

export async function saveDefectWorkingDraft(
  draft: DefectWorkingDraft,
) {
  if (!draft.projectId) return;
  await setCache(key(draft.projectId), {
    ...draft,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearDefectWorkingDraft(projectId: string) {
  if (!projectId) return;
  await setCache(key(projectId), null);
}
