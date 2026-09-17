import { getCache, setCache } from "@/lib/offline/db";
import type {
  SaveBundleCheckInput,
  SaveMemberCheckInput,
} from "@/types/materials";

export type PendingMaterialMutation =
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
    };

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

export function mergeMaterialMutation(
  current: PendingMaterialMutation[],
  next: PendingMaterialMutation,
) {
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
