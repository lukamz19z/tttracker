import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  roleCanManageTraining,
  trainingApiError,
} from "@/lib/training/server";
import {
  getBCContractingSite,
  getSiteDrives,
} from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    });
  } catch (error) {
    const apiError = trainingApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
