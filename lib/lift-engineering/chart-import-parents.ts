export type ChartImportParent = {
  id: string;
  status: string;
  identityKey: string;
  manufacturerConfiguration?: Record<string, unknown>;
  sourceDocument?: Record<string, unknown>;
};

export type ChartImportParentCandidate = {
  identityKey: string;
  manufacturerChartId: string;
  sourceRows: number[];
  value: Record<string, unknown>;
};

export type ChartImportParentStore = {
  findByIdentityKeys(identityKeys: string[]): Promise<ChartImportParent[]>;
  insert(candidates: ChartImportParentCandidate[]): Promise<ChartImportParent[]>;
};

export class ChartImportParentError extends Error {
  readonly code?: string;
  readonly stage: string;

  constructor(message: string, code?: string, stage = "chart configuration insert") {
    super(message);
    this.code = code;
    this.stage = stage;
  }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function chartConflictContext(candidate: ChartImportParentCandidate, batchNumber: number): string {
  const sourceRows = candidate.sourceRows.slice(0, 12).join(", ") + (candidate.sourceRows.length > 12 ? ", …" : "");
  return `Batch ${batchNumber}; manufacturer chart ID ${candidate.manufacturerChartId}; canonical configuration identity ${candidate.identityKey}; source row(s) ${sourceRows || "unknown"}`;
}

/**
 * Resolve parent charts by their exact persisted identity before creating any.
 * Bulk creation stays the normal path; a concurrent 23505 causes a re-read and
 * retry of only the identities that are still absent.
 */
export async function getOrCreateChartImportParents(
  candidates: ChartImportParentCandidate[],
  store: ChartImportParentStore,
  options: { batchNumber: number; dataOnly: boolean },
): Promise<{ parentsByIdentity: Map<string, ChartImportParent>; createdCount: number; matchedCount: number; createdIdentities: Set<string>; matchedIdentities: Set<string> }> {
  const uniqueCandidates = new Map(candidates.map((candidate) => [candidate.identityKey, candidate]));
  const identities = [...uniqueCandidates.keys()];
  const parentsByIdentity = new Map<string, ChartImportParent>();
  const matchedIdentities = new Set<string>();
  const createdIdentities = new Set<string>();

  const absorb = (parents: ChartImportParent[]) => {
    for (const parent of parents) {
      if (!uniqueCandidates.has(parent.identityKey)) continue;
      if (parentsByIdentity.has(parent.identityKey) && parentsByIdentity.get(parent.identityKey)?.id !== parent.id) {
        throw new ChartImportParentError(`More than one chart parent has canonical identity ${parent.identityKey}. Resolve duplicate chart records before importing.`, "LIFT_CHART_DUPLICATE_IDENTITY", "chart configuration lookup");
      }
      parentsByIdentity.set(parent.identityKey, parent);
      if (!createdIdentities.has(parent.identityKey)) matchedIdentities.add(parent.identityKey);
    }
  };
  const fetch = async (keys: string[]) => {
    if (keys.length) absorb(await store.findByIdentityKeys(keys));
  };

  await fetch(identities);
  for (const [identity, candidate] of uniqueCandidates) {
    const existing = parentsByIdentity.get(identity);
    if (!existing && options.dataOnly) throw new ChartImportParentError(`No exact chart configuration exists for ${candidate.manufacturerChartId}. Data-only import will not create or fall back to another configuration.`, undefined, "data-only validation");
    if (existing && ["Verified", "Superseded"].includes(existing.status)) {
      throw new ChartImportParentError(`Chart ${candidate.manufacturerChartId} is ${existing.status}; create a new chart revision instead of editing it.`, undefined, "chart status validation");
    }
  }

  let pending = identities.filter((identity) => !parentsByIdentity.has(identity));
  let createdCount = 0;
  let matchedCount = parentsByIdentity.size;
  let raceRecoveryAttempts = 0;
  while (pending.length) {
    const insertCandidates = pending.map((identity) => uniqueCandidates.get(identity)!);
    try {
      const inserted = await store.insert(insertCandidates);
      absorb(inserted);
      createdCount += inserted.length;
      for (const parent of inserted) { createdIdentities.add(parent.identityKey); matchedIdentities.delete(parent.identityKey); }
      const unresolved = pending.filter((identity) => !parentsByIdentity.has(identity));
      if (unresolved.length) throw new ChartImportParentError(`Chart insert returned no parent for ${unresolved.map((identity) => uniqueCandidates.get(identity)?.manufacturerChartId).join(", ")}.`, "LIFT_CHART_MAPPING");
      pending = [];
    } catch (error) {
      if (error instanceof ChartImportParentError && error.code !== "23505") throw error;
      if (errorCode(error) !== "23505" && !(error instanceof ChartImportParentError && error.code === "23505")) throw error;
      raceRecoveryAttempts += 1;
      const before = parentsByIdentity.size;
      await fetch(pending);
      const recovered = parentsByIdentity.size - before;
      for (const identity of pending) {
        const parent = parentsByIdentity.get(identity);
        if (parent && ["Verified", "Superseded"].includes(parent.status)) {
          throw new ChartImportParentError(`Chart ${uniqueCandidates.get(identity)?.manufacturerChartId} became ${parent.status} during import; it was not modified.`, "23505", "chart status validation");
        }
      }
      matchedCount += recovered;
      pending = pending.filter((identity) => !parentsByIdentity.has(identity));
      if (recovered === 0) {
        for (const identity of [...pending]) {
          const candidate = uniqueCandidates.get(identity)!;
          try {
            const inserted = await store.insert([candidate]);
            absorb(inserted);
            createdCount += inserted.length;
            for (const parent of inserted) { createdIdentities.add(parent.identityKey); matchedIdentities.delete(parent.identityKey); }
          } catch (individualError) {
            if (errorCode(individualError) !== "23505") throw individualError;
            await fetch([identity]);
            const existing = parentsByIdentity.get(identity);
            if (!existing) {
              const message = individualError instanceof Error ? individualError.message : "Unique chart identity conflict.";
              throw new ChartImportParentError(`${message}. Constraint: lift_load_charts_import_identity_idx. ${chartConflictContext(candidate, options.batchNumber)}`, "23505");
            }
            if (["Verified", "Superseded"].includes(existing.status)) throw new ChartImportParentError(`Chart ${candidate.manufacturerChartId} is ${existing.status}; it was not modified. ${chartConflictContext(candidate, options.batchNumber)}`, "23505", "chart status validation");
            matchedCount += 1;
            matchedIdentities.add(identity);
          }
        }
        pending = [];
        continue;
      }
      if (pending.length && raceRecoveryAttempts >= 3) {
        for (const identity of [...pending]) {
          const candidate = uniqueCandidates.get(identity)!;
          try {
            const inserted = await store.insert([candidate]);
            absorb(inserted);
            createdCount += inserted.length;
            for (const parent of inserted) { createdIdentities.add(parent.identityKey); matchedIdentities.delete(parent.identityKey); }
          } catch (individualError) {
            if (errorCode(individualError) !== "23505") throw individualError;
            await fetch([identity]);
            const existing = parentsByIdentity.get(identity);
            if (!existing) {
              const message = individualError instanceof Error ? individualError.message : "Unique chart identity conflict.";
              throw new ChartImportParentError(`${message}. Constraint: lift_load_charts_import_identity_idx. ${chartConflictContext(candidate, options.batchNumber)}`, "23505");
            }
            if (["Verified", "Superseded"].includes(existing.status)) throw new ChartImportParentError(`Chart ${candidate.manufacturerChartId} is ${existing.status}; it was not modified. ${chartConflictContext(candidate, options.batchNumber)}`, "23505", "chart status validation");
            matchedCount += 1;
            matchedIdentities.add(identity);
          }
        }
        pending = [];
      }
    }
  }
  return { parentsByIdentity, createdCount, matchedCount, createdIdentities, matchedIdentities };
}
