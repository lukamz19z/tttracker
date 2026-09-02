import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { generateDailyDocketPdf } from "@/lib/dockets/daily-docket-pdf";
import { publishDailyDocketPdfToSharePoint } from "@/lib/sharepoint/daily-dockets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    docketId: string;
  }>;
};

async function createRouteSupabase() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
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
          // Cookie writes can be unavailable in some server contexts.
        }
      },
    },
  });
}

export async function POST(_request: Request, context: RouteContext) {
  const { docketId } = await context.params;

  try {
    const supabase = await createRouteSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to publish a Daily Docket." },
        { status: 401 },
      );
    }

    const { data: docket, error: docketError } = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("id", docketId)
      .single();

    if (docketError || !docket) {
      return NextResponse.json(
        { error: "Daily Docket could not be found." },
        { status: 404 },
      );
    }

    const { data: projectAccess, error: accessError } = await supabase
      .from("project_access")
      .select("project_id")
      .eq("project_id", docket.project_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (accessError || !projectAccess) {
      return NextResponse.json(
        { error: "You do not have access to this project." },
        { status: 403 },
      );
    }

    if (!docket.bc_rep_name?.trim()) {
      return NextResponse.json(
        { error: "The Daily Docket must be BC signed before it can be published." },
        { status: 409 },
      );
    }

    const [
      projectResult,
      towerResult,
      labourResult,
      plantResult,
      delayResult,
      progressResult,
      materialEventResult,
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id,name,project_number,client,sharepoint_site_id,sharepoint_drive_id,sharepoint_folder_id")
        .eq("id", docket.project_id)
        .single(),
      supabase.from("towers").select("*").eq("id", docket.tower_id).single(),
      supabase.from("tower_docket_labour").select("*").eq("docket_id", docketId).order("worker_name"),
      supabase.from("tower_docket_plant").select("*").eq("docket_id", docketId),
      supabase.from("tower_docket_delays").select("*").eq("docket_id", docketId).order("created_at"),
      supabase.from("tower_docket_progress").select("*").eq("docket_id", docketId),
      supabase
        .from("tower_material_events")
        .select(`
          *,
          tower_material_event_items(*),
          tower_material_event_people(*),
          tower_material_event_plant(*)
        `)
        .eq("docket_id", docketId)
        .order("occurred_at"),
    ]);

    if (projectResult.error || !projectResult.data) {
      throw new Error(projectResult.error?.message ?? "Project could not be loaded.");
    }

    if (towerResult.error || !towerResult.data) {
      throw new Error(towerResult.error?.message ?? "Tower could not be loaded.");
    }

    const childError =
      labourResult.error ||
      plantResult.error ||
      delayResult.error ||
      progressResult.error ||
      materialEventResult.error;

    if (childError) {
      throw new Error(`Daily Docket details could not be loaded: ${childError.message}`);
    }

    const project = projectResult.data;
    const tower = towerResult.data;

    if (!project.sharepoint_drive_id || !project.sharepoint_folder_id) {
      throw new Error("This project is not linked to its Project Delivery SharePoint folder.");
    }

    const towerName = String(
      tower.name || tower.tower_number || tower.structure_number || "",
    ).trim();

    if (!towerName) {
      throw new Error("The tower does not have a usable name for its SharePoint folder.");
    }

    const docketDate = String(docket.docket_date ?? "").slice(0, 10);

    if (!docketDate) {
      throw new Error("The Daily Docket does not have a docket date.");
    }

    await supabase
      .from("tower_daily_dockets")
      .update({
        sharepoint_sync_status: "publishing",
        sharepoint_sync_error: null,
      })
      .eq("id", docketId);

    const pdf = generateDailyDocketPdf({
      project,
      tower,
      docket,
      labour: labourResult.data ?? [],
      plant: plantResult.data ?? [],
      delays: delayResult.data ?? [],
      progress: progressResult.data ?? [],
      materialEvents: materialEventResult.data ?? [],
    });

    const published = await publishDailyDocketPdfToSharePoint({
      driveId: project.sharepoint_drive_id,
      projectFolderId: project.sharepoint_folder_id,
      towerName,
      docketDate,
      pdf,
    });

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("tower_daily_dockets")
      .update({
        pdf_file_name: published.fileName,
        pdf_generated_at: now,
        sharepoint_site_id: project.sharepoint_site_id ?? null,
        sharepoint_drive_id: project.sharepoint_drive_id,
        sharepoint_folder_id: published.folder.id,
        sharepoint_item_id: published.item.id,
        sharepoint_web_url: published.item.webUrl ?? null,
        docket_file_url: published.item.webUrl ?? docket.docket_file_url ?? null,
        sharepoint_synced_at: now,
        sharepoint_sync_status: "published",
        sharepoint_sync_error: null,
      })
      .eq("id", docketId);

    if (updateError) {
      throw new Error(
        `The PDF was uploaded to SharePoint, but TTTracker could not save the SharePoint reference: ${updateError.message}`,
      );
    }

    return NextResponse.json({
      success: true,
      docketId,
      fileName: published.fileName,
      sharePoint: {
        driveId: project.sharepoint_drive_id,
        folderId: published.folder.id,
        itemId: published.item.id,
        webUrl: published.item.webUrl ?? null,
      },
    });
  } catch (error) {
    console.error("DAILY DOCKET SHAREPOINT PUBLISH ERROR:", error);

    try {
      const supabase = await createRouteSupabase();
      await supabase
        .from("tower_daily_dockets")
        .update({
          sharepoint_sync_status: "failed",
          sharepoint_sync_error:
            error instanceof Error
              ? error.message
              : "Unknown SharePoint publishing error.",
        })
        .eq("id", docketId);
    } catch (statusError) {
      console.error("DAILY DOCKET SHAREPOINT STATUS ERROR:", statusError);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Daily Docket could not be published to SharePoint.",
      },
      { status: 500 },
    );
  }
}