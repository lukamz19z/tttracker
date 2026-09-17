import { NextRequest, NextResponse } from "next/server";

import { GENERATED_ACCESS_PAGES } from "@/lib/access/generated-pages";
import { requireAccessAdmin, type AccessService } from "@/lib/access/server";
import {
  getBCContractingSite,
  getSiteDrives,
  graphRequest,
} from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GroupRow = { id: string; code: string; name: string };
type DriveList = {
  value?: Array<{ id: string; name: string; webUrl?: string }>;
};
type DriveItemList = {
  value?: Array<{
    id: string;
    name: string;
    webUrl?: string;
    folder?: unknown;
  }>;
};

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function ensureGroup(
  service: AccessService,
  code: string,
  name: string,
  sortOrder: number,
): Promise<GroupRow> {
  const { data, error } = await service
    .from("access_groups")
    .upsert(
      {
        code,
        name,
        description: `Automatically discovered ${name} access areas.`,
        sort_order: sortOrder,
        is_active: true,
      },
      { onConflict: "code" },
    )
    .select("id,code,name")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? `Could not create access group ${name}.`);
  }
  return data as GroupRow;
}

export async function POST(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);

    let pagesCreated = 0;
    let pagesUpdated = 0;
    let librariesCreated = 0;
    let librariesUpdated = 0;
    let foldersCreated = 0;
    let foldersUpdated = 0;

    const existingResult = await service.from("access_areas").select("id,code");
    if (existingResult.error) throw new Error(existingResult.error.message);

    const existingRows = (existingResult.data ?? []) as Array<{
      code: string | null;
    }>;
    const existingCodes = new Set(
      existingRows.map((row) => String(row.code ?? "")),
    );
    const groupCache = new Map<string, GroupRow>();
    let groupSort = 100;

    for (const page of GENERATED_ACCESS_PAGES) {
      const groupName = page.group || "General";
      const groupCode = `tt_${slug(groupName)}`;
      let group = groupCache.get(groupCode);
      if (!group) {
        group = await ensureGroup(
          service,
          groupCode,
          `TTTracker · ${groupName}`,
          groupSort,
        );
        groupSort += 10;
        groupCache.set(groupCode, group);
      }

      const existed = existingCodes.has(page.code);
      const { error } = await service.from("access_areas").upsert(
        {
          group_id: group.id,
          category: `TTTracker · ${groupName}`,
          code: page.code,
          name: page.name,
          description: `Access to TTTracker page ${page.route}.`,
          type: "tttracker",
          permission_level: "access",
          route: page.route,
          source: "auto_page",
          source_identifier: page.sourceIdentifier,
          discovered_at: new Date().toISOString(),
          sort_order: 100,
          is_active: true,
        },
        { onConflict: "code" },
      );
      if (error) throw new Error(error.message);
      existed ? pagesUpdated++ : pagesCreated++;
      existingCodes.add(page.code);
    }

    const sharePointGroup = await ensureGroup(
      service,
      "sharepoint",
      "SharePoint",
      1000,
    );
    const site = await getBCContractingSite();
    const drives = (await getSiteDrives(site.id)) as DriveList;
    let librarySort = 10;

    for (const drive of drives.value ?? []) {
      const libraryCode = `sp.library.${slug(drive.name)}`;
      const libraryExisted = existingCodes.has(libraryCode);
      const { error: libraryError } = await service.from("access_areas").upsert(
        {
          group_id: sharePointGroup.id,
          category: "SharePoint",
          code: libraryCode,
          name: drive.name,
          description: `Access to SharePoint library ${drive.name}.`,
          type: "sharepoint",
          permission_level: "access",
          sharepoint_library: drive.name,
          source: "sharepoint_library",
          source_identifier: drive.id,
          discovered_at: new Date().toISOString(),
          sort_order: librarySort,
          is_active: true,
        },
        { onConflict: "code" },
      );
      if (libraryError) throw new Error(libraryError.message);
      libraryExisted ? librariesUpdated++ : librariesCreated++;
      existingCodes.add(libraryCode);
      librarySort += 10;

      const children = await graphRequest<DriveItemList>(
        `/drives/${encodeURIComponent(drive.id)}/root/children?$select=id,name,webUrl,folder`,
      );
      let folderSort = 100;

      for (const item of children.value ?? []) {
        if (!item.folder) continue;
        const folderCode = `sp.folder.${slug(drive.name)}.${slug(item.name)}`;
        const folderExisted = existingCodes.has(folderCode);
        const { error: folderError } = await service.from("access_areas").upsert(
          {
            group_id: sharePointGroup.id,
            category: `SharePoint · ${drive.name}`,
            code: folderCode,
            name: `${drive.name} / ${item.name}`,
            description: `Access to top-level SharePoint folder ${item.name} in ${drive.name}.`,
            type: "sharepoint",
            permission_level: "access",
            sharepoint_library: drive.name,
            source: "sharepoint_folder",
            source_identifier: `${drive.id}:${item.id}`,
            discovered_at: new Date().toISOString(),
            sort_order: folderSort,
            is_active: true,
          },
          { onConflict: "code" },
        );
        if (folderError) throw new Error(folderError.message);
        folderExisted ? foldersUpdated++ : foldersCreated++;
        existingCodes.add(folderCode);
        folderSort += 10;
      }
    }

    return NextResponse.json({
      success: true,
      discovered: {
        tttrackerPages: GENERATED_ACCESS_PAGES.length,
        sharepointLibraries: drives.value?.length ?? 0,
      },
      created: {
        pages: pagesCreated,
        libraries: librariesCreated,
        folders: foldersCreated,
      },
      updated: {
        pages: pagesUpdated,
        libraries: librariesUpdated,
        folders: foldersUpdated,
      },
    });
  } catch (error) {
    console.error("ACCESS DISCOVERY ERROR:", error);
    const message =
      error instanceof Error ? error.message : "Could not discover access areas.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
