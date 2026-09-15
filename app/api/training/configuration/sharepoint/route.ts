import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  roleCanManageTraining,
  trainingApiError,
} from "@/lib/training/server";
import {
  getBCContractingSite,
  getSiteDrives,
  graphRequest,
} from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharePointColumn = {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  hidden?: boolean;
  readOnly?: boolean;
};

type SharePointColumnList = {
  value: SharePointColumn[];
};

export async function GET(request: Request) {
  try {
    const { identity } = await requireTrainingUser(request);

    if (!roleCanManageTraining(identity.role)) {
      return NextResponse.json(
        { error: "Administrator or HSEQ access is required." },
        { status: 403 },
      );
    }

    const site = await getBCContractingSite();
    const drives = await getSiteDrives(site.id);

    const url = new URL(request.url);
    const requestedDriveId = String(
      url.searchParams.get("driveId") ?? "",
    ).trim();

    let columns: Array<{
      id: string;
      name: string;
      displayName: string;
      description: string | null;
      hidden: boolean;
      readOnly: boolean;
    }> = [];
    let columnError: string | null = null;

    if (requestedDriveId) {
      try {
        const result = await graphRequest<SharePointColumnList>(
          `/drives/${encodeURIComponent(
            requestedDriveId,
          )}/list/columns?$select=id,name,displayName,description,hidden,readOnly`,
        );

        columns = (result.value ?? [])
          .map((column) => ({
            id: column.id,
            name: column.name,
            displayName:
              column.displayName || column.name,
            description: column.description ?? null,
            hidden: column.hidden === true,
            readOnly: column.readOnly === true,
          }))
          .filter(
            (column) =>
              !column.hidden &&
              !column.readOnly &&
              Boolean(column.name),
          )
          .sort((a, b) =>
            a.displayName.localeCompare(b.displayName),
          );
      } catch (error) {
        columnError =
          error instanceof Error
            ? error.message
            : "Unable to load SharePoint columns.";
      }
    }

    return NextResponse.json({
      site: {
        id: site.id,
        name: site.displayName ?? "BC Contracting",
        webUrl: site.webUrl ?? null,
      },
      drives: (drives.value ?? [])
        .map((drive) => ({
          id: drive.id,
          name: drive.name,
          webUrl: drive.webUrl ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      columns,
      columnError,
    });
  } catch (error) {
    const apiError = trainingApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
