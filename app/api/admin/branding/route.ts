import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  deleteDriveItem,
  ensureDriveFolder,
  getBCContractingSite,
  getDriveByName,
  graphRequest,
  uploadDriveItemContent,
} from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BrandingRow = {
  id: number;
  company_name: string;
  logo_file_name: string | null;
  logo_content_type: string | null;
  logo_sharepoint_item_id: string | null;
  logo_sharepoint_drive_id: string | null;
  logo_updated_at: string | null;
};

const BRANDING_ID = 1;

const SYSTEM_LIBRARY =
  process.env.SHAREPOINT_SYSTEM_LIBRARY ?? "TTTracker System";

const BRANDING_FOLDER = "Branding";

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

  return {
    supabase,
    user,
  };
}

async function readBranding(
  supabase: ReturnType<typeof serviceClient>,
): Promise<BrandingRow> {
  const { data, error } = await supabase
    .from("system_branding")
    .select(
      [
        "id",
        "company_name",
        "logo_file_name",
        "logo_content_type",
        "logo_sharepoint_item_id",
        "logo_sharepoint_drive_id",
        "logo_updated_at",
      ].join(","),
    )
    .eq("id", BRANDING_ID)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? {
    id: BRANDING_ID,
    company_name: "BC Contracting",
    logo_file_name: null,
    logo_content_type: null,
    logo_sharepoint_item_id: null,
    logo_sharepoint_drive_id: null,
    logo_updated_at: null,
  }) as BrandingRow;
}

function publicBranding(row: BrandingRow) {
  return {
    company_name: row.company_name,
    logo_file_name: row.logo_file_name,
    logo_content_type: row.logo_content_type,
    logo_sharepoint_item_id: row.logo_sharepoint_item_id,
    logo_sharepoint_drive_id: row.logo_sharepoint_drive_id,
    logo_updated_at: row.logo_updated_at,
  };
}

function safeLogoFileName(file: File) {
  const extension = file.type === "image/png" ? "png" : "jpg";

  const base =
    file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "company-logo";

  return `${base}.${extension}`;
}

async function resolveBrandingFolder() {
  const site = await getBCContractingSite();

  const drive = await getDriveByName(
    site.id,
    SYSTEM_LIBRARY,
  );

  const root = await graphRequest<{ id: string }>(
    `/drives/${encodeURIComponent(drive.id)}/root?$select=id`,
  );

  if (!root.id) {
    throw new Error(
      `Could not resolve the root folder for SharePoint library "${SYSTEM_LIBRARY}".`,
    );
  }

  const brandingFolder = await ensureDriveFolder({
    driveId: drive.id,
    parentItemId: root.id,
    name: BRANDING_FOLDER,
  });

  return {
    site,
    drive,
    brandingFolder,
  };
}

async function uploadLogo(file: File) {
  const { drive, brandingFolder } = await resolveBrandingFolder();
  const fileName = safeLogoFileName(file);
  const content = new Uint8Array(await file.arrayBuffer());

  const item = await uploadDriveItemContent({
    driveId: drive.id,
    parentItemId: brandingFolder.id,
    fileName,
    content,
    contentType: file.type,
  });

  return {
    driveId: drive.id,
    itemId: item.id,
    fileName: item.name,
  };
}

async function deleteLogoQuietly({
  driveId,
  itemId,
}: {
  driveId?: string | null;
  itemId?: string | null;
}) {
  if (!driveId || !itemId) {
    return;
  }

  try {
    await deleteDriveItem({
      driveId,
      itemId,
    });
  } catch (error) {
    console.error(
      "Could not delete the previous TTTracker branding logo from SharePoint:",
      error,
    );
  }
}

function logoUrl(row: BrandingRow) {
  return row.logo_sharepoint_drive_id && row.logo_sharepoint_item_id
    ? `/api/admin/branding/logo?v=${encodeURIComponent(
        row.logo_updated_at ?? row.logo_sharepoint_item_id,
      )}`
    : null;
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected error.";

  if (message === "UNAUTHENTICATED") {
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 },
    );
  }

  if (message === "FORBIDDEN") {
    return NextResponse.json(
      { error: "Administrator access is required." },
      { status: 403 },
    );
  }

  console.error("ADMIN BRANDING ERROR:", error);

  return NextResponse.json(
    { error: message },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin(request);
    const branding = await readBranding(supabase);

    return NextResponse.json({
      branding: publicBranding(branding),
      logo_url: logoUrl(branding),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAdmin(request);
    const formData = await request.formData();

    const companyName = String(
      formData.get("company_name") ?? "",
    ).trim();

    if (!companyName) {
      return NextResponse.json(
        { error: "Company name is required." },
        { status: 400 },
      );
    }

    const current = await readBranding(supabase);

    const formLogo = formData.get("logo");
    const file =
      formLogo instanceof File && formLogo.size > 0
        ? formLogo
        : null;

    if (file) {
      if (!["image/png", "image/jpeg"].includes(file.type)) {
        return NextResponse.json(
          { error: "The company logo must be a PNG or JPEG image." },
          { status: 400 },
        );
      }

      if (file.size > 2 * 1024 * 1024) {
        return NextResponse.json(
          { error: "The company logo must be smaller than 2 MB." },
          { status: 400 },
        );
      }
    }

    let uploaded:
      | {
          driveId: string;
          itemId: string;
          fileName: string;
        }
      | null = null;

    if (file) {
      uploaded = await uploadLogo(file);
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("system_branding")
      .upsert(
        {
          id: BRANDING_ID,
          company_name: companyName,
          logo_file_name:
            uploaded?.fileName ?? current.logo_file_name,
          logo_content_type:
            file?.type ?? current.logo_content_type,
          logo_sharepoint_item_id:
            uploaded?.itemId ??
            current.logo_sharepoint_item_id,
          logo_sharepoint_drive_id:
            uploaded?.driveId ??
            current.logo_sharepoint_drive_id,
          logo_updated_at: uploaded
            ? now
            : current.logo_updated_at,
          updated_by: user.id,
          updated_at: now,
        },
        {
          onConflict: "id",
        },
      )
      .select(
        [
          "id",
          "company_name",
          "logo_file_name",
          "logo_content_type",
          "logo_sharepoint_item_id",
          "logo_sharepoint_drive_id",
          "logo_updated_at",
        ].join(","),
      )
      .single();

    if (error) {
      if (uploaded) {
        await deleteLogoQuietly({
          driveId: uploaded.driveId,
          itemId: uploaded.itemId,
        });
      }

      throw new Error(error.message);
    }

    const branding = data as unknown as BrandingRow;

    if (
      uploaded &&
      current.logo_sharepoint_drive_id &&
      current.logo_sharepoint_item_id &&
      (current.logo_sharepoint_drive_id !== uploaded.driveId ||
        current.logo_sharepoint_item_id !== uploaded.itemId)
    ) {
      await deleteLogoQuietly({
        driveId: current.logo_sharepoint_drive_id,
        itemId: current.logo_sharepoint_item_id,
      });
    }

    return NextResponse.json({
      branding: publicBranding(branding),
      logo_url: logoUrl(branding),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireAdmin(request);
    const current = await readBranding(supabase);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("system_branding")
      .upsert(
        {
          id: BRANDING_ID,
          company_name: current.company_name || "BC Contracting",
          logo_file_name: null,
          logo_content_type: null,
          logo_sharepoint_item_id: null,
          logo_sharepoint_drive_id: null,
          logo_updated_at: null,
          updated_by: user.id,
          updated_at: now,
        },
        {
          onConflict: "id",
        },
      )
      .select(
        [
          "id",
          "company_name",
          "logo_file_name",
          "logo_content_type",
          "logo_sharepoint_item_id",
          "logo_sharepoint_drive_id",
          "logo_updated_at",
        ].join(","),
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await deleteLogoQuietly({
      driveId: current.logo_sharepoint_drive_id,
      itemId: current.logo_sharepoint_item_id,
    });

    return NextResponse.json({
      branding: publicBranding(data as unknown as BrandingRow),
      logo_url: null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
