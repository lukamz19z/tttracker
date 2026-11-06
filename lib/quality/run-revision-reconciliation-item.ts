export type ItemReconciliationOutcome = {
  id: string;
  fli: string;
  transition?: { kind: "updated" | "skipped" | "failed"; reason?: string };
  metadata?: { kind: "repaired" | "failed" | "locked"; fields?: string[]; reason?: string };
};

/** Runs one status transition followed by an independently retryable metadata repair. */
export async function runRevisionReconciliationItem(args: {
  id: string;
  fli: string;
  statusEligible: boolean;
  metadataFields: string[];
  metadataLocked: boolean;
  transition: () => Promise<{ ok: boolean; conflict?: boolean; reason?: string }>;
  repairMetadata: () => Promise<{ ok: boolean; fields?: string[]; lockedReason?: string; reason?: string }>;
}): Promise<ItemReconciliationOutcome> {
  const outcome: ItemReconciliationOutcome = { id: args.id, fli: args.fli };
  if (args.statusEligible) {
    try {
      const result = await args.transition();
      if (!result.ok) {
        outcome.transition = { kind: result.conflict ? "skipped" : "failed", reason: result.reason || "Status transition failed." };
        return outcome;
      }
      outcome.transition = { kind: "updated" };
    } catch (error) {
      outcome.transition = { kind: "failed", reason: error instanceof Error ? error.message : "Unexpected transition failure." };
      return outcome;
    }
  }

  if (!args.metadataFields.length) return outcome;
  if (args.metadataLocked) {
    outcome.metadata = { kind: "locked", reason: "Verified findings are locked; capture metadata was not changed." };
    return outcome;
  }
  try {
    const result = await args.repairMetadata();
    if (result.lockedReason) outcome.metadata = { kind: "locked", reason: result.lockedReason };
    else if (!result.ok) outcome.metadata = { kind: "failed", reason: result.reason || "Capture metadata repair failed." };
    else outcome.metadata = { kind: "repaired", fields: result.fields || [] };
  } catch (error) {
    outcome.metadata = { kind: "failed", reason: error instanceof Error ? error.message : "Capture metadata repair failed." };
  }
  return outcome;
}
