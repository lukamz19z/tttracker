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

async function catalogue(projectId: string, kind: "member" | "bolt") {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await apiJson<{ rows: Record<string, unknown>[] }>(`/api/mobile/materials/catalogue?projectId=${encodeURIComponent(projectId)}&kind=${kind}&offset=${offset}`);
    rows.push(...page.rows.map(row => ({ ...row, search_text: Object.values(row).filter(value => typeof value === "string").join(" ").toLowerCase() })));
    if (page.rows.length < 500) return rows;
  }
}
export async function refreshMaterials(projectId: string, onSnapshot?: (data: MaterialPayload) => void, summaryOnly = false) {
  const started = Date.now();
  const raw = await apiJson<MaterialPayload>(`/api/mobile/materials/bootstrap?projectId=${encodeURIComponent(projectId)}`, { timeoutMs: 45_000 });
  const cached = await getCache<MaterialPayload>(materialCacheKey(projectId));
  const snapshot = { ...raw, members: cached?.value.members || [], bolts: cached?.value.bolts || [] };
  await setCache(materialCacheKey(projectId), { ...snapshot, cataloguePending: summaryOnly ? Boolean((cached?.value as MaterialPayload & { cataloguePending?: boolean } | undefined)?.cataloguePending) : true });
  onSnapshot?.(snapshot);
  if (__DEV__) console.debug("Materials useful snapshot", { durationMs: Date.now() - started, bundles: raw.bundles.length });
  if (summaryOnly) return snapshot;
  // Catalogue download is background work: never gate the working bundle register.
  const [members, bolts] = await Promise.all([catalogue(projectId, "member"), catalogue(projectId, "bolt")]);
  const data = { ...raw, members, bolts } as MaterialPayload;
  await setCache(materialCacheKey(projectId), data);
  if (__DEV__) console.debug("Materials catalogue ready", { durationMs: Date.now() - started, members: members.length, bolts: bolts.length });
  return data;
}
export async function cachedMaterials(projectId: string) {
  const current = await getCache<MaterialPayload>(materialCacheKey(projectId));
  if (current) return (current.value as MaterialPayload & { cataloguePending?: boolean }).cataloguePending ? { ...current, requiresCatalogueRefresh: true } : current;
  const legacy = await getCache<MaterialPayload>(`materials:v2:${projectId}`) || await getCache<MaterialPayload>(legacyMaterialCacheKey(projectId));
  // Render legacy bundle/check data now, but download the missing catalogues in background.
  return legacy ? { ...legacy, requiresCatalogueRefresh: true } : null;
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
    { method: "POST", timeoutMs: 30_000 },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Transfer could not be received.",
  );
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
  return readJson<{ ok: boolean; issue: { event_id: string; issue_key: string; duplicate: boolean } }>(response, "Missing material could not be reported.");
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

export async function uploadMaterialReceiptEvidence(input:MaterialReceiptEvidenceInput){
  const local=new ExpoFile(input.uri);if(!local.exists)throw new Error("Receipt evidence file is missing from this device.");
  const form=new FormData();form.append("projectId",input.projectId);form.append("issueKey",input.issueKey);form.append("receiptMutationId",input.receiptMutationId);form.append("clientEvidenceId",input.clientEvidenceId);form.append("file",local as unknown as Blob,input.name);
  const response=await apiFetch("/api/mobile/materials/missing/evidence",{method:"POST",body:form,timeoutMs:120_000});
  return readJson<{file:{id:string}}>(response,"Receipt evidence could not be uploaded.");
}

export type MaterialProjectUser = { id: string; name: string; role: string };
export async function loadMaterialProjectUsers(projectId: string) {
  const result = await apiJson<{ users: MaterialProjectUser[] }>(`/api/mobile/materials/users?projectId=${encodeURIComponent(projectId)}`, { timeoutMs: 30_000 });
  return result.users;
}

export async function loadMissingMaterialDetails(projectId:string,issueKey:string){
  return apiJson<{event:Record<string,unknown>;actions:Array<Record<string,unknown>>;files:Array<Record<string,unknown>>;receipts:Array<Record<string,unknown>>}>(`/api/mobile/materials/missing/actions?projectId=${encodeURIComponent(projectId)}&issueKey=${encodeURIComponent(issueKey)}`,{timeoutMs:30_000});
}

export async function saveMissingMaterialAction(input:{projectId:string;towerId:string;issueKey:string;clientMutationId:string;actionType:"update"|"assignment"|"cancel";text?:string;assignedToUserId?:string|null;notifyUserIds?:string[]}){
  const response=await apiFetch("/api/mobile/materials/missing/actions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),timeoutMs:30_000});
  return readJson<{ok:boolean;action:Record<string,unknown>}>(response,"Missing-material update could not be saved.");
}
