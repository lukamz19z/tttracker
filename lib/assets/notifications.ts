import {
  clean,
  type AssetIdentity,
  type AssetServiceClient,
} from "@/lib/assets/server";
import type { AssetType } from "@/lib/assets/types";

type AssetNotificationInput = {
  eventType:
    | "asset_document_uploaded"
    | "asset_service_completed"
    | "asset_finance_linked"
    | "asset_updated";
  title: string;
  message: string;
  assetType: AssetType;
  assetId: string;
  actionRoute: string;
  actionParams?: Record<string, unknown>;
  severity?: "info" | "success" | "warning" | "error";
  actor?: AssetIdentity | null;
};

async function assetManagerRecipients(
  service: AssetServiceClient,
) {
  const [websiteResult, mobileResult] = await Promise.all([
    service
      .from("user_roles")
      .select("user_id,role")
      .in("role", ["asset_manager", "assets", "mechanic"]),
    service
      .from("user_mobile_roles")
      .select("user_id,role")
      .in("role", ["asset_manager", "assets", "mechanic"]),
  ]);

  if (websiteResult.error) throw new Error(websiteResult.error.message);
  if (mobileResult.error) throw new Error(mobileResult.error.message);

  return Array.from(
    new Set(
      [...(websiteResult.data ?? []), ...(mobileResult.data ?? [])]
        .map((row) => clean(row.user_id))
        .filter(Boolean),
    ),
  );
}

export async function notifyAssetManagers({
  service,
  input,
}: {
  service: AssetServiceClient;
  input: AssetNotificationInput;
}) {
  const { data: settings, error: settingsError } = await service
    .from("asset_settings")
    .select("notifications_enabled")
    .eq("id", true)
    .single();

  if (settingsError) throw new Error(settingsError.message);
  if (settings.notifications_enabled === false) return 0;

  const recipients = await assetManagerRecipients(service);
  const actorId = clean(input.actor?.userId);

  const rows = recipients
    .filter((userId) => userId !== actorId)
    .map((userId) => ({
      user_id: userId,
      event_type: input.eventType,
      title: input.title,
      message: input.message,
      severity: input.severity ?? "info",
      read_at: null,
      archived_at: null,
      asset_type:
        input.assetType === "vehicle" ? "Vehicle" : "Plant",
      asset_id: input.assetId,
      action_route: input.actionRoute,
      action_params: {
        asset_type: input.assetType,
        asset_id: input.assetId,
        ...(input.actionParams ?? {}),
      },
      created_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return 0;

  const { error } = await service
    .from("user_notifications")
    .insert(rows);

  if (error) {
    console.error("Asset notification insert failed", error);
    return 0;
  }

  return rows.length;
}
