import { createClient } from "@supabase/supabase-js";

import { getGraphAccessToken } from "@/lib/sharepoint/graph";

type BrandingRow = {
  company_name: string | null;
  logo_content_type: string | null;
  logo_sharepoint_drive_id: string | null;
  logo_sharepoint_item_id: string | null;
  logo_updated_at: string | null;
  abn: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
};

export type PdfBranding = {
  companyName: string;
  logoDataUrl: string | null;
  abn: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
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

function nullableText(value: unknown) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function brandingWithoutLogo(row: BrandingRow | null): PdfBranding {
  return {
    companyName: nullableText(row?.company_name) ?? "BC Contracting",
    logoDataUrl: null,
    abn: nullableText(row?.abn),
    addressLine1: nullableText(row?.address_line_1),
    addressLine2: nullableText(row?.address_line_2),
    suburb: nullableText(row?.suburb),
    state: nullableText(row?.state),
    postcode: nullableText(row?.postcode),
    phone: nullableText(row?.phone),
    email: nullableText(row?.email),
    website: nullableText(row?.website),
  };
}

export async function loadSystemPdfBranding(): Promise<PdfBranding> {
  const supabase = serviceClient();

  const { data, error } = await supabase
    .from("system_branding")
    .select(
      [
        "company_name",
        "logo_content_type",
        "logo_sharepoint_drive_id",
        "logo_sharepoint_item_id",
        "logo_updated_at",
        "abn",
        "address_line_1",
        "address_line_2",
        "suburb",
        "state",
        "postcode",
        "phone",
        "email",
        "website",
      ].join(","),
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error(`System branding could not be loaded: ${error.message}`);
  }

  const row = (data ?? null) as BrandingRow | null;
  const base = brandingWithoutLogo(row);

  if (
    !row?.logo_sharepoint_drive_id ||
    !row.logo_sharepoint_item_id
  ) {
    return base;
  }

  const contentType = supportedImageType(row.logo_content_type);

  if (!contentType) {
    console.error(
      "TTTracker system branding logo has an unsupported content type:",
      row.logo_content_type,
    );

    return base;
  }

  try {
    const token = await getGraphAccessToken();

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        row.logo_sharepoint_drive_id,
      )}/items/${encodeURIComponent(row.logo_sharepoint_item_id)}/content`,
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
      ...base,
      logoDataUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
    };
  } catch (error) {
    // Branding must not block a contractual docket from being generated.
    console.error("TTTracker PDF branding logo could not be loaded:", error);
    return base;
  }
}
