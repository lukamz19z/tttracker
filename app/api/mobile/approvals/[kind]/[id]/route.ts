import { NextRequest, NextResponse } from "next/server";

import { mobileApiError, requireMobileUser } from "@/lib/mobile/server";
import {
  financeCapabilitiesForUser,
  isDocketReviewerForProject,
} from "@/lib/mobile/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ kind: string; id: string }>;
};

const DOCKET_CLIENT_CONTENT_OPTIONS = [
  ["daily_site_summary", "Daily Site Summary"],
  ["rfi_references", "RFI References"],
  ["progress", "Progress"],
  ["workforce", "Workforce"],
  ["raw_manhours", "Raw Man-hours"],
  ["plant", "Plant"],
  ["mobilisation", "Mobilisation"],
  ["travel", "Travel"],
  ["delays", "Delays"],
  ["missing_materials", "Missing Materials"],
  ["received_materials", "Received Materials"],
  ["bundle_transfers", "Bundle Transfers"],
  ["safety", "Safety"],
] as const;

const REVIEWABLE_STATUSES = new Set([
  "submitted_bc",
  "client_changes_requested",
]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rows(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { kind, id } = await context.params;
    const { service, identity } = await requireMobileUser(request);

    if (kind === "docket") {
      const { data: docket, error } = await service
        .from("tower_daily_dockets")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!docket) {
        return NextResponse.json(
          { error: "Daily Docket not found." },
          { status: 404 },
        );
      }

      const allowed = await isDocketReviewerForProject(
        service,
        identity.userId,
        String(docket.project_id),
      );

      if (!allowed) {
        return NextResponse.json(
          { error: "You are not configured to review this Daily Docket." },
          { status: 403 },
        );
      }

      const revision = Math.max(
        1,
        Number(docket.approval_revision ?? 1) || 1,
      );

      const [
        project,
        tower,
        labour,
        plant,
        delays,
        progress,
        allocations,
        events,
        transfers,
        clientContent,
      ] = await Promise.all([
        service
          .from("projects")
          .select("id,name,project_number,client")
          .eq("id", docket.project_id)
          .maybeSingle(),
        service
          .from("towers")
          .select("id,name,line,extra_data")
          .eq("id", docket.tower_id)
          .maybeSingle(),
        service
          .from("tower_docket_labour")
          .select("*")
          .eq("docket_id", id)
          .order("worker_name"),
        service.from("tower_docket_plant").select("*").eq("docket_id", id),
        service
          .from("tower_docket_delays")
          .select("*")
          .eq("docket_id", id)
          .order("created_at"),
        service.from("tower_docket_progress").select("*").eq("docket_id", id),
        service
          .from("tower_docket_hour_allocations")
          .select("*")
          .eq("docket_id", id)
          .order("created_at"),
        service
          .from("tower_material_events")
          .select(
            "*,tower_material_event_items(*),tower_material_event_people(*),tower_material_event_plant(*)",
          )
          .eq("docket_id", id)
          .order("occurred_at"),
        service
          .from("tower_material_transfers")
          .select("*")
          .or(`source_docket_id.eq.${id},destination_docket_id.eq.${id}`)
          .order("transferred_at"),
        service
          .from("tower_docket_client_content")
          .select("content_key,included")
          .eq("docket_id", id)
          .eq("revision", revision),
      ]);

      for (const result of [
        project,
        tower,
        labour,
        plant,
        delays,
        progress,
        allocations,
        events,
        transfers,
      ]) {
        if (result.error) throw new Error(result.error.message);
      }

      // Client content rows may not exist until the first approval. In that
      // case mobile starts with all sections selected, matching the safe current
      // mobile behaviour rather than silently excluding information.
      const selectedClientContentKeys = clientContent.error
        ? DOCKET_CLIENT_CONTENT_OPTIONS.map(([key]) => key)
        : (clientContent.data ?? []).length
          ? (clientContent.data ?? [])
              .filter((row) => row.included)
              .map((row) => String(row.content_key))
          : DOCKET_CLIENT_CONTENT_OPTIONS.map(([key]) => key);

      return NextResponse.json({
        kind: "docket",
        docket,
        project: project.data,
        tower: tower.data,
        labour: labour.data ?? [],
        plant: plant.data ?? [],
        delays: delays.data ?? [],
        progress: progress.data ?? [],
        allocations: allocations.data ?? [],
        materialEvents: events.data ?? [],
        transfers: transfers.data ?? [],
        reviewActionable: REVIEWABLE_STATUSES.has(
          clean(docket.approval_status),
        ),
        selectedClientContentKeys,
        clientContentOptions: DOCKET_CLIENT_CONTENT_OPTIONS.map(
          ([key, label]) => ({ key, label }),
        ),
      });
    }

    if (kind !== "expense" && kind !== "invoice") {
      return NextResponse.json(
        { error: "Unknown approval type." },
        { status: 404 },
      );
    }

    const finance = await financeCapabilitiesForUser(
      service,
      identity.userId,
    );
    const capability = kind === "expense" ? finance.expense : finance.invoice;

    if (
      !capability.canReviewEdit &&
      !capability.canApprove &&
      !capability.canMarkPaid
    ) {
      return NextResponse.json(
        { error: "You are not configured to review this Finance workflow." },
        { status: 403 },
      );
    }

    const submissionType = kind === "expense" ? "expense_claim" : "invoice";
    const { data: submission, error: submissionError } = await service
      .from("financial_submissions")
      .select("*")
      .eq("id", id)
      .eq("submission_type", submissionType)
      .maybeSingle();

    if (submissionError) throw new Error(submissionError.message);
    if (!submission) {
      return NextResponse.json(
        { error: "Finance submission not found." },
        { status: 404 },
      );
    }

    const [items, attachments, categories, project] = await Promise.all([
      service
        .from("financial_submission_items")
        .select("*")
        .eq("submission_id", id)
        .order("sort_order"),
      service
        .from("financial_attachments")
        .select(
          "id,submission_id,item_id,attachment_type,file_name,content_type,file_size_bytes,uploaded_at",
        )
        .eq("submission_id", id)
        .order("uploaded_at"),
      service.from("financial_categories").select("id,name").order("name"),
      submission.project_id
        ? service
            .from("projects")
            .select("id,name,project_number")
            .eq("id", submission.project_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    for (const result of [items, attachments, categories, project]) {
      if (result.error) throw new Error(result.error.message);
    }

    return NextResponse.json({
      kind,
      capability,
      submission,
      items: items.data ?? [],
      attachments: attachments.data ?? [],
      categories: categories.data ?? [],
      project: project.data,
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { kind, id } = await context.params;
    const { service, identity } = await requireMobileUser(request);

    if (kind !== "docket") {
      return NextResponse.json(
        { error: "Reviewer corrections are only available for Daily Dockets." },
        { status: 405 },
      );
    }

    const { data: docket, error: docketLoadError } = await service
      .from("tower_daily_dockets")
      .select("id,project_id,approval_status,approval_revision")
      .eq("id", id)
      .maybeSingle();

    if (docketLoadError) throw new Error(docketLoadError.message);
    if (!docket) {
      return NextResponse.json(
        { error: "Daily Docket not found." },
        { status: 404 },
      );
    }

    const allowed = await isDocketReviewerForProject(
      service,
      identity.userId,
      String(docket.project_id),
    );

    if (!allowed) {
      return NextResponse.json(
        { error: "You are not configured as a BC reviewer for this project." },
        { status: 403 },
      );
    }

    if (!REVIEWABLE_STATUSES.has(clean(docket.approval_status))) {
      return NextResponse.json(
        {
          error:
            "This Daily Docket is no longer awaiting action from a BC reviewer.",
        },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const docketPatch = record(body.docket);
    const progressRows = rows(body.progress);
    const labourRows = rows(body.labour);
    const delayRows = rows(body.delays);

    const allowedDocketFields = [
      "crew",
      "leading_hand",
      "weather",
      "rate_type",
      "incident_occurred",
      "incident_type",
      "incident_notes",
      "delays_comments",
      "missing_items_bolts",
    ] as const;

    const safeDocketPatch: Record<string, unknown> = {};
    for (const field of allowedDocketFields) {
      if (field in docketPatch) safeDocketPatch[field] = docketPatch[field];
    }

    if (Object.keys(safeDocketPatch).length > 0) {
      const { error } = await service
        .from("tower_daily_dockets")
        .update(safeDocketPatch)
        .eq("id", id)
        .in("approval_status", ["submitted_bc", "client_changes_requested"]);

      if (error) throw new Error(error.message);
    }

    for (const row of progressRows) {
      const rowId = clean(row.id);
      if (!rowId) continue;

      const { error } = await service
        .from("tower_docket_progress")
        .update({
          assembly_today: row.assembly_today,
          assembly_overall: row.assembly_overall,
          erection_today: row.erection_today,
          erection_overall: row.erection_overall,
          assembled_qty: row.assembled_qty,
          erected_qty: row.erected_qty,
        })
        .eq("id", rowId)
        .eq("docket_id", id);

      if (error) throw new Error(error.message);
    }

    for (const row of labourRows) {
      const rowId = clean(row.id);
      if (!rowId) continue;

      const { error } = await service
        .from("tower_docket_labour")
        .update({
          time_in: row.time_in,
          time_out: row.time_out,
          total_hours: row.total_hours,
          lunch_minutes: row.lunch_minutes,
          travel_in_minutes: row.travel_in_minutes,
          travel_out_minutes: row.travel_out_minutes,
          mobilisation_hours: row.mobilisation_hours,
          delay_hours: row.delay_hours,
          delay_reason: row.delay_reason,
          production_hours: row.production_hours,
        })
        .eq("id", rowId)
        .eq("docket_id", id);

      if (error) throw new Error(error.message);
    }

    for (const row of delayRows) {
      const rowId = clean(row.id);
      if (!rowId) continue;

      const { error } = await service
        .from("tower_docket_delays")
        .update({
          delay_type: row.delay_type,
          delay_reason: row.delay_reason,
          delay_hours: row.delay_hours,
          applies_to: row.applies_to,
          worker_names: Array.isArray(row.worker_names) ? row.worker_names : [],
          delay_applies_mode: row.delay_applies_mode,
          plant_names: Array.isArray(row.plant_names) ? row.plant_names : [],
        })
        .eq("id", rowId)
        .eq("docket_id", id);

      if (error) throw new Error(error.message);
    }

    const now = new Date().toISOString();
    const { error: eventError } = await service
      .from("tower_docket_workflow_events")
      .insert({
        docket_id: id,
        project_id: docket.project_id,
        event_type: "bc_reviewer_corrected_docket_mobile",
        performed_by: identity.userId,
        revision: Math.max(
          1,
          Number(docket.approval_revision ?? 1) || 1,
        ),
        comments: null,
        metadata: {
          source: "mobile",
          docket_fields: Object.keys(safeDocketPatch),
          progress_rows: progressRows.length,
          labour_rows: labourRows.length,
          delay_rows: delayRows.length,
        },
        created_at: now,
      });

    if (eventError) {
      console.error("Mobile reviewer correction workflow event failed", eventError);
    }

    return NextResponse.json({
      success: true,
      reviewerMadeChanges: true,
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
