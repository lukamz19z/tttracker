import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  getBCContractingSite,
  getSiteDrives,
} from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function serviceClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    throw new Error("UNAUTHENTICATED");
  }

  const supabase = serviceClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleError) {
    throw new Error(roleError.message);
  }

  const role = String(roleRow?.role ?? "")
    .trim()
    .toLowerCase();

  if (!["admin", "administrator", "site_admin"].includes(role)) {
    throw new Error("FORBIDDEN");
  }

  return { supabase, user };
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "SharePoint discovery failed.";

  if (message === "UNAUTHENTICATED") {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  if (message === "FORBIDDEN") {
    return NextResponse.json(
      { error: "Administrator access is required." },
      { status: 403 },
    );
  }

  console.error("FINANCE SHAREPOINT DISCOVERY ERROR:", error);

  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const site = await getBCContractingSite();
    const drives = await getSiteDrives(site.id);

    const libraries = [...(drives.value ?? [])]
      .map((drive) => ({
        id: drive.id,
        name: drive.name,
        webUrl: drive.webUrl ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      site: {
        id: site.id,
        name: site.displayName ?? "BC Contracting",
        webUrl: site.webUrl ?? null,
      },
      libraries,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAdmin(request);

    const body = (await request.json()) as {
      driveId?: string;
      baseFolder?: string;
    };

    const driveId = String(body.driveId ?? "").trim();
    const baseFolder =
      String(body.baseFolder ?? "").trim() || "Expenses & Invoices";

    if (!driveId) {
      return NextResponse.json(
        { error: "Select a SharePoint library." },
        { status: 400 },
      );
    }

    const site = await getBCContractingSite();
    const drives = await getSiteDrives(site.id);

    const selectedDrive = (drives.value ?? []).find(
      (drive) => drive.id === driveId,
    );

    if (!selectedDrive) {
      return NextResponse.json(
        { error: "The selected SharePoint library could not be found." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("financial_settings")
      .update({
        sharepoint_site_id: site.id,
        sharepoint_site_name: site.displayName ?? "BC Contracting",
        sharepoint_site_url: site.webUrl ?? null,
        sharepoint_drive_id: selectedDrive.id,
        sharepoint_drive_name: selectedDrive.name,
        sharepoint_base_folder: baseFolder,
        sharepoint_configured_at: now,
        sharepoint_configured_by: user.id,
        updated_by: user.id,
      })
      .eq("id", true)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      settings: data,
      site: {
        id: site.id,
        name: site.displayName ?? "BC Contracting",
        webUrl: site.webUrl ?? null,
      },
      library: {
        id: selectedDrive.id,
        name: selectedDrive.name,
        webUrl: selectedDrive.webUrl ?? null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
