import { NextResponse } from "next/server";

import { ASSET_NAMING_TOKENS } from "@/lib/assets/document-naming";
import {
  assetApiError,
  canConfigureAssets,
  clean,
  requireAssetUser,
} from "@/lib/assets/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ documentTypeId: string }>;
};

const ALLOWED_CATEGORIES = new Set([
  "compliance",
  "service",
  "invoice",
  "inspection",
  "manual",
  "photo",
  "other",
]);
const ALLOWED_APPLIES = new Set(["vehicle", "plant", "both"]);
const ALLOWED_DATE_REQUIREMENTS = new Set([
  "none",
  "document_date",
  "expiry_date",
  "document_and_expiry",
]);
const ALLOWED_DATE_SOURCES = new Set(["document_date", "expiry_date"]);
const ALLOWED_REPLACEMENT = new Set(["current", "historical"]);

function codeValue(value: unknown) {
  return clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 20);
}

function validateTemplate(template: string) {
  if (!template) throw new Error("Enter a naming convention.");
  if (!template.includes("{ASSET}")) {
    throw new Error("The naming convention must include {ASSET}.");
  }

  const tokens = Array.from(template.matchAll(/\{[A-Z0-9_]+\}/g)).map(
    (match) => match[0],
  );
  const invalid = tokens.filter(
    (token) => !ASSET_NAMING_TOKENS.includes(token as (typeof ASSET_NAMING_TOKENS)[number]),
  );

  if (invalid.length > 0) throw new Error(`Unsupported naming token: ${invalid[0]}`);
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { documentTypeId } = await context.params;
    const { service, identity } = await requireAssetUser(request);
    if (!canConfigureAssets(identity.role)) throw new Error("ASSET_CONFIG_FORBIDDEN");

    const body = (await request.json()) as Record<string, unknown>;
    const name = clean(body.name);
    const code = codeValue(body.code);
    const category = clean(body.category);
    const appliesTo = clean(body.appliesTo);
    const dateRequirement = clean(body.dateRequirement);
    const namingDateSource = clean(body.namingDateSource);
    const namingTemplate = clean(body.namingTemplate);
    const replacementMode = clean(body.replacementMode);
    const fieldMapping = clean(body.assetFieldMapping) || null;
    const fieldSource = clean(body.assetFieldSource) || null;

    if (!name || !code) throw new Error("Document type name and code are required.");
    if (!ALLOWED_CATEGORIES.has(category)) throw new Error("Select a valid category.");
    if (!ALLOWED_APPLIES.has(appliesTo)) throw new Error("Select where the document applies.");
    if (!ALLOWED_DATE_REQUIREMENTS.has(dateRequirement)) throw new Error("Select a valid date requirement.");
    if (!ALLOWED_DATE_SOURCES.has(namingDateSource)) throw new Error("Select a valid naming date source.");
    if (!ALLOWED_REPLACEMENT.has(replacementMode)) throw new Error("Select a valid replacement behaviour.");
    if (fieldSource && !ALLOWED_DATE_SOURCES.has(fieldSource)) throw new Error("Select a valid asset-field date source.");
    validateTemplate(namingTemplate);

    const { data, error } = await service
      .from("asset_document_types")
      .update({
        name,
        code,
        category,
        applies_to: appliesTo,
        date_requirement: dateRequirement,
        naming_date_source: namingDateSource,
        naming_template: namingTemplate,
        replacement_mode: replacementMode,
        asset_field_mapping: fieldMapping,
        asset_field_source: fieldMapping ? fieldSource : null,
        requires_supplier: body.requiresSupplier === true,
        requires_invoice_number: body.requiresInvoiceNumber === true,
        requires_cost: body.requiresCost === true,
        active: body.active !== false,
        sort_order: Math.max(0, Number(body.sortOrder ?? 100) || 100),
        updated_by: identity.userId,
      })
      .eq("id", documentTypeId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ documentType: data });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
