import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, materialsErrorResponse } from "@/lib/materials/security";
import { isRecord, prepareImportRows, importValidationCounts, uuidPattern, type ImportCategory, type ImportMode } from "@/lib/materials/import-validation";

type Context = { params: Promise<{ projectId: string }> };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body: unknown = await request.json();
    if (!isRecord(body)) throw new Error("Expected an import request object.");
    const project = await requireMaterialsContext(projectId, text(body.organisationId) || null, "import");
    const towerId = text(body.towerId);
    const scope = text(body.importScope) || "single";
    if (!["single", "selected", "all", "csv"].includes(scope)) throw new Error("Invalid import scope.");
    if (scope === "single" && !uuidPattern.test(towerId)) throw new Error("Select a valid tower before importing.");
    const targetIds = scope === "single" ? [towerId] : ["selected", "all"].includes(scope) ? body.targetTowerIds : [];
    if (!Array.isArray(targetIds) || !targetIds.every(id => typeof id === "string" && uuidPattern.test(id))
      || (["selected", "all"].includes(scope) && !targetIds.length)) throw new Error("Select valid target towers.");
    const category = text(body.importCategory) as ImportCategory;
    const mode = (text(body.mode) || "merge") as ImportMode;
    if (!["bundles", "members", "bolts", "packers"].includes(category)) throw new Error("Invalid import category.");
    if (!["add", "merge", "replace"].includes(mode)) throw new Error("Invalid import mode.");
    if (!Array.isArray(body.rows) || !body.rows.length) throw new Error("The import contains no rows.");
    if (body.rows.length > 10000) throw new Error("Import at most 10,000 rows per batch.");
    if (!isRecord(body.mapping)) throw new Error("Column mapping is required.");
    const sourceRole = text(body.sourceRole);
    if (!sourceRole) throw new Error("Select an import source role.");
    const sourceFileName = text(body.sourceFileName);
    const sourceScope = text(body.sourceScope) || sourceFileName;
    if (!sourceScope) throw new Error("A source document scope is required.");
    const sourceRowNumbers = body.sourceRowNumbers;
    if (sourceRowNumbers !== undefined && (!Array.isArray(sourceRowNumbers)
      || sourceRowNumbers.length !== body.rows.length
      || !sourceRowNumbers.every((row, index) => Number.isSafeInteger(row) && row >= 1
        && (index === 0 || row > sourceRowNumbers[index - 1])))) throw new Error("Invalid source row numbers.");
    const prepared = prepareImportRows(body.rows, body.mapping, category, sourceRowNumbers as number[] | undefined);
    if (!prepared.rows.length && !prepared.rowErrors.length) throw new Error("The import contains no material rows.");
    if (scope === "csv") for (const row of prepared.rows) {
      if (!row.values.tower_reference) prepared.rowErrors.push({ row: row.row_number, message: "tower_reference is required." });
    }
    if (prepared.rowErrors.length) {
      return NextResponse.json({ ok: false, error: "Validation failed. No rows were applied.",
        ...importValidationCounts(prepared.rows.length, prepared.rowErrors),
        ignoredEmptyRows: prepared.ignoredEmptyRows, rowErrors: prepared.rowErrors }, { status: 422 });
    }
    // Live relationship validation and all writes belong to a single database transaction.
    const suppliedOptions = isRecord(body.importOptions) ? body.importOptions : {};
    const options = { applicability: isRecord(suppliedOptions.applicability) ? {...suppliedOptions.applicability, unmatched:"retain"} : undefined,
      bundleIdentity:suppliedOptions.bundleIdentity };
    const { data, error } = await createSupabaseAdmin().rpc("tttracker_v2_apply_material_schedule", {
      p_project_id: projectId, p_organisation_id: project.dataOrganisationId,
      p_scope: scope, p_tower_ids: targetIds, p_confirm_types: body.confirmTowerTypes === true,
      p_options: { ...options, memberIdentity: category === "members" ? "source_variant" : undefined },
      p_actor_id: project.workspace.userId, p_category: category, p_mode: mode,
      p_source_role: sourceRole, p_source_scope: sourceScope, p_source_file: sourceFileName || null,
      p_profile_name: text(body.profileName) || null, p_mapping: body.mapping, p_rows: prepared.rows,
    });
    if (error) {
      console.error("Materials import RPC failed", { projectId, code: error.code, message: error.message, details: error.details, hint: error.hint });
      return NextResponse.json({ ok:false, code:"MATERIALS_IMPORT_FAILED",
        error:"Materials import could not be applied. No rows were changed. Please retry or contact support.",
        ...importValidationCounts(prepared.rows.length, [], 0), rowErrors:[],
      }, { status:500 });
    }
    if (!isRecord(data)) throw new Error("Materials import RPC returned no result.");
    const errors = Array.isArray(data.rowErrors) ? data.rowErrors.filter((row): row is { row: number; message: string } =>
      isRecord(row) && typeof row.row === "number" && typeof row.message === "string") : [];
    const counts = importValidationCounts(prepared.rows.length, errors, data.ok === true ? prepared.rows.length : 0);
    return NextResponse.json({ ...data,
      ...counts, acceptedRows: counts.validRows, rejectedRows: counts.invalidRows,
      ignoredEmptyRows: prepared.ignoredEmptyRows,
    }, { status: data.ok === true ? 200 : 422 });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}
