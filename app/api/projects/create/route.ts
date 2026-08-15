import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import {
  createProjectSharePointStructure,
  deleteProjectSharePointFolders,
} from "@/lib/sharepoint/projects";

export const runtime = "nodejs";

type CreateProjectBody = {
  name?: string;
  client?: string;
  clientCode?: string;
  projectYear?: number | string;
  projectSequence?: number | string;
  location?: string;
  status?: string;
  totalTowers?: number | string | null;
};

function buildProjectNumber(
  clientCode: string,
  year: number,
  sequence: number,
) {
  const cleanClient = clientCode.trim().toUpperCase();
  const cleanYear = String(year).slice(-2);
  const cleanSequence = String(sequence).padStart(3, "0");

  return `P-${cleanClient}-${cleanYear}-${cleanSequence}`;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      {
        error: "Supabase server configuration is missing.",
      },
      {
        status: 500,
      },
    );
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options,
                );
              },
            );
          } catch {
            // Cookie writes are not always available
            // in every server execution context.
          }
        },
      },
    },
  );

  let createdProjectId: string | null = null;

  let createdDeliveryDriveId: string | null = null;
  let createdDeliveryFolderId: string | null = null;

  let createdTenderDriveId: string | null = null;
  let createdTenderFolderId: string | null = null;

  try {
    // --------------------------------------------------
    // 1. Confirm logged-in TTTracker user
    // --------------------------------------------------

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "You must be logged in to create a project.",
        },
        {
          status: 401,
        },
      );
    }

    // --------------------------------------------------
    // 2. Read request body
    // --------------------------------------------------

    const body = (await request.json()) as CreateProjectBody;

    const name = body.name?.trim() ?? "";
    const client = body.client?.trim() ?? "";
    const clientCode =
      body.clientCode?.trim().toUpperCase() ?? "";
    const location = body.location?.trim() ?? "";
    const status = body.status?.trim() || "ongoing";

    const projectYear = Number(body.projectYear);
    const projectSequence = Number(body.projectSequence);

    const totalTowers =
      body.totalTowers === "" ||
      body.totalTowers === null ||
      body.totalTowers === undefined
        ? null
        : Number(body.totalTowers);

    // --------------------------------------------------
    // 3. Validate
    // --------------------------------------------------

    if (!name) {
      return NextResponse.json(
        {
          error: "Project name is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!clientCode) {
      return NextResponse.json(
        {
          error: "Client code is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !Number.isInteger(projectYear) ||
      projectYear < 2000 ||
      projectYear > 2100
    ) {
      return NextResponse.json(
        {
          error: "A valid project year is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !Number.isInteger(projectSequence) ||
      projectSequence < 1
    ) {
      return NextResponse.json(
        {
          error: "A valid project sequence is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      totalTowers !== null &&
      (
        !Number.isFinite(totalTowers) ||
        totalTowers < 0
      )
    ) {
      return NextResponse.json(
        {
          error: "Total towers must be a valid number.",
        },
        {
          status: 400,
        },
      );
    }

    const projectNumber = buildProjectNumber(
      clientCode,
      projectYear,
      projectSequence,
    );

    // --------------------------------------------------
    // 4. Create project in Supabase
    // --------------------------------------------------

    const {
      data: project,
      error: projectError,
    } = await supabase
      .from("projects")
      .insert({
        name,
        client,
        client_code: clientCode,
        project_year: projectYear,
        project_sequence: projectSequence,
        project_number: projectNumber,
        location,
        status,
        total_towers: totalTowers,
      })
      .select()
      .single();

    if (projectError || !project) {
      throw new Error(
        projectError?.message ??
          "Could not create project.",
      );
    }

    createdProjectId = project.id;

    // --------------------------------------------------
    // 5. Give creator access to project
    // --------------------------------------------------

    const {
      error: accessError,
    } = await supabase
      .from("project_access")
      .insert({
        user_id: user.id,
        project_id: project.id,
      });

    if (accessError) {
      throw new Error(
        `Project access could not be created: ${accessError.message}`,
      );
    }

    // --------------------------------------------------
    // 6. Create SharePoint Project Delivery
    //    + Tendering structures
    // --------------------------------------------------

    const sharePoint =
      await createProjectSharePointStructure({
        projectNumber,
        projectName: name,
      });

    createdDeliveryDriveId =
      sharePoint.delivery.driveId;

    createdDeliveryFolderId =
      sharePoint.delivery.folderId;

    createdTenderDriveId =
      sharePoint.tendering.driveId;

    createdTenderFolderId =
      sharePoint.tendering.folderId;

    // --------------------------------------------------
    // 7. Save SharePoint references in Supabase
    // --------------------------------------------------

    const {
      error: updateError,
    } = await supabase
      .from("projects")
      .update({
        sharepoint_site_id:
          sharePoint.siteId,

        sharepoint_drive_id:
          sharePoint.delivery.driveId,

        sharepoint_folder_id:
          sharePoint.delivery.folderId,

        sharepoint_url:
          sharePoint.delivery.url,

        sharepoint_tender_drive_id:
          sharePoint.tendering.driveId,

        sharepoint_tender_folder_id:
          sharePoint.tendering.folderId,

        sharepoint_tender_url:
          sharePoint.tendering.url,

        sharepoint_synced_at:
          new Date().toISOString(),
      })
      .eq("id", project.id);

    if (updateError) {
      throw new Error(
        `SharePoint was created but could not be linked to TTTracker: ${updateError.message}`,
      );
    }

    // --------------------------------------------------
    // 8. Success
    // --------------------------------------------------

    return NextResponse.json(
      {
        success: true,

        projectId: project.id,

        projectNumber,

        sharePoint: {
          siteId: sharePoint.siteId,

          delivery: {
            driveId:
              sharePoint.delivery.driveId,

            folderId:
              sharePoint.delivery.folderId,

            folderName:
              sharePoint.delivery.folderName,

            url:
              sharePoint.delivery.url,
          },

          tendering: {
            driveId:
              sharePoint.tendering.driveId,

            folderId:
              sharePoint.tendering.folderId,

            folderName:
              sharePoint.tendering.folderName,

            url:
              sharePoint.tendering.url,
          },
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "PROJECT CREATION ERROR:",
      error,
    );

    // --------------------------------------------------
    // Best-effort SharePoint rollback
    // --------------------------------------------------

    if (
      (
        createdDeliveryDriveId &&
        createdDeliveryFolderId
      ) ||
      (
        createdTenderDriveId &&
        createdTenderFolderId
      )
    ) {
      try {
        await deleteProjectSharePointFolders({
          deliveryDriveId:
            createdDeliveryDriveId,

          deliveryFolderId:
            createdDeliveryFolderId,

          tenderingDriveId:
            createdTenderDriveId,

          tenderingFolderId:
            createdTenderFolderId,
        });
      } catch (sharePointRollbackError) {
        console.error(
          "SHAREPOINT ROLLBACK ERROR:",
          sharePointRollbackError,
        );
      }
    }

    // --------------------------------------------------
    // Best-effort Supabase rollback
    // --------------------------------------------------

    if (createdProjectId) {
      try {
        await supabase
          .from("project_access")
          .delete()
          .eq(
            "project_id",
            createdProjectId,
          );

        await supabase
          .from("projects")
          .delete()
          .eq(
            "id",
            createdProjectId,
          );
      } catch (supabaseRollbackError) {
        console.error(
          "SUPABASE ROLLBACK ERROR:",
          supabaseRollbackError,
        );
      }
    }

    // --------------------------------------------------
    // Return useful error to client
    // --------------------------------------------------

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while creating the project.",
      },
      {
        status: 500,
      },
    );
  }
}