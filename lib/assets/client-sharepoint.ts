"use client";

export type EquipmentFolderType =
  | "lifting_gear"
  | "fall_arrest"
  | "generator"
  | "ladder"
  | "torque_wrench"
  | "inventory_kit";

type SessionClient = {
  auth: {
    getSession: () => Promise<{
      data: { session: { access_token?: string | null } | null };
    }>;
  };
};

export async function syncEquipmentSharePointFolderClient({
  supabase,
  equipmentType,
  equipmentId,
}: {
  supabase: SessionClient;
  equipmentType: EquipmentFolderType;
  equipmentId: string;
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your session has expired. Sign in again.");
  }

  const response = await fetch("/api/assets/sync-folders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ equipmentType, equipmentId }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    equipment?: { folderName?: string; webUrl?: string | null };
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error || "The equipment SharePoint folder could not be synchronised.",
    );
  }

  return payload.equipment ?? null;
}
