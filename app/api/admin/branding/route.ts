import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getGraphAccessToken } from "@/lib/sharepoint/graph";

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

export async function GET() {
  try {
    const supabase = serviceClient();

    const { data, error } = await supabase
      .from("system_branding")
      .select(
        "logo_sharepoint_drive_id, logo_sharepoint_item_id, logo_content_type, logo_updated_at",
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (
      !data?.logo_sharepoint_drive_id ||
      !data.logo_sharepoint_item_id
    ) {
      return new NextResponse(null, {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    const token = await getGraphAccessToken();

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        data.logo_sharepoint_drive_id,
      )}/items/${encodeURIComponent(
        data.logo_sharepoint_item_id,
      )}/content`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        redirect: "follow",
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      throw new Error(
        `Could not read the company logo from SharePoint (${response.status})${
          detail ? `: ${detail.slice(0, 500)}` : ""
        }`,
      );
    }

    const bytes = await response.arrayBuffer();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": data.logo_content_type || "image/png",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("ADMIN BRANDING LOGO ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load the company logo.",
      },
      { status: 500 },
    );
  }
}
