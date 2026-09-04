import { ClientSecretCredential } from "@azure/identity";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function serviceClient() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function graphToken() {
  const credential = new ClientSecretCredential(
    env("AZURE_TENANT_ID"),
    env("AZURE_CLIENT_ID"),
    env("AZURE_CLIENT_SECRET"),
  );

  const result = await credential.getToken(
    "https://graph.microsoft.com/.default",
  );

  if (!result?.token) throw new Error("Could not obtain Graph token.");
  return result.token;
}

export async function GET() {
  try {
    const supabase = serviceClient();

    const { data, error } = await supabase
      .from("system_branding")
      .select(
        "logo_sharepoint_drive_id, logo_sharepoint_item_id, logo_content_type",
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!data?.logo_sharepoint_drive_id || !data.logo_sharepoint_item_id) {
      return new NextResponse(null, { status: 404 });
    }

    const token = await graphToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        data.logo_sharepoint_drive_id,
      )}/items/${encodeURIComponent(data.logo_sharepoint_item_id)}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        redirect: "follow",
      },
    );

    if (!response.ok) {
      throw new Error(`Could not read the logo from SharePoint (${response.status}).`);
    }

    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": data.logo_content_type || "image/png",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load document logo.",
      },
      { status: 500 },
    );
  }
}
