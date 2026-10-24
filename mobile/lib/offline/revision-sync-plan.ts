import { cachedValuesWithPrefix, queueRows, enqueue } from "./db";
import { enqueueRevisionCreate, enqueueRevisionItemCreate, enqueueRevisionItemUpdate } from "./quality-sync";
import { saveRevisionWorkspace, type RevisionWorkspace } from "./revision-workspaces";

/** Recover dependencies from durable workspaces even when no detail screen is open. */
export async function prepareRevisionQueue() {
  const queued = await queueRows();
  const workspaces = await cachedValuesWithPrefix<RevisionWorkspace>("quality:revision-workspaces:");
  for (const workspace of workspaces) {
    const revisionId = workspace.serverRevisionId || workspace.routeKey;
    if (!workspace.serverRevisionId && workspace.clientMutationId) {
      await enqueueRevisionCreate({ ...workspace, findings: [], clientMutationId: workspace.clientMutationId });
    }
    for (const finding of workspace.findings) {
      if (!finding.queuedAt || !queued.some(row => row.id === finding.clientMutationId)) {
        await enqueueRevisionItemCreate({ ...finding, issueTypeId: finding.issueTypeId === "__other__" ? null : finding.issueTypeId, revisionId, projectId: workspace.projectId, towerId: workspace.towerId });
        finding.queuedAt = new Date().toISOString();
      }
    }
    for (const update of workspace.pendingUpdates) {
      if (!update.queuedAt || !queued.some(row => row.kind === "quality_revision_item_update" && (row.payload as { itemId?: string }).itemId === update.itemId)) {
        await enqueueRevisionItemUpdate({ ...update, workspaceCreatedAt: update.createdAt, clientMutationId: `rectify:${workspace.routeKey}:${update.itemId}:${update.createdAt}`, revisionId, projectId: workspace.projectId, towerId: workspace.towerId });
        update.queuedAt = new Date().toISOString();
      }
    }
    if (workspace.finaliseRequested && !workspace.finalisedAt) await enqueue("quality_revision_finalise", { revisionId, projectId: workspace.projectId }, `quality-finalise:${workspace.routeKey}`);
    await saveRevisionWorkspace(workspace);
  }
}
export async function hasRevisionDependencies(revisionId: string, excludingId: string) {
  return (await queueRows()).some(row => row.id !== excludingId && row.kind.startsWith("quality_") && (row.payload as { revisionId?: string }).revisionId === revisionId);
}

export function qualityQueuePriority(kind: string) {
  return kind === "quality_revision_create" ? 0 : kind === "quality_revision_item_create" ? 1 : kind === "quality_revision_item_update" ? 2 : kind === "quality_revision_finalise" ? 3 : 1;
}
