import { NextResponse } from "next/server";

import { ASSET_NAMING_TOKENS } from "@/lib/assets/document-naming";
import {
  assetApiError,
  canConfigureAssets,
  canViewAssets,
  clean,
  requireAssetUser,
} from "@/lib/assets/server";
import type {
  AssetDocumentAppliesTo,
  AssetDocumentCategory,
  AssetDocumentDateRequirement,
  AssetDocumentDateSource,
  AssetDocumentReplacementMode,
} from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set<AssetDocumentCategory>([
  "compliance",
  "service",
  "invoice",
  "inspection",
  "manual",
  "photo",
  "other",
]);

const APPLIES = new Set<AssetDocumentAppliesTo>(["vehicle", "plant", "both"]);
const DATE_REQUIREMENTS = new Set<AssetDocumentDateRequirement>([
  "none",
  "document_date",
  "expiry_date",
  "document_and_expiry",
]);
const DATE_SOURCES = new Set<AssetDocumentDateSource>([
  "document_date",
  "expiry_date",
]);
const REPLACEMENTS = new Set<AssetDocumentReplacementMode>([
  "current",
  "historical",
]);

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

  if (invalid.length > 0) {
    throw new Error(`Unsupported naming token: ${invalid[0]}`);
  }
}

export async function GET(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);
    if (!canViewAssets(identity.role)) throw new Error("ASSET_VIEW_FORBIDDEN");

    const { data, error } = await service
      .from("asset_document_types")
      .select("*")
      .order("sort_order")
      .order("name");

    if (error) throw new Error(error.message);

    return NextResponse.json({
      documentTypes: data ?? [],
      canConfigure: canConfigureAssets(identity.role),
      tokens: ASSET_NAMING_TOKENS,
    });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);
    if (!canConfigureAssets(identity.role)) throw new Error("ASSET_CONFIG_FORBIDDEN");

    const body = (await request.json()) as Record<string, unknown>;

    const name = clean(body.name);
    const code = codeValue(body.code);
    const category = clean(body.category) as AssetDocumentCategory;
    const appliesTo = clean(body.appliesTo) as AssetDocumentAppliesTo;
    const dateRequirement = clean(body.dateRequirement) as AssetDocumentDateRequirement;
    const namingDateSource = clean(body.namingDateSource) as AssetDocumentDateSource;
    const namingTemplate = clean(body.namingTemplate);
    const replacementMode = clean(body.replacementMode) as AssetDocumentReplacementMode;
    const assetFieldSource = clean(body.assetFieldSource) as AssetDocumentDateSource;

    if (!name) return NextResponse.json({ error: "Enter the document type name." }, { status: 400 });
    if (!code) return NextResponse.json({ error: "Enter the document code." }, { status: 400 });
    if (!CATEGORIES.has(category)) return NextResponse.json({ error: "Select a valid document category." }, { status: 400 });
    if (!APPLIES.has(appliesTo)) return NextResponse.json({ error: "Select where the document type applies." }, { status: 400 });
    if (!DATE_REQUIREMENTS.has(dateRequirement)) return NextResponse.json({ error: "Select a valid date requirement." }, { status: 400 });
    if (!DATE_SOURCES.has(namingDateSource)) return NextResponse.json({ error: "Select the naming date source." }, { status: 400 });
    if (!REPLACEMENTS.has(replacementMode)) return NextResponse.json({ error: "Select the replacement behaviour." }, { status: 400 });
    validateTemplate(namingTemplate);

    const fieldMapping = clean(body.assetFieldMapping) || null;

    const { data, error } = await service
      .from("asset_document_types")
      .insert({
        system_key: null,
        name,
        code,
        category,
        applies_to: appliesTo,
        date_requirement: dateRequirement,
        naming_date_source: namingDateSource,
        naming_template: namingTemplate,
        replacement_mode: replacementMode,
        asset_field_mapping: fieldMapping,
        asset_field_source:
          fieldMapping && DATE_SOURCES.has(assetFieldSource)
            ? assetFieldSource
            : null,
        requires_supplier: body.requiresSupplier === true,
        requires_invoice_number: body.requiresInvoiceNumber === true,
        requires_cost: body.requiresCost === true,
        active: body.active !== false,
        sort_order: Math.max(0, Number(body.sortOrder ?? 100) || 100),
        created_by: identity.userId,
        updated_by: identity.userId,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ documentType: data });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
