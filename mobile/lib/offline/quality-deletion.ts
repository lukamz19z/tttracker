import { apiJson } from "@/lib/api/client";
import { getCache, queueRows, removeCache, removeCachePrefix, removeQueueRecord,replaceQueuePayload, type QueueRecord } from "./db";
import { cleanupQualityRecord } from "./quality-sync";
import { listRevisionWorkspaces, saveRevisionWorkspace, removeRevisionWorkspace } from "./revision-workspaces";
import { refreshQualityRevisionDetail, resolveQualityRevision } from "@/lib/api/quality";
import { withQualityOperation } from "./quality-operation-lock";
import { markRevisionDeletion, revisionDeletion } from "./revision-deletions";

/** Canonical server deletion, with durable local cancellation before any DELETE. */
export function deleteQualityRevision(input:{projectId:string;routeKey:string;serverRevisionId?:string|null;confirm:string;online:boolean}) {
  return withQualityOperation(async()=>{
    const workspaces=await listRevisionWorkspaces(input.projectId);
    const workspace=workspaces.find(row=>row.routeKey===input.routeKey || row.serverRevisionId===input.routeKey || row.legacyRouteKeys?.includes(input.routeKey));
    const mutation=workspace?.clientMutationId || (input.routeKey.startsWith("local-")?input.routeKey.slice(6):null);
    const previous=await revisionDeletion(input.projectId,input.routeKey,input.serverRevisionId,mutation);
    const mapped=mutation?(await getCache<{id:string;revision_number?:string}>(`quality:parent-mapping:${input.projectId}:${mutation}`))?.value:null;
    let revisionId=input.serverRevisionId || workspace?.serverRevisionId || previous?.serverRevisionId || mapped?.id || (!input.routeKey.startsWith("local-")?input.routeKey:null);
    let number=workspace?.serverRevisionNumber || previous?.revisionNumber || mapped?.revision_number || input.confirm;
    const queued=await queueRows();
    if(!revisionId && mutation && queued.some(row=>row.id===mutation && row.attempts>0)) {
      if(!input.online)throw new Error("Reconnect to reconcile this attempted Rectification before deleting it.");
      const resolved=await resolveQualityRevision(input.projectId,mutation);
      revisionId=resolved.revision?.id || null;number=resolved.revision?.revision_number || number;
    }
    if(revisionId && !input.online)throw new Error("This action requires a connection.");
    if(input.confirm!==number)throw new Error(`Type ${number} to confirm deletion.`);
    const aliases=[...new Set([input.routeKey,workspace?.routeKey,revisionId,mutation,...(workspace?.legacyRouteKeys || []),...(previous?.aliases || [])].filter((id):id is string=>Boolean(id)))];
    const related=queued.filter(row=>{const body=row.payload as {projectId?:string;revisionId?:string;routeKey?:string;clientMutationId?:string};return row.kind.startsWith("quality_") && body.projectId===input.projectId && [row.id,body.revisionId,body.routeKey,body.clientMutationId].some(id=>id && aliases.includes(id));});
    const records=new Map<string,QueueRecord>((previous?.records || []).map(row=>[row.id,row]));
    related.forEach(row=>records.set(row.id,row));
    if(workspace)records.set(`deleted-workspace:${workspace.routeKey}`,{id:`deleted-workspace:${workspace.routeKey}`,kind:"quality_revision_create",payload:{projectId:input.projectId,findings:workspace.findings,pendingUpdates:workspace.pendingUpdates},status:"pending",attempts:0,lastError:null,createdAt:"",updatedAt:""});
    const marker={projectId:input.projectId,aliases,state:"deleting" as const,serverRevisionId:revisionId,revisionNumber:number,records:[...records.values()]};
    await markRevisionDeletion(marker);
    for(const row of related)await removeQueueRecord(row.id);
    let warning:string|null=null;
    if(revisionId) {
      const result=await apiJson<{warning?:string|null}>(`/api/quality/revisions/${encodeURIComponent(revisionId)}`,{method:"DELETE",body:JSON.stringify({projectId:input.projectId,confirm:number})});
      warning=result.warning || null;
    }
    // Keep the tombstone forever; stale screen/cache/queue snapshots cannot recreate it.
    await markRevisionDeletion({...marker,state:"deleted"});
    for(const row of workspaces.filter(row=>aliases.includes(row.routeKey) || Boolean(row.serverRevisionId && aliases.includes(row.serverRevisionId)) || Boolean(row.clientMutationId && aliases.includes(row.clientMutationId))))await removeRevisionWorkspace(input.projectId,row.routeKey);
    for(const record of records.values())await cleanupQualityRecord(record);
    for(const row of workspace?.findings || [])await removeCache(`quality:item-mapping:${input.projectId}:${row.clientMutationId}`);
    for(const id of Object.keys(workspace?.serverItems || {}))await removeCache(`quality:item-mapping:${input.projectId}:${id}`);
    for(const row of workspace?.cachedDetail?.items || [])if(row.mobile_client_mutation_id)await removeCache(`quality:item-mapping:${input.projectId}:${row.mobile_client_mutation_id}`);
    if(mutation)await removeCache(`quality:parent-mapping:${input.projectId}:${mutation}`);
    if(revisionId)await removeCache(`quality:revision:${input.projectId}:${revisionId}`);
    await removeCachePrefix(`quality:list:revisions:${input.projectId}:`);
    await markRevisionDeletion({...marker,state:"deleted",records:[]});
    return {warning};
  });
}

/** Keep pending records until any server-side create outcome has been reconciled. */
export async function deleteQualityFinding(input:{projectId:string;routeKey:string;itemId?:string;clientMutationId?:string;confirm:string;online:boolean}) {
  const rows=await queueRows();
  if(rows.some(row=>row.status==="syncing" && row.kind.startsWith("quality_"))) throw new Error("Wait for Quality sync to finish before deleting.");
  const workspace=(await listRevisionWorkspaces(input.projectId)).find(row=>row.routeKey===input.routeKey || row.serverRevisionId===input.routeKey);
  const mutation=input.clientMutationId || Object.entries(workspace?.serverItems || {}).find(([,item])=>item.id===input.itemId)?.[0] || "";
  const mapped=workspace?.serverItems?.[mutation] || (await getCache<{id:string;fli_number:string}>(`quality:item-mapping:${input.projectId}:${mutation}`))?.value;
  let itemId=input.itemId || mapped?.id,confirm=mapped?.fli_number || input.confirm;
  const revisionId=workspace?.serverRevisionId || (!input.routeKey.startsWith("local-")?input.routeKey:null);
  const attempted=rows.some(row=>row.id===mutation && row.attempts>0);
  if(!itemId && attempted) {
    if(!input.online || !revisionId) throw new Error("Reconnect to confirm whether this pending finding already exists before deleting it.");
    const detail=await refreshQualityRevisionDetail(input.projectId,revisionId);
    const existing=detail.items.find(row=>row.mobile_client_mutation_id===mutation);
    if(existing) {itemId=existing.id;confirm=existing.fli_number || confirm;}
  }
  if(itemId) {
    if(!input.online || !revisionId) throw new Error("This action requires a connection.");
    await apiJson(`/api/mobile/quality/revisions/${encodeURIComponent(revisionId)}/items/${encodeURIComponent(itemId)}`,{method:"DELETE",body:JSON.stringify({confirm})});
  }
  const matching=rows.filter(row=> {
    const payload=row.payload as {itemId?:string;clientMutationId?:string;revisionId?:string};
    return row.id===mutation || Boolean(payload.itemId && [input.itemId,itemId,mutation].includes(payload.itemId)) || row.kind==="quality_revision_finalise" && [input.routeKey,revisionId].includes(payload.revisionId || "");
  });
  if(workspace) {
    const finding=workspace.findings.find(row=>row.clientMutationId===mutation);
    const updates=workspace.pendingUpdates.filter(row=>[input.itemId,itemId,mutation].includes(row.itemId));
    await saveRevisionWorkspace({...workspace,finaliseRequested:false,finalisedAt:null,
      reconciledFindingIds:[...(workspace.reconciledFindingIds || []),mutation].filter(Boolean),
      reconciledUpdateKeys:[...(workspace.reconciledUpdateKeys || []),...updates.map(row=>`${row.itemId}:${row.createdAt}`)],
      findings:workspace.findings.filter(row=>row!==finding),pendingUpdates:workspace.pendingUpdates.filter(row=>!updates.includes(row)),
    });
    // Include evidence saved in the workspace before enqueue completed.
    if(finding) matching.push({id:mutation,kind:"quality_revision_item_create",payload:{...finding,projectId:input.projectId},status:"pending",attempts:0,lastError:null,createdAt:"",updatedAt:""});
    for(const update of updates) matching.push({id:`draft-cleanup:${update.itemId}:${update.createdAt}`,kind:"quality_revision_item_update",payload:{...update,projectId:input.projectId},status:"pending",attempts:0,lastError:null,createdAt:"",updatedAt:""});
  }
  for(const row of matching) await removeQueueRecord(row.id);
  for(const row of rows.filter(row=>row.kind==="quality_revision_create")) {
    const payload=row.payload as {findings?:{clientMutationId:string}[];firstFinding?:{clientMutationId:string}|null};
    if(payload.findings?.some(finding=>finding.clientMutationId===mutation) || payload.firstFinding?.clientMutationId===mutation) await replaceQueuePayload(row.id,{...payload,findings:payload.findings?.filter(finding=>finding.clientMutationId!==mutation),firstFinding:payload.firstFinding?.clientMutationId===mutation?null:payload.firstFinding});
  }
  for(const row of matching) await cleanupQualityRecord(row);
  if(revisionId) await removeCache(`quality:revision:${input.projectId}:${revisionId}`);
}

export async function deleteQualityDefect(input:{projectId:string;defectId?:string;clientMutationId?:string;confirm:string;online:boolean}) {
  const rows=await queueRows();
  const pending=rows.find(row=>row.id===input.clientMutationId);
  if(rows.some(row=>row.kind.startsWith("quality_") && row.status==="syncing")) throw new Error("Wait for Quality sync to finish before deleting.");
  const known=(await getCache<{id:string;defect_number?:string}>(`quality:defect-mapping:${input.projectId}:${input.clientMutationId}`))?.value;
  let defectId=input.defectId || known?.id,confirm=known?.defect_number || input.confirm;
  if(!defectId && pending?.attempts) {
    if(!input.online) throw new Error("Reconnect to reconcile the pending Defect before deleting.");
    const result=await apiJson<{defect:{id:string;defect_number:string}|null}>(`/api/mobile/quality/defects?projectId=${encodeURIComponent(input.projectId)}&clientMutationId=${encodeURIComponent(input.clientMutationId || "")}`);
    if(result.defect){defectId=result.defect.id;confirm=result.defect.defect_number;}
  }
  if(defectId) {
    if(!input.online) throw new Error("This action requires a connection.");
    await apiJson(`/api/quality/defects/${encodeURIComponent(defectId)}`,{method:"DELETE",body:JSON.stringify({projectId:input.projectId,confirm})});
  }
  const matching=rows.filter(row=>row.id===input.clientMutationId || Boolean(defectId && (row.payload as {defectId?:string}).defectId===defectId));
  for(const row of matching) await removeQueueRecord(row.id);
  for(const row of matching) await cleanupQualityRecord(row);
  if(defectId) await removeCache(`quality:defect:${input.projectId}:${defectId}`);
  if(input.clientMutationId) await removeCache(`quality:defect-mapping:${input.projectId}:${input.clientMutationId}`);
}
