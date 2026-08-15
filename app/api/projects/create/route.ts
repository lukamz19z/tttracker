import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import {
  deleteProjectSharePointFolders,
  renameProjectSharePointFolders,
} from "@/lib/sharepoint/projects";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

type UpdateProjectBody = {
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

function sanitiseSharePointName(value: string) {
  return value
    .replace(/["*:<>?/\\|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
}

function buildUpdatedSharePointUrl(
  currentUrl: string | null | undefined,
  projectNumber: string,
  projectName: string,
) {
  if (!currentUrl) return null;

  try {
    const url = new URL(currentUrl);
    const cleanFolderName = sanitiseSharePointName(
      `${projectNumber} ${projectName}`,
    );

    const segments = url.pathname.split("/");
    segments[segments.length - 1] = encodeURIComponent(cleanFolderName);

    url.pathname = segments.join("/");
    return url.toString();
  } catch {
    return currentUrl;
  }
}

async function createRouteSupabase() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignore cookie writes in server contexts where unavailable.
          }
        },
      },
    },
  );
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const { projectId } = await context.params;

  try {
    const supabase = await createRouteSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as UpdateProjectBody;

    const name = body.name?.trim() ?? "";
    const client = body.client?.trim() ?? "";
    const clientCode = body.clientCode?.trim().toUpperCase() ?? "";
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

    if (!name) {
      return NextResponse.json(
        { error: "Project name is required." },
        { status: 400 },
      );
    }

    if (!clientCode) {
      return NextResponse.json(
        { error: "Client code is required." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(projectYear) ||
      projectYear < 2000 ||
      projectYear > 2100
    ) {
      return NextResponse.json(
        { error: "A valid project year is required." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(projectSequence) ||
      projectSequence < 1
    ) {
      return NextResponse.json(
        { error: "A valid project sequence is required." },
        { status: 400 },
      );
    }

    if (
      totalTowers !== null &&
      (!Number.isFinite(totalTowers) || totalTowers < 0)
    ) {
      return NextResponse.json(
        { error: "Total towers must be a valid number." },
        { status: 400 },
      );
    }

    const {
      data: currentProject,
      error: currentProjectError,
    } = await supabase
      .from("projects")
      .select(`
        id,
        name,
        project_number,
        sharepoint_drive_id,
        sharepoint_folder_id,
        sharepoint_tender_drive_id,
        sharepoint_tender_folder_id,
        sharepoint_url,
        sharepoint_tender_url
      `)
      .eq("id", projectId)
      .single();

    if (currentProjectError || !currentProject) {
      return NextResponse.json(
        { error: "Project could not be found." },
        { status: 404 },
      );
    }

    const projectNumber = buildProjectNumber(
      clientCode,
      projectYear,
      projectSequence,
    );

    const folderNameChanged =
      currentProject.name !== name ||
      currentProject.project_number !== projectNumber;

    let deliveryUrl =
      (currentProject.sharepoint_url as string | null) ?? null;

    let tenderingUrl =
      (currentProject.sharepoint_tender_url as string | null) ?? null;

    let renamedSharePoint = false;

    if (
      folderNameChanged &&
      currentProject.sharepoint_drive_id &&
      currentProject.sharepoint_folder_id
    ) {
      await renameProjectSharePointFolders({
        deliveryDriveId: currentProject.sharepoint_drive_id,
        deliveryFolderId: currentProject.sharepoint_folder_id,
        tenderingDriveId: currentProject.sharepoint_tender_drive_id,
        tenderingFolderId: currentProject.sharepoint_tender_folder_id,
        projectNumber,
        projectName: name,
      });

      deliveryUrl = buildUpdatedSharePointUrl(
        deliveryUrl,
        projectNumber,
        name,
      );

      tenderingUrl = buildUpdatedSharePointUrl(
        tenderingUrl,
        projectNumber,
        name,
      );

      renamedSharePoint = true;
    }

    const updatePayload = {
      name,
      client,
      client_code: clientCode,
      project_year: projectYear,
      project_sequence: projectSequence,
      project_number: projectNumber,
      location,
      status,
      total_towers: totalTowers,
      sharepoint_url: deliveryUrl,
      sharepoint_tender_url: tenderingUrl,
      ...(renamedSharePoint
        ? { sharepoint_synced_at: new Date().toISOString() }
        : {}),
    };

    const { data: updatedProject, error: updateError } =
      await supabase
        .from("projects")
        .update(updatePayload)
        .eq("id", projectId)
        .select(`
          id,
          name,
          status,
          client,
          client_code,
          project_year,
          project_sequence,
          project_number,
          location,
          total_towers,
          sharepoint_url,
          sharepoint_tender_url
        `)
        .single();

    if (updateError || !updatedProject) {
      if (
        renamedSharePoint &&
        currentProject.sharepoint_drive_id &&
        currentProject.sharepoint_folder_id &&
        currentProject.project_number &&
        currentProject.name
      ) {
        try {
          await renameProjectSharePointFolders({
            deliveryDriveId: currentProject.sharepoint_drive_id,
            deliveryFolderId: currentProject.sharepoint_folder_id,
            tenderingDriveId: currentProject.sharepoint_tender_drive_id,
            tenderingFolderId: currentProject.sharepoint_tender_folder_id,
            projectNumber: currentProject.project_number,
            projectName: currentProject.name,
          });
        } catch (rollbackError) {
          console.error("PROJECT RENAME ROLLBACK ERROR:", rollbackError);
        }
      }

      throw new Error(
        updateError?.message ?? "Could not update project.",
      );
    }

    return NextResponse.json({
      success: true,
      project: updatedProject,
    });
  } catch (error) {
    console.error("UPDATE PROJECT ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update project.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  const { projectId } = await context.params;

  try {
    const supabase = await createRouteSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      );
    }

    const { data: project, error: projectError } =
      await supabase
        .from("projects")
        .select(`
          id,
          sharepoint_drive_id,
          sharepoint_folder_id,
          sharepoint_tender_drive_id,
          sharepoint_tender_folder_id
        `)
        .eq("id", projectId)
        .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project could not be found." },
        { status: 404 },
      );
    }

    await deleteProjectSharePointFolders({
      deliveryDriveId: project.sharepoint_drive_id,
      deliveryFolderId: project.sharepoint_folder_id,
      tenderingDriveId: project.sharepoint_tender_drive_id,
      tenderingFolderId: project.sharepoint_tender_folder_id,
    });

    const { error: accessDeleteError } = await supabase
      .from("project_access")
      .delete()
      .eq("project_id", projectId);

    if (accessDeleteError) {
      throw new Error(accessDeleteError.message);
    }

    const { error: projectDeleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (projectDeleteError) {
      throw new Error(projectDeleteError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE PROJECT ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete project.",
      },
      { status: 500 },
    );
  }
}