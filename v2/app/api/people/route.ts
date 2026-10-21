import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  peopleError,
  peopleRead,
  requirePeopleContext,
} from "@/lib/people/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const context = await requirePeopleContext(params.get("organisation"));
    if (params.get("area") === "training_history") {
      const { data, error } = await (
        await createSupabaseServer()
      ).rpc("tttracker_v2_training_history", {
        p_org: context.organisation.organisationId,
        p_record: params.get("id"),
        p_page: Math.max(1, Number(params.get("page")) || 1),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (params.get("area") === "onboarding_template_choices") {
      const session = await createSupabaseServer();
      const { data, error } = await session.rpc(
        "tttracker_v2_onboarding_admin",
        {
          p_org: context.organisation.organisationId,
          p_action: "template_choices",
          p_query: (params.get("q") ?? "").slice(0, 120),
          p_page: Math.max(1, Number(params.get("page")) || 1),
        },
      );
      if (error) throw new Error(error.message);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    let result = await peopleRead(
      context.organisation.organisationId,
      params.get("area") ?? "people",
      {
        query: (params.get("q") ?? "").slice(0, 120),
        page: Math.max(1, Number(params.get("page")) || 1),
        personId: params.get("person") ?? undefined,
        filter: Object.fromEntries(
          [
            "status",
            "relationship_type_id",
            "training_type_id",
            "source_channel",
            "review_status",
            "category",
            "category_id",
            "option_id",
            "gaps",
            "date",
            "from_date",
            "to_date",
            "project_id",
            "crew_id",
            "evidence_group_id",
            "id",
            "detail_page",
          ].flatMap((key) =>
            params.has(key) ? [[key, params.get(key) ?? ""]] : [],
          ),
        ),
      },
    );
    if (params.get("area") === "training_types") {
      const rows = Array.isArray((result as { rows?: unknown[] }).rows) ? (result as { rows: Record<string, unknown>[] }).rows : [];
      const ids = rows.map((row) => String(row.id)).filter(Boolean);
      if (ids.length) {
        const config = await createSupabaseAdmin().from("v2_training_types").select("id,matrix_option_display,option_selection_mode,option_evidence_mode").eq("organisation_id", context.organisation.organisationId).in("id", ids);
        const options = await createSupabaseAdmin().from("v2_training_options").select("id,training_type_id,name,code,description,sort_order,is_active").eq("organisation_id", context.organisation.organisationId).in("training_type_id", ids).order("sort_order").order("name");
        if (config.error || options.error) throw new Error("TRAINING_TYPE_CONFIGURATION_LOAD_FAILED");
        const byType = new Map<string, Record<string, unknown>[]>();
        for (const option of options.data ?? []) {
          const typeId = String(option.training_type_id);
          byType.set(typeId, [...(byType.get(typeId) ?? []), option]);
        }
        const settings = new Map((config.data ?? []).map((row) => [String(row.id), row]));
        result = { ...result, rows: rows.map((row) => {
          const typeId = String(row.id), configRow = settings.get(typeId), definitions = byType.get(typeId) ?? [];
          return { ...row, ...configRow, option_definitions: definitions, option_ids: definitions.map((option) => option.id), option_names: definitions.map((option) => option.name).join(", ") };
        }) };
      }
    }
    if (params.get("area") === "matrix") {
      const rows = Array.isArray((result as { rows?: unknown[] }).rows) ? (result as { rows: Record<string, unknown>[] }).rows : [];
      const typeIds = [...new Set(rows.flatMap((row) => Array.isArray(row.cells) ? (row.cells as Record<string, unknown>[]).map((cell) => String(cell.type_id ?? "")) : []).filter(Boolean))];
      if (typeIds.length) {
        // One tenant-scoped configuration read enriches the existing batched
        // matrix projection; detailed columns do not issue per-cell queries.
        const { data: configuredTypes, error: matrixTypeError } = await createSupabaseAdmin()
          .from("v2_training_types")
          .select("id,code,option_selection_mode,requires_certificate_number,validity_mode,matrix_option_display")
          .eq("organisation_id", context.organisation.organisationId)
          .in("id", typeIds);
        if (matrixTypeError) {
          console.error("Training matrix detail configuration could not be loaded", { code: "TRAINING_MATRIX_DETAIL_CONFIG_FAILED", databaseCode: matrixTypeError.code });
        } else {
          const typeConfig = new Map((configuredTypes ?? []).map((type) => [String(type.id), type]));
          result = { ...result, rows: rows.map((row) => ({
            ...row,
            cells: (Array.isArray(row.cells) ? row.cells as Record<string, unknown>[] : []).map((cell) => ({ ...cell, ...(typeConfig.get(String(cell.type_id)) ?? {}) })),
          })) };
        }
      }
    }
    if (params.get("area") === "training_options") {
      // The read RPC remains the permission gate; the authoritative ownership
      // and filtering now come from training_type_id, never category_id.
      const admin = createSupabaseAdmin();
      let query = admin.from("v2_training_options").select("id,organisation_id,training_type_id,category_id,name,code,description,sort_order,is_active", { count: "exact" }).eq("organisation_id", context.organisation.organisationId);
      if (params.get("include_inactive") !== "true") query = query.eq("is_active", true);
      const typeId = params.get("training_type_id");
      if (typeId) query = query.eq("training_type_id", typeId);
      const search = (params.get("q") ?? "").trim();
      if (search) query = query.or(`name.ilike.%${search.replace(/[,%()]/g, " ")}%,code.ilike.%${search.replace(/[,%()]/g, " ")}%`);
      const page = Math.max(1, Number(params.get("page")) || 1);
      const { data: options, count, error: optionsError } = await query.order("sort_order").order("name").range((page - 1) * 20, page * 20 - 1);
      if (optionsError) throw new Error("TRAINING_OPTIONS_LOAD_FAILED");
      const typeIds = [...new Set((options ?? []).map((option) => String(option.training_type_id)).filter(Boolean))];
      const types = typeIds.length ? await admin.from("v2_training_types").select("id,name,category_id").eq("organisation_id", context.organisation.organisationId).in("id", typeIds) : { data: [], error: null };
      if (types.error) throw new Error("TRAINING_OPTIONS_LOAD_FAILED");
      const typeCategories = new Map((types.data ?? []).map((type) => [String(type.id), String(type.category_id ?? "")]));
      const categoryIds = [...new Set([...(types.data ?? []).map((type) => String(type.category_id)), ...(options ?? []).map((option) => String(option.category_id))].filter(Boolean))];
      const categories = categoryIds.length ? await admin.from("v2_training_categories").select("id,name").eq("organisation_id", context.organisation.organisationId).in("id", categoryIds) : { data: [], error: null };
      if (categories.error) throw new Error("TRAINING_OPTIONS_LOAD_FAILED");
      const typeMap = new Map((types.data ?? []).map((type) => [String(type.id), type]));
      const categoryMap = new Map((categories.data ?? []).map((category) => [String(category.id), category.name]));
      result = { rows: (options ?? []).map((option) => ({ ...option, training_type: typeMap.get(String(option.training_type_id))?.name ?? "Needs Assignment", category: categoryMap.get(typeCategories.get(String(option.training_type_id)) || String(option.category_id)) ?? "" })), total: count ?? 0, page };
    }
    if (params.get("area") === "requirements") {
      const rows = Array.isArray((result as { rows?: unknown[] }).rows) ? (result as { rows: Record<string, unknown>[] }).rows : [];
      const optionIds = [...new Set(rows.map((row) => String(row.option_id ?? "")).filter(Boolean))];
      if (optionIds.length) {
        const options = await createSupabaseAdmin().from("v2_training_options").select("id,name,code").eq("organisation_id", context.organisation.organisationId).in("id", optionIds);
        if (!options.error) {
          const optionMap = new Map((options.data ?? []).map((option) => [String(option.id), `${option.code ? `${option.code} · ` : ""}${option.name}`]));
          result = { ...result, rows: rows.map((row) => ({ ...row, option_name: optionMap.get(String(row.option_id ?? "")) ?? "Any Option / Class" })) };
        }
      }
    }
    if (["training", "review"].includes(params.get("area") ?? "")) {
      const admin = createSupabaseAdmin();
      const voided = await admin.from("v2_training_records").select("id").eq("organisation_id", context.organisation.organisationId).not("voided_at", "is", null);
      if (voided.error) {
        console.error("Training record status query failed", {
          code: "TRAINING_RECORD_STATUS_QUERY_FAILED",
          databaseCode: voided.error.code,
        });
        throw new Error("TRAINING_RECORD_STATUS_LOAD_FAILED");
      }
      const ids = new Set((voided.data ?? []).map((item) => String(item.id)));
      const rows = Array.isArray((result as { rows?: unknown[] }).rows) ? (result as { rows: Record<string, unknown>[] }).rows : [];
      const visible = rows.filter((row) => !ids.has(String(row.id)));
      result = { ...result, rows: visible, total: Math.max(0, Number((result as { total?: number }).total ?? visible.length) - (rows.length - visible.length)) };
    }
    return NextResponse.json(result);
  } catch (error) {
    unstable_rethrow(error);
    const result = peopleError(error);
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: {
      organisation?: string;
      action?: string;
      id?: string;
      data?: Record<string, unknown>;
    } = await request.json();
    const context = await requirePeopleContext(body.organisation);
    if (body.action === "training_record_void" || body.action === "training_record_update") {
      const session = await createSupabaseServer();
      const { data, error } = await session.rpc(
        body.action === "training_record_void" ? "tttracker_v2_training_void" : "tttracker_v2_training_record_update",
        body.action === "training_record_void"
          ? { p_org: context.organisation.organisationId, p_record: body.id, p_reason: body.data?.reason }
          : { p_org: context.organisation.organisationId, p_record: body.id, p_data: body.data ?? {} },
      );
      if (error) throw new Error(error.message);
      return NextResponse.json(data);
    }
    if (["training_type", "training_category"].includes(String(body.action)) && Object.prototype.hasOwnProperty.call(body.data ?? {}, "filename_template")) {
      if (!context.permissions?.["training.configure"]) throw new Error("PEOPLE_PERMISSION_DENIED");
      const template = String(body.data?.filename_template ?? "").trim();
      const supported = new Set(["person_id", "employee_number", "person_display_name", "first_name", "last_name", "employment_type", "training_category", "training_type", "training_option", "document_side", "issue_date", "expiry_date", "year", "month", "document_category", "document_type"]);
      const tokens = [...template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
      if (template.length > 240 || template.includes("/") || template.includes("\\") || /[<>:"|?*\x00-\x1f]/.test(template) || tokens.some((token) => !supported.has(token)) || /\{[^{}]*\{|\}[^{}]*\}/.test(template)) throw new Error("TRAINING_FILENAME_TEMPLATE_INVALID");
      body.data!.filename_template = template || null;
    }
    if (body.action === "training_type" && Object.prototype.hasOwnProperty.call(body.data ?? {}, "matrix_option_display")) {
      if (!context.permissions?.["training.configure"]) throw new Error("PEOPLE_PERMISSION_DENIED");
      if (!["separate", "combined"].includes(String(body.data?.matrix_option_display))) throw new Error("PEOPLE_INVALID_FIELDS");
    }
    const session = await createSupabaseServer();
    const { data, error } = await session.rpc("tttracker_v2_people_write", {
      p_organisation_id: context.organisation.organisationId,
      p_action: body.action,
      p_id: body.id ?? null,
      p_data: body.data ?? {},
    });
    if (error) throw new Error(error.message);
    if (["training_type", "training_category"].includes(String(body.action)) && Object.prototype.hasOwnProperty.call(body.data ?? {}, "filename_template")) {
      const id = String(body.id ?? (data as { id?: string } | null)?.id ?? "");
      if (!id) throw new Error("PEOPLE_RECORD_NOT_FOUND");
      const table = body.action === "training_type" ? "v2_training_types" : "v2_training_categories";
      const db = createSupabaseAdmin();
      const previous = await db.from(table).select("filename_template").eq("organisation_id", context.organisation.organisationId).eq("id", id).maybeSingle();
      if (previous.error || !previous.data) throw new Error("PEOPLE_RECORD_NOT_FOUND");
      const saved = await db.from(table).update({ filename_template: body.data!.filename_template }).eq("organisation_id", context.organisation.organisationId).eq("id", id).select("id").maybeSingle();
      if (saved.error || !saved.data) throw new Error("TRAINING_FILENAME_SAVE_FAILED");
      const audit = await db.from("v2_people_audit").insert({ organisation_id: context.organisation.organisationId, actor_id: context.userId, action: "training_filename_updated", data_area: body.action, target_id: id, context: { old_template: previous.data.filename_template, new_template: body.data!.filename_template } });
      if (audit.error) console.error("Training filename audit unavailable", { code: "TRAINING_FILENAME_AUDIT_UNAVAILABLE" });
    }
    if (body.action === "training_type" && Object.prototype.hasOwnProperty.call(body.data ?? {}, "matrix_option_display")) {
      const id = String(body.id ?? (data as { id?: string } | null)?.id ?? "");
      if (!id) throw new Error("PEOPLE_RECORD_NOT_FOUND");
      const db = createSupabaseAdmin();
      const previous = await db.from("v2_training_types").select("matrix_option_display").eq("organisation_id", context.organisation.organisationId).eq("id", id).maybeSingle();
      if (previous.error || !previous.data) throw new Error("PEOPLE_RECORD_NOT_FOUND");
      const next = String(body.data!.matrix_option_display);
      const saved = await db.from("v2_training_types").update({ matrix_option_display: next }).eq("organisation_id", context.organisation.organisationId).eq("id", id).select("id").maybeSingle();
      if (saved.error || !saved.data) throw new Error("TRAINING_MATRIX_DISPLAY_SAVE_FAILED");
      const audit = await db.from("v2_people_audit").insert({ organisation_id: context.organisation.organisationId, actor_id: context.userId, action: "training_matrix_display_updated", data_area: "training_type", target_id: id, context: { old_value: previous.data.matrix_option_display, new_value: next } });
      if (audit.error) console.error("Training matrix display audit unavailable", { code: "TRAINING_MATRIX_DISPLAY_AUDIT_UNAVAILABLE" });
    }
    return NextResponse.json(data);
  } catch (error) {
    unstable_rethrow(error);
    const result = peopleError(error);
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
}
