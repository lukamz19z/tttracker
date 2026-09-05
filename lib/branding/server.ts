import { createClient } from "@supabase/supabase-js";

import { getGraphAccessToken } from "@/lib/sharepoint/graph";

type BrandingRow = {
  company_name: string | null;
  logo_content_type: string | null;
  logo_sharepoint_drive_id: string | null;
  logo_sharepoint_item_id: string | null;
  logo_updated_at: string | null;
};

export type PdfBranding = {
  companyName: string;
  logoDataUrl: string | null;
};

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

function supportedImageType(value: string | null) {
  const type = String(value ?? "").trim().toLowerCase();

  if (type === "image/png") return "image/png";
  if (type === "image/jpeg" || type === "image/jpg") return "image/jpeg";

  return null;
}

export async function loadSystemPdfBranding(): Promise<PdfBranding> {
  const supabase = serviceClient();

  const { data, error } = await supabase
    .from("system_branding")
    .select(
      "company_name,logo_content_type,logo_sharepoint_drive_id,logo_sharepoint_item_id,logo_updated_at",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error(`System branding could not be loaded: ${error.message}`);
  }

  const branding = (data ?? null) as BrandingRow | null;
  const companyName =
    String(branding?.company_name ?? "").trim() || "BC Contracting";

  if (
    !branding?.logo_sharepoint_drive_id ||
    !branding.logo_sharepoint_item_id
  ) {
    return {
      companyName,
      logoDataUrl: null,
    };
  }

  const contentType = supportedImageType(branding.logo_content_type);

  if (!contentType) {
    console.error(
      "TTTracker system branding logo has an unsupported content type:",
      branding.logo_content_type,
    );

    return {
      companyName,
      logoDataUrl: null,
    };
  }

  try {
    const token = await getGraphAccessToken();

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        branding.logo_sharepoint_drive_id,
      )}/items/${encodeURIComponent(
        branding.logo_sharepoint_item_id,
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
        `SharePoint returned ${response.status}${
          detail ? `: ${detail.slice(0, 300)}` : ""
        }`,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length === 0) {
      throw new Error("The configured branding logo is empty.");
    }

    return {
      companyName,
      logoDataUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
    };
  } catch (error) {
    // Branding must not block a contractual docket from being generated.
    console.error("TTTracker PDF branding logo could not be loaded:", error);

    return {
      companyName,
      logoDataUrl: null,
    };
  }
}
