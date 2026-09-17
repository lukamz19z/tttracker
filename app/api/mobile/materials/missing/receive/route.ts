import { NextRequest, NextResponse } from "next/server";

import {
  mobileApiError,
  requireMobilePermission,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(
      request,
      "mobile.materials",
    );

    const body = (await request.json()) as {
      issueKey?: unknown;
      quantity?: unknown;
      notes?: unknown;
    };

    const issueKey = clean(body.issueKey);
    const quantity = Math.max(numberValue(body.quantity), 0);

    if (!issueKey || quantity <= 0) {
      return NextResponse.json(
        { error: "Issue key and received quantity are required." },
        { status: 400 },
      );
    }

    const { data: issue, error: issueError } = await service
      .from("tower_material_event_items")
      .select(
        "id,event_id,issue_key,bundle_id,bundle_no,bundle_section,source_table,source_record_id,material_type,bolt_size,item_reference,item_description,quantity,unit,notes",
      )
      .eq("issue_key", issueKey)
      .maybeSingle();

    if (issueError) throw new Error(issueError.message);
    if (!issue) {
      return NextResponse.json(
        { error: "Outstanding missing-material item not found." },
        { status: 404 },
      );
    }

    const { data: missingEvent, error: eventError } = await service
      .from("tower_material_events")
      .select("id,project_id,tower_id,event_type")
      .eq("id", issue.event_id)
      .maybeSingle();

    if (eventError) throw new Error(eventError.message);
    if (!missingEvent || missingEvent.event_type !== "missing") {
      return NextResponse.json(
        { error: "This item is not an active missing-material record." },
        { status: 400 },
      );
    }

    const { data: access, error: accessError } = await service
      .from("project_access")
      .select("project_id")
      .eq("project_id", missingEvent.project_id)
      .eq("user_id", identity.userId)
      .maybeSingle();

    if (accessError) throw new Error(accessError.message);
    if (!access) {
      return NextResponse.json(
        { error: "You do not have access to this project." },
        { status: 403 },
      );
    }

    const { data: receiptItems, error: receiptLoadError } = await service
      .from("tower_material_event_items")
      .select("quantity")
      .eq("source_issue_key", issueKey);

    if (receiptLoadError) throw new Error(receiptLoadError.message);

    const originalQty = Math.max(numberValue(issue.quantity), 0);
    const deliveredQty = (receiptItems ?? []).reduce(
      (sum, row) => sum + Math.max(numberValue(row.quantity), 0),
      0,
    );
    const remainingQty = Math.max(originalQty - deliveredQty, 0);

    if (remainingQty <= 0) {
      return NextResponse.json(
        { error: "This missing-material item is already fully resolved." },
        { status: 409 },
      );
    }

    if (quantity > remainingQty) {
      return NextResponse.json(
        { error: `Only ${remainingQty} ${clean(issue.unit) || "ea"} remain outstanding.` },
        { status: 400 },
      );
    }

    const occurredAt = new Date().toISOString();

    const { data: receiptEvent, error: receiptEventError } = await service
      .from("tower_material_events")
      .insert({
        project_id: missingEvent.project_id,
        docket_id: null,
        tower_id: missingEvent.tower_id,
        event_type: "found_received",
        occurred_at: occurredAt,
        affected_work: false,
        notes:
          clean(body.notes) ||
          `Received from mobile by ${clean(identity.fullName) || clean(identity.email) || "TTTracker User"}.`,
      })
      .select("id")
      .single();

    if (receiptEventError) throw new Error(receiptEventError.message);

    const { error: receiptItemError } = await service
      .from("tower_material_event_items")
      .insert({
        event_id: receiptEvent.id,
        issue_key: null,
        source_issue_key: issueKey,
        bundle_id: issue.bundle_id,
        bundle_no: issue.bundle_no,
        bundle_section: issue.bundle_section,
        source_table: issue.source_table,
        source_record_id: issue.source_record_id,
        material_type: issue.material_type,
        bolt_size: issue.bolt_size,
        item_reference: issue.item_reference,
        item_description: issue.item_description,
        quantity,
        unit: issue.unit || "ea",
        notes: clean(body.notes) || null,
      });

    if (receiptItemError) throw new Error(receiptItemError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
