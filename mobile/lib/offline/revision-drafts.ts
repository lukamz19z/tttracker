import { getCache, setCache } from "@/lib/offline/db";
import type {
  InspectionStage,
  LocalQualityPhoto,
  RevisionItemStatus,
} from "@/types/quality";

export type RevisionDraftFinding = {
  localId: string;
  issueTypeId: string | null;
  otherIssueText: string | null;
  towerSegment: string | null;
  memberNumber: string | null;
  drawingNumber: string | null;
  finding: string;
  rectificationComment: string | null;
  status: RevisionItemStatus;
  beforePhotos: LocalQualityPhoto[];
  afterPhotos: LocalQualityPhoto[];
};

export type RevisionWorkingDraft = {
  projectId: string;
  towerId: string;
  inspectionStage: InspectionStage;
  inspectionDate: string;
  clientInspector: string;
  clientCompany: string;
  clientReference: string;
  notes: string;
  findings: RevisionDraftFinding[];
  updatedAt: string;
};

export function revisionDraftKey(projectId: string) {
  return `quality:revision-working-draft:${projectId}`;
}

export function localToday() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function blankRevisionFinding(index = 1): RevisionDraftFinding {
  return {
    localId: `fli-local-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    issueTypeId: null,
    otherIssueText: null,
    towerSegment: null,
    memberNumber: null,
    drawingNumber: null,
    finding: "",
    rectificationComment: null,
    status: "Open",
    beforePhotos: [],
    afterPhotos: [],
  };
}

export function blankRevisionDraft(projectId: string): RevisionWorkingDraft {
  return {
    projectId,
    towerId: "",
    inspectionStage: "Post Erection",
    inspectionDate: localToday(),
    clientInspector: "",
    clientCompany: "",
    clientReference: "",
    notes: "",
    findings: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function loadRevisionWorkingDraft(projectId: string) {
  return getCache<RevisionWorkingDraft>(revisionDraftKey(projectId));
}

export async function saveRevisionWorkingDraft(draft: RevisionWorkingDraft) {
  const next = { ...draft, updatedAt: new Date().toISOString() };
  await setCache(revisionDraftKey(draft.projectId), next);
  return next;
}

export async function clearRevisionWorkingDraft(projectId: string) {
  await setCache(revisionDraftKey(projectId), null);
}
