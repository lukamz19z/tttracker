import type {
  AssetDocumentTypeRow,
  AssetRecord,
  AssetType,
} from "@/lib/assets/types";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function compactCode(value: unknown, fallback = "NA") {
  const compact = clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return compact || fallback;
}

export function assetNamingCode(
  assetType: AssetType,
  asset: AssetRecord,
) {
  return compactCode(
    assetType === "vehicle" ? asset.vehicle_id : asset.asset_id,
    "ASSET",
  );
}

export function assetNamingRego(
  assetType: AssetType,
  asset: AssetRecord,
) {
  return compactCode(
    assetType === "vehicle" ? asset.vehicle_rego : asset.rego,
    "NOREGO",
  );
}

export function formatAssetControlledDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}.${month}.${year.slice(-2)}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  return [
    String(parsed.getDate()).padStart(2, "0"),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getFullYear()).slice(-2),
  ].join(".");
}

export function extensionFromFileName(fileName: string) {
  const match = clean(fileName).match(/(\.[A-Za-z0-9]{1,10})$/);
  return match ? match[1].toLowerCase() : "";
}

function safeToken(value: unknown) {
  return clean(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFileStem(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .trim();
}

export type AssetDocumentNamingInput = {
  documentType: Pick<
    AssetDocumentTypeRow,
    "code" | "naming_template" | "naming_date_source"
  >;
  assetType: AssetType;
  asset: AssetRecord;
  documentDate?: string | null;
  expiryDate?: string | null;
  invoiceNumber?: string | null;
  supplier?: string | null;
  serviceNumber?: string | null;
  originalFileName?: string | null;
  forcedExtension?: string | null;
};

export function buildAssetDocumentFileName(
  input: AssetDocumentNamingInput,
) {
  const documentDate = formatAssetControlledDate(input.documentDate);
  const expiryDate = formatAssetControlledDate(input.expiryDate);
  const date =
    input.documentType.naming_date_source === "expiry_date"
      ? expiryDate
      : documentDate;

  const rawYear =
    input.documentType.naming_date_source === "expiry_date"
      ? clean(input.expiryDate)
      : clean(input.documentDate);
  const year = rawYear.match(/^(\d{4})/)?.[1] ?? "";

  const tokens: Record<string, string> = {
    ASSET: assetNamingCode(input.assetType, input.asset),
    REGO: assetNamingRego(input.assetType, input.asset),
    CODE: compactCode(input.documentType.code, "DOC"),
    DATE: date,
    DOCUMENT_DATE: documentDate,
    EXPIRY_DATE: expiryDate,
    INVOICE: compactCode(input.invoiceNumber, ""),
    SUPPLIER: safeToken(input.supplier),
    SERVICE_NO: compactCode(input.serviceNumber, ""),
    YEAR: year,
  };

  let stem = input.documentType.naming_template;

  for (const [token, value] of Object.entries(tokens)) {
    stem = stem.replaceAll(`{${token}}`, value);
  }

  // Any unsupported/unfilled token is removed rather than leaking braces into
  // a SharePoint controlled filename.
  stem = stem.replace(/\{[A-Z0-9_]+\}/g, "");
  stem = safeFileStem(stem);

  if (!stem) {
    throw new Error("The configured Asset document naming template produced an empty filename.");
  }

  const extension = clean(input.forcedExtension).startsWith(".")
    ? clean(input.forcedExtension).toLowerCase()
    : clean(input.forcedExtension)
      ? `.${clean(input.forcedExtension).toLowerCase()}`
      : extensionFromFileName(input.originalFileName ?? "") || ".pdf";

  return `${stem}${extension}`;
}

export function exampleAssetDocumentFileName(
  documentType: Pick<
    AssetDocumentTypeRow,
    "code" | "naming_template" | "naming_date_source"
  >,
) {
  return buildAssetDocumentFileName({
    documentType,
    assetType: "vehicle",
    asset: {
      id: "example",
      vehicle_id: "LV001",
      vehicle_rego: "S380CUR",
    },
    documentDate: "2026-09-30",
    expiryDate: "2026-09-30",
    invoiceNumber: "INV12345",
    supplier: "Supplier",
    serviceNumber: "SRV-000123",
    originalFileName: "example.pdf",
  });
}

export const ASSET_NAMING_TOKENS = [
  "{ASSET}",
  "{REGO}",
  "{CODE}",
  "{DATE}",
  "{DOCUMENT_DATE}",
  "{EXPIRY_DATE}",
  "{INVOICE}",
  "{SUPPLIER}",
  "{SERVICE_NO}",
  "{YEAR}",
] as const;
