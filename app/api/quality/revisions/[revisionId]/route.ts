import { NextResponse } from "next/server";

import { deleteDriveItem } from "@/lib/sharepoint/graph";
import {
  assertQualityProjectAccess,
  qualityApiError,
  requireQualityUser,
} from "@/lib/quality/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ revisionId: string }>;
};

type DeleteBody = {
  confirm?: string;
  projectId?: string;
  towerId?: string;
};

type QualityFileRow = {
  id: string;
  revision_id?: string | null;
  revision_item_id?: string | null;
  file_name?: string | null;

  // Current/expected TTTracker SharePoint metadata names.
  sharepoint_drive_id?: string | null;
  sharepoint_item_id?: string | null;

  // Kept as fallbacks in case an older quality-file row used shorter names.
  drive_id?: string | null;
  item_id?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function sharePointIds(file: QualityFileRow) {
  return {
    driveId: clean(file.sharepoint_drive_id || file.drive_id) || null,
    itemId: clean(file.sharepoint_item_id || file.item_id) || null,
  };
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const { revisionId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);

    if (!clean(revisionId)) {
      return NextResponse.json(
        { error: "Revision ID is required." },
        { status: 400 },
      );
    }

    const { data: revision, error } = await service
      .from("tower_revisions")
      .select("*")
      .eq("id", revisionId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!revision) {
      return NextResponse.json(
        { error: "Revision could not be found." },
        { status: 404 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId: revision.project_id,
    });

    return NextResponse.json({ revision });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  try {
    const { revisionId } = await context.params;
    const { service, user, role } = await requireQualityUser(request);

    if (!clean(revisionId)) {
      return NextResponse.json(
        { error: "Revision ID is required." },
        { status: 400 },
      );
    }

    let body: DeleteBody = {};

    try {
      body = (await request.json()) as DeleteBody;
    } catch {
      return NextResponse.json(
        { error: "A delete confirmation is required." },
        { status: 400 },
      );
    }

    const requestedProjectId = clean(body.projectId);
    const requestedTowerId = clean(body.towerId);
    const confirmation = clean(body.confirm);

    const { data: revision, error: revisionError } = await service
      .from("tower_revisions")
      .select("*")
      .eq("id", revisionId)
      .maybeSingle();

    if (revisionError) throw new Error(revisionError.message);

    if (!revision) {
      return NextResponse.json(
        { error: "Revision could not be found." },
        { status: 404 },
      );
    }

    await assertQualityProjectAccess({
      service,
      userId: user.id,
      role,
      projectId: revision.project_id,
    });

    if (
      requestedProjectId &&
      requestedProjectId !== clean(revision.project_id)
    ) {
      return NextResponse.json(
        { error: "Revision does not belong to this project." },
        { status: 409 },
      );
    }

    if (
      requestedTowerId &&
      requestedTowerId !== clean(revision.tower_id)
    ) {
      return NextResponse.json(
        { error: "Revision does not belong to this tower." },
        { status: 409 },
      );
    }

    const revisionNumber = clean(revision.fli_number);

    if (!revisionNumber) {
      return NextResponse.json(
        { error: "Revision number could not be resolved." },
        { status: 409 },
      );
    }

    if (confirmation !== revisionNumber) {
      return NextResponse.json(
        {
          error: `Type the full Revision number "${revisionNumber}" to confirm deletion.`,
        },
        { status: 400 },
      );
    }

    /*
     * Load every quality file tied to the Revision.
     * This includes:
     * - before photos
     * - after photos
     * - generated Revision PDFs
     */
    const { data: qualityFiles, error: filesError } = await service
      .from("tower_quality_files")
      .select("*")
      .eq("revision_id", revisionId);

    if (filesError) throw new Error(filesError.message);

    const files = (qualityFiles ?? []) as QualityFileRow[];
    const sharePointWarnings: string[] = [];

    /*
     * Remove physical SharePoint files first.
     *
     * A failed SharePoint delete does NOT block deletion of the TTTracker
     * Revision. The caller receives a warning so an orphaned SharePoint
     * file can be cleaned up manually if necessary.
     */
    for (const file of files) {
      const { driveId, itemId } = sharePointIds(file);

      if (!driveId || !itemId) continue;

      try {
        await deleteDriveItem({
          driveId,
          itemId,
        });
      } catch (error) {
        console.error(
          `Revision ${revisionNumber}: SharePoint file could not be deleted`,
          {
            fileId: file.id,
            fileName: file.file_name,
            error,
          },
        );

        sharePointWarnings.push(
          clean(file.file_name) || `quality file ${file.id}`,
        );
      }
    }

    /*
     * The Revision points at its latest generated PDF.
     * Clear that reference before deleting quality-file metadata so this
     * works even when the database FK is not ON DELETE SET NULL.
     */
    const { error: clearLatestPdfError } = await service
      .from("tower_revisions")
      .update({
        latest_pdf_file_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", revisionId);

    if (clearLatestPdfError) {
      throw new Error(clearLatestPdfError.message);
    }

    /*
     * Delete child metadata explicitly rather than relying on CASCADE.
     * Order matters:
     *   quality files -> findings/items -> revision
     */
    const { error: qualityFileDeleteError } = await service
      .from("tower_quality_files")
      .delete()
      .eq("revision_id", revisionId);

    if (qualityFileDeleteError) {
      throw new Error(
        `Revision files could not be removed from TTTracker: ${qualityFileDeleteError.message}`,
      );
    }

    const { error: itemDeleteError } = await service
      .from("tower_revision_items")
      .delete()
      .eq("revision_id", revisionId);

    if (itemDeleteError) {
      throw new Error(
        `Revision findings could not be removed: ${itemDeleteError.message}`,
      );
    }

    const { error: deleteError } = await service
      .from("tower_revisions")
      .delete()
      .eq("id", revisionId)
      .eq("project_id", revision.project_id)
      .eq("tower_id", revision.tower_id);

    if (deleteError) {
      throw new Error(`Revision could not be deleted: ${deleteError.message}`);
    }

    const warning =
      sharePointWarnings.length > 0
        ? `The Revision was deleted from TTTracker, but ${sharePointWarnings.length} SharePoint file${
            sharePointWarnings.length === 1 ? "" : "s"
          } could not be removed: ${sharePointWarnings.join(", ")}.`
        : null;

    return NextResponse.json({
      success: true,
      revisionId,
      revisionNumber,
      warning,
    });
  } catch (error) {
    const apiError = qualityApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
