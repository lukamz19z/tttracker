import type {
  DailyDocketDraft,
  DailyDocketEditorPayload,
  DocketTowerOption,
  DocketUserIdentity,
} from "@/types/daily-dockets";

type ShellArgs = {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  tower: DocketTowerOption;
  docketDate: string;
  docketId: string;
  identity: DocketUserIdentity;
  defaults: { prestartMinutes: string; lunchBreakMinutes: string };
  createBlankDraft: (args: {
    projectId: string;
    towerId: string;
    docketDate: string;
  }) => DailyDocketDraft;
};

/** Build an immediately renderable, network-independent new docket shell. */
export function createLocalDailyDocketShell(args: ShellArgs): DailyDocketEditorPayload {
  const draft: DailyDocketDraft = {
    ...args.createBlankDraft({
      projectId: args.projectId,
      towerId: args.tower.id,
      docketDate: args.docketDate,
    }),
    docketId: args.docketId,
    prestartMinutes: args.defaults.prestartMinutes,
    lunchBreakMinutes: args.defaults.lunchBreakMinutes,
    bcRepName: args.identity.name,
    bcRepEmail: args.identity.email,
    bcRepUserId: args.identity.userId,
  };

  return {
    project: {
      id: args.projectId,
      name: args.projectName || "Project",
      project_number: args.projectNumber,
    },
    towers: [args.tower],
    identity: args.identity,
    draft,
    resolvedDefaults: args.defaults,
    recommendedDocketDate: args.docketDate,
    productivityTowers: [],
    towerProgress: {},
    crews: [],
    employees: [],
    defectIssueTypes: [],
    defectAssignees: [],
    towerDefects: [],
    outstandingMaterials: [],
    activeBundleTransfers: [],
    bundleReplacementStatus: [],
  };
}

const HYDRATABLE_DRAFT_FIELDS: (keyof DailyDocketDraft)[] = [
  "docketDate",
  "prestartMinutes",
  "lunchBreakMinutes",
  "travelInMinutes",
  "travelOutMinutes",
  "rateType",
  "hasBodyExtension",
  "sectionV2Rows",
  "outstandingMaterials",
  "activeBundleTransfers",
  "bundleReplacementStatus",
  "bundleReplacementDrafts",
  "bcRepName",
  "bcRepEmail",
  "bcRepUserId",
];

/** Merge background data into the same draft without replacing user edits. */
export function mergeNewDailyDocketHydration(args: {
  currentPayload: DailyDocketEditorPayload;
  currentDraft: DailyDocketDraft;
  hydrated: DailyDocketEditorPayload;
  editedFields: ReadonlySet<keyof DailyDocketDraft>;
  expectedDocketId: string;
}): { payload: DailyDocketEditorPayload; draft: DailyDocketDraft } | null {
  const { currentPayload, currentDraft, hydrated, editedFields, expectedDocketId } = args;
  if (
    currentDraft.mode !== "create" ||
    currentDraft.docketId !== expectedDocketId ||
    currentDraft.projectId !== hydrated.draft.projectId ||
    currentDraft.towerId !== hydrated.draft.towerId
  ) return null;

  const draft = { ...currentDraft };
  for (const field of HYDRATABLE_DRAFT_FIELDS) {
    if (!editedFields.has(field)) {
      Object.assign(draft, { [field]: hydrated.draft[field] });
    }
  }

  // Keep the server's baseline date distinct if the operator already chose
  // another date, so the editor can request progress for that chosen date.
  const payloadDraft = editedFields.has("docketDate")
    ? { ...draft, docketDate: hydrated.draft.docketDate }
    : draft;

  return {
    draft,
    payload: { ...currentPayload, ...hydrated, draft: payloadDraft },
  };
}
