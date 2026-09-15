import { NextResponse } from "next/server";

import {
  assertQualityProjectAccess,
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";
import { getGraphAccessToken } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

function safeHeaderFileName(value: string) {
  return value.replace(/[\r\n"]/g, "_");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { fileId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);

    const { data: file, error } = await service
      .from("tower_quality_files")
      .select(
        "id,project_id,file_name,mime_type,sharepoint_drive_id,sharepoint_item_id",
      )
      .eq("id", fileId)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: "Quality file could not be found." }, { status: 404 });
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId: file.project_id,
    });

    const token = await getGraphAccessToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(file.sharepoint_drive_id)}/items/${encodeURIComponent(file.sharepoint_item_id)}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        redirect: "follow",
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `SharePoint quality file could not be loaded (${response.status}): ${body}`,
      );
    }

    const bytes = await response.arrayBuffer();
    const contentType =
      response.headers.get("content-type") || file.mime_type || "application/octet-stream";

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeHeaderFileName(file.file_name)}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("QUALITY FILE CONTENT ERROR", error);
    const apiError = qualityApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
