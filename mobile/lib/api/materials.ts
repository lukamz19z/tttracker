import { apiFetch, apiJson, jsonBody } from "@/lib/api/client";
import { File as ExpoFile } from "expo-file-system";
import { getCache, setCache } from "@/lib/offline/db";
import type {
  BundleCheckRecord,
  CreateTransferInput,
  MaterialPayload,
  MaterialReceiptEvidenceInput,
  MemberCheckRecord,
  RecordMissingReceiptInput,
  CreateMissingMaterialInput,
  SaveBundleCheckInput,
  SaveMemberCheckInput,
  TransferRecord,
} from "@/types/materials";

const MATERIAL_CACHE_VERSION = 3;

export const materialCacheKey = (projectId: string) =>
  `materials:v${MATERIAL_CACHE_VERSION}:${projectId}`;

const legacyMaterialCacheKey = (projectId: string) =>
  `materials:${projectId}`;

async function readJson<T>(response: Response, fallback: string) { return jsonBody<T>(response, fallback); }

export async function refreshMaterials(projectId: string, onSnapshot?: (data: MaterialPayload) => void) {
  const started = Date.now();
  const raw = await apiJson<MaterialPayload>(`/api/mobile/materials/bootstrap?projectId=${encodeURIComponent(projectId)}`, { timeoutMs: 20_000 });
  const cached = await getCache<MaterialPayload>(materialCacheKey(projectId));
  const snapshot = { ...raw, members: cached?.value.members || [], bolts: cached?.value.bolts || [] };
  await setCache(materialCacheKey(projectId), snapshot);
  onSnapshot?.(snapshot);
  if (__DEV__) console.debug("Materials useful snapshot", { durationMs: Date.now() - started, bundles: raw.bundles.length });
  return snapshot;
}
export async function cachedMaterials(projectId: string) {
  const current = await getCache<MaterialPayload>(materialCacheKey(projectId));
  if (current) return current;
  const legacy = await getCache<MaterialPayload>(`materials:v2:${projectId}`) || await getCache<MaterialPayload>(legacyMaterialCacheKey(projectId));
  return legacy;
}

export type MaterialSearchResult={kind:"member"|"bundle"|"bolt";id:string;towerId:string;towerName:string;title:string;subtitle:string;meta:string;record:Record<string,unknown>};
export async function searchMaterialRegister(projectId:string,kind:"member"|"bundle"|"bolt",towerId:string,query:string){
  const value=query.trim();if(value.length<2)return [];
  const started=Date.now(),params=new URLSearchParams({projectId,kind,towerId,q:value,limit:"60"});
  const response=await apiJson<{results:MaterialSearchResult[]}>(`/api/mobile/materials/search?${params.toString()}`,{timeoutMs:15_000});
  if(__DEV__)console.debug("Materials type search",{kind,durationMs:Date.now()-started,resultCount:response.results.length});
  return response.results;
}

export async function saveBundleCheck(
  bundleId: string,
  input: SaveBundleCheckInput,
) {
  const response = await apiFetch(
    `/api/mobile/materials/bundle-checks/${encodeURIComponent(bundleId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      timeoutMs: 30_000,
    },
  );

  const payload = await readJson<{ check: BundleCheckRecord }>(
    response,
    "Bundle check could not be saved.",
  );

  return payload.check;
}

export async function clearBundleCheck(bundleId: string) {
  const response = await apiFetch(
    `/api/mobile/materials/bundle-checks/${encodeURIComponent(bundleId)}`,
    { method: "DELETE", timeoutMs: 30_000 },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Bundle check could not be cleared.",
  );
}

export async function saveMemberCheck(
  memberId: string,
  input: SaveMemberCheckInput,
) {
  const response = await apiFetch(
    `/api/mobile/materials/member-checks/${encodeURIComponent(memberId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      timeoutMs: 30_000,
    },
  );

  const payload = await readJson<{ check: MemberCheckRecord }>(
    response,
    "Member status could not be saved.",
  );

  return payload.check;
}

export async function clearMemberCheck(memberId: string) {
  const response = await apiFetch(
    `/api/mobile/materials/member-checks/${encodeURIComponent(memberId)}`,
    { method: "DELETE", timeoutMs: 30_000 },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Member status could not be cleared.",
  );
}

export async function createMaterialTransfer(input: CreateTransferInput) {
  const response = await apiFetch("/api/mobile/materials/transfers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 30_000,
  });

  const payload = await readJson<{ transfer: TransferRecord }>(
    response,
    "Transfer could not be created.",
  );

  return payload.transfer;
}

export async function receiveMaterialTransfer(transferId: string) {
  const response = await apiFetch(
    `/api/mobile/materials/transfers/${encodeURIComponent(transferId)}/receive`,
    { method: "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({clientMutationId:`material-transfer-receive-${transferId}`}), timeoutMs: 30_000 },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Transfer could not be received.",
  );
}

export async function createExcessTransfer(input:{projectId:string;sourceTowerId:string;destinationTowerId:string;sourceIssueKey:string;destinationIssueKey?:string|null;quantity:number;clientMutationId:string;notes?:string}){
  const response=await apiFetch("/api/mobile/materials/missing/transfers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),timeoutMs:30_000});
  return readJson<{ok:boolean;transfer:TransferRecord;duplicate:boolean}>(response,"Excess transfer could not be created.");
}

export async function cancelMaterialTransfer(transferId: string) {
  const response = await apiFetch(
    `/api/mobile/materials/transfers/${encodeURIComponent(transferId)}/cancel`,
    { method: "POST", timeoutMs: 30_000 },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Transfer could not be cancelled.",
  );
}

export async function recordMissingReceipt(
  input: RecordMissingReceiptInput,
) {
  const response = await apiFetch(
    "/api/mobile/materials/missing/receive",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      timeoutMs: 30_000,
    },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Missing material receipt could not be recorded.",
  );
}

export async function createMissingMaterial(input: CreateMissingMaterialInput) {
  const response = await apiFetch("/api/mobile/materials/missing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 30_000,
  });
  return readJson<{ ok: boolean; issue: { event_id: string; issue_key: string; duplicate: boolean } }>(response, "Material issue could not be reported.");
}

export async function getMissingMaterialMutationStatus(input: { projectId: string; towerId: string; clientMutationId: string }) {
  const params = new URLSearchParams(input);
  const response = await apiFetch(`/api/mobile/materials/missing/status?${params.toString()}`, { method: "GET", dedupe: false });
  if (response.status === 404) {
    await response.text();
    return { found: false as const };
  }
  return readJson<{ found: true; event: { id: string; project_id: string; tower_id: string; event_type: string; issue_status: string | null; assigned_to_user_id: string | null; notify_user_ids: string[] | null; client_mutation_id: string; tower_material_event_items: { issue_key: string | null }[] } }>(response, "Material report status could not be checked.");
}

export async function collectExcessMaterial(input:{projectId:string;towerId:string;issueKey:string;quantity:number;clientMutationId:string;location?:string;reference?:string;notes?:string}){
  const response=await apiFetch("/api/mobile/materials/missing/collect-excess",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),timeoutMs:30_000});
  return readJson<{ok:boolean;collection:{event_id:string;duplicate:boolean;remaining_quantity:number;total_quantity:number;collected_quantity:number}}>(response,"Excess material could not be collected.");
}

export async function resolveMissingMaterial(input: { projectId: string; towerId: string; issueKey: string }) {
  const response = await apiFetch("/api/mobile/materials/missing/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 30_000,
  });
  await readJson<{ ok: boolean }>(response, "Missing material could not be resolved.");
}

export async function uploadMaterialReceiptEvidence(input:MaterialReceiptEvidenceInput & { receiptEventId?: string }){
  const local=new ExpoFile(input.uri);if(!local.exists)throw new Error("Receipt evidence file is missing from this device.");
  const form=new FormData();form.append("projectId",input.projectId);form.append("issueKey",input.issueKey);if(input.receiptEventId)form.append("receiptEventId",input.receiptEventId);else form.append("receiptMutationId",input.receiptMutationId);form.append("clientEvidenceId",input.clientEvidenceId);form.append("file",local as unknown as Blob,input.name);
  const response=await apiFetch("/api/mobile/materials/missing/evidence",{method:"POST",body:form,timeoutMs:120_000});
  return readJson<{file:{id:string}}>(response,"Receipt evidence could not be uploaded.");
}

export type MaterialProjectUser = { id: string; name: string; role: string };
export type MaterialUserChoices = { materialUsers: MaterialProjectUser[] };
const materialUsersCacheKey = (projectId: string) => `materials:configured-users:v2:${projectId}`;
export async function cachedMaterialProjectUsers(projectId: string) {
  const current = await getCache<MaterialUserChoices>(materialUsersCacheKey(projectId));
  if (current) return current.value;
  // The prior cache kept notification users separately; that array was already
  // the project-configured picker source, so migrate only that safe subset.
  const legacy = await getCache<{ notifyUsers?: MaterialProjectUser[] }>(`materials:notification-users:${projectId}`);
  if (!legacy?.value.notifyUsers) return null;
  const migrated = { materialUsers: legacy.value.notifyUsers };
  await setCache(materialUsersCacheKey(projectId), migrated);
  return migrated;
}
export async function loadMaterialProjectUsers(projectId: string) {
  const key = materialUsersCacheKey(projectId);
  try {
    const choices = await apiJson<MaterialUserChoices>(`/api/mobile/materials/users?projectId=${encodeURIComponent(projectId)}`, { timeoutMs: 15_000 });
    await setCache(key, choices);
    return choices;
  } catch (error) {
    const cached = await getCache<MaterialUserChoices>(key).catch(() => null);
    if (cached) return cached.value;
    throw error;
  }
}

export async function loadMissingMaterialDetails(projectId:string,issueKey?:string,eventId?:string){
  const params=new URLSearchParams({projectId});
  if(issueKey)params.set("issueKey",issueKey);
  if(eventId)params.set("eventId",eventId);
  return apiJson<{event:Record<string,unknown>;issueKey:string;actions:Record<string,unknown>[];files:Record<string,unknown>[];receipts:Record<string,unknown>[]}>(`/api/mobile/materials/missing/actions?${params.toString()}`,{timeoutMs:15_000});
}

export async function saveMissingMaterialAction(input:{projectId:string;towerId:string;issueKey:string;clientMutationId:string;actionType:"update"|"assignment"|"cancel";text?:string;assignedToUserId?:string|null;notifyUserIds?:string[]}){
  const response=await apiFetch("/api/mobile/materials/missing/actions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),timeoutMs:30_000});
  return readJson<{ok:boolean;action:Record<string,unknown>}>(response,"Missing-material update could not be saved.");
}
