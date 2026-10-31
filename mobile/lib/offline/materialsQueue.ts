import { getCache, setCache } from "@/lib/offline/db";
import type {
  SaveBundleCheckInput,
  SaveMemberCheckInput,
  CreateMissingMaterialInput,
  RecordMissingReceiptInput,
} from "@/types/materials";
import type { MaterialReceiptEvidenceInput } from "@/types/materials";

export type PendingMaterialMutation =
  | { clientMutationId?: string; projectId?: string; targetLocalId?: string; attempts?: number; lastError?: string | null; status?: "pending" | "failed"; } & (
  | {
      id: string;
      kind: "save_bundle";
      bundleId: string;
      input: SaveBundleCheckInput;
      createdAt: string;
    }
  | {
      id: string;
      kind: "clear_bundle";
      bundleId: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: "save_member";
      memberId: string;
      bundleId: string;
      input: SaveMemberCheckInput;
      createdAt: string;
    }
  | {
      id: string;
      kind: "clear_member";
      memberId: string;
      bundleId: string;
      createdAt: string;
    }
  | { id: string; kind: "report_missing"; input: CreateMissingMaterialInput; createdAt: string }
  | { id: string; kind: "receive_missing"; input: RecordMissingReceiptInput; createdAt: string }
  | { id: string; clientMutationId: string; projectId: string; targetLocalId: string; attempts: number; lastError: string | null; status: "pending" | "failed"; kind: "receipt_evidence"; input: MaterialReceiptEvidenceInput; createdAt: string }
  | { id: string; kind: "resolve_missing"; input: { projectId: string; towerId: string; issueKey: string }; createdAt: string }
  );

export const materialQueueKey = (projectId: string) =>
  `materials:pending:${projectId}`;

function mutationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function loadMaterialQueue(projectId: string) {
  const cached = await getCache<PendingMaterialMutation[]>(
    materialQueueKey(projectId),
  );
  return Array.isArray(cached?.value) ? cached.value : [];
}

export async function saveMaterialQueue(
  projectId: string,
  queue: PendingMaterialMutation[],
) {
  await setCache(materialQueueKey(projectId), queue);
}

export function makeSaveBundleMutation(
  bundleId: string,
  input: SaveBundleCheckInput,
): PendingMaterialMutation {
  return {
    id: mutationId(),
    kind: "save_bundle",
    bundleId,
    input,
    createdAt: new Date().toISOString(),
  };
}

export function makeClearBundleMutation(
  bundleId: string,
): PendingMaterialMutation {
  return {
    id: mutationId(),
    kind: "clear_bundle",
    bundleId,
    createdAt: new Date().toISOString(),
  };
}

export function makeSaveMemberMutation(
  memberId: string,
  bundleId: string,
  input: SaveMemberCheckInput,
): PendingMaterialMutation {
  return {
    id: mutationId(),
    kind: "save_member",
    memberId,
    bundleId,
    input,
    createdAt: new Date().toISOString(),
  };
}

export function makeClearMemberMutation(
  memberId: string,
  bundleId: string,
): PendingMaterialMutation {
  return {
    id: mutationId(),
    kind: "clear_member",
    memberId,
    bundleId,
    createdAt: new Date().toISOString(),
  };
}

export function makeReportMissingMutation(input: Omit<CreateMissingMaterialInput,"clientMutationId">): PendingMaterialMutation {
  const id=mutationId();
  return {id,clientMutationId:id,projectId:input.projectId,targetLocalId:`pending:${id}`,attempts:0,lastError:null,status:"pending",kind:"report_missing",input:{...input,clientMutationId:id},createdAt:new Date().toISOString()};
}

export function makeReceiveMissingMutation(input: RecordMissingReceiptInput, projectId?: string): PendingMaterialMutation {
  const id=input.clientMutationId||mutationId();
  return {id,clientMutationId:id,projectId,targetLocalId:input.issueKey,attempts:0,lastError:null,status:"pending",kind:"receive_missing",input:{...input,projectId,clientMutationId:id},createdAt:new Date().toISOString()};
}

export function makeReceiptEvidenceMutation(input: MaterialReceiptEvidenceInput): PendingMaterialMutation {
  return {id:input.clientEvidenceId,clientMutationId:input.clientEvidenceId,projectId:input.projectId,targetLocalId:input.issueKey,attempts:0,lastError:null,status:"pending",kind:"receipt_evidence",input,createdAt:new Date().toISOString()};
}

export function makeResolveMissingMutation(input: { projectId: string; towerId: string; issueKey: string }): PendingMaterialMutation {
  const id=mutationId();
  return { id,clientMutationId:id,projectId:input.projectId,targetLocalId:input.issueKey,attempts:0,lastError:null,status:"pending",kind:"resolve_missing", input, createdAt: new Date().toISOString() };
}

export function mergeMaterialMutation(
  current: PendingMaterialMutation[],
  next: PendingMaterialMutation,
) {
  if(next.kind==="receive_missing"){
    const existing=current.findIndex(item=>item.kind==="receive_missing"&&item.id===next.id);
    if(existing>=0){const copy=[...current];copy[existing]={...next,createdAt:current[existing].createdAt,attempts:current[existing].attempts||0,lastError:null,status:"pending"};return copy;}
    return [...current,next];
  }
  if(next.kind==="receipt_evidence"){
    if(current.some(item=>item.kind==="receipt_evidence"&&item.id===next.id))return current;
    return [...current,next];
  }
  if(next.kind==="report_missing"||next.kind==="resolve_missing") return [...current,next];
  if (next.kind === "save_bundle" || next.kind === "clear_bundle") {
    const filtered = current.filter((item) => {
      if (
        (item.kind === "save_bundle" || item.kind === "clear_bundle") &&
        item.bundleId === next.bundleId
      ) {
        return false;
      }

      if (
        next.kind === "clear_bundle" &&
        (item.kind === "save_member" || item.kind === "clear_member") &&
        item.bundleId === next.bundleId
      ) {
        return false;
      }

      return true;
    });

    return [...filtered, next];
  }

  const filtered = current.filter(
    (item) =>
      !(
        (item.kind === "save_member" || item.kind === "clear_member") &&
        item.memberId === next.memberId
      ),
  );

  return [...filtered, next];
}
