import { NextResponse } from "next/server";

import {
  assetApiError,
  canConfigureAssets,
  canViewAssets,
  clean,
  requireAssetUser,
} from "@/lib/assets/server";
import {
  getBCContractingSite,
  getSiteDrives,
} from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);

    if (!canViewAssets(identity.role)) {
      throw new Error("ASSET_VIEW_FORBIDDEN");
    }

    const { data: settings, error } = await service
      .from("asset_settings")
      .select("*")
      .eq("id", true)
      .single();

    if (error) throw new Error(error.message);

    const url = new URL(request.url);

    if (url.searchParams.get("discover") !== "1") {
      return NextResponse.json({
        settings,
        canConfigure: canConfigureAssets(identity.role),
      });
    }

    if (!canConfigureAssets(identity.role)) {
      throw new Error("ASSET_CONFIG_FORBIDDEN");
    }

    const site = await getBCContractingSite();
    const drives = await getSiteDrives(site.id);

    return NextResponse.json({
      settings,
      site,
      drives: drives.value,
      canConfigure: true,
    });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);

    if (!canConfigureAssets(identity.role)) {
      throw new Error("ASSET_CONFIG_FORBIDDEN");
    }

    const body = (await request.json()) as {
      driveId?: string;
      baseFolder?: string;
      vehicleFolder?: string;
      plantFolder?: string;
      supersededFolder?: string;
      maxFileSizeMb?: number;
      notificationsEnabled?: boolean;
      documentFolders?: Record<string, string>;
    };

    const driveId = clean(body.driveId);

    if (!driveId) {
      return NextResponse.json(
        { error: "Select the SharePoint document library." },
        { status: 400 },
      );
    }

    const site = await getBCContractingSite();
    const drives = await getSiteDrives(site.id);
    const drive = drives.value.find((item) => item.id === driveId);

    if (!drive) {
      return NextResponse.json(
        { error: "The selected SharePoint library could not be found." },
        { status: 400 },
      );
    }

    const documentFolders = {
      compliance: clean(body.documentFolders?.compliance) || "Compliance",
      service: clean(body.documentFolders?.service) || "Service & Repairs",
      invoice: clean(body.documentFolders?.invoice) || "Invoices",
      inspection: clean(body.documentFolders?.inspection) || "Inspections",
      manual: clean(body.documentFolders?.manual) || "Manuals",
      photo: clean(body.documentFolders?.photo) || "Photos",
      other: clean(body.documentFolders?.other) || "Other",
    };

    const maxFileSize = Math.min(
      250,
      Math.max(1, Number(body.maxFileSizeMb ?? 50) || 50),
    );

    const { data: settings, error } = await service
      .from("asset_settings")
      .upsert({
        id: true,
        sharepoint_site_id: site.id,
        sharepoint_site_name: site.displayName ?? "BC Contracting",
        sharepoint_site_url: site.webUrl ?? null,
        sharepoint_drive_id: drive.id,
        sharepoint_drive_name: drive.name,
        sharepoint_base_folder:
          clean(body.baseFolder) || "Assets",
        vehicle_folder_name:
          clean(body.vehicleFolder) || "Vehicles",
        plant_folder_name:
          clean(body.plantFolder) || "Plant",
        superseded_folder_name:
          clean(body.supersededFolder) || "Superseded",
        document_folders: documentFolders,
        max_file_size_mb: maxFileSize,
        notifications_enabled:
          body.notificationsEnabled !== false,
        updated_by: identity.userId,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ settings });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
