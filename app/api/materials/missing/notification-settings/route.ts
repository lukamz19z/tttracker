import { NextResponse } from "next/server";
import { qualityApiError } from "@/lib/quality/server";
import { resolveProjectUserLabels } from "@/lib/materials/project-users";
import { requireMaterialsConfiguration } from "@/lib/materials/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown) => String(value ?? "").trim();
const eventFields = ["notify_raised", "notify_urgent", "notify_assignment", "notify_update", "notify_partial_receipt", "notify_full_receipt", "notify_resolved", "notify_cancel", "receives_in_app", "receives_push", "receives_email", "active"] as const;
type EventField = typeof eventFields[number];
const defaults: Record<EventField, boolean> = { notify_raised: false, notify_urgent: false, notify_assignment: false, notify_update: false, notify_partial_receipt: false, notify_full_receipt: false, notify_resolved: false, notify_cancel: false, receives_in_app: true, receives_push: true, receives_email: false, active: false };

export async function GET(request: Request) {
  try {
    const projectId = clean(new URL(request.url).searchParams.get("projectId"));
    if (!projectId) return NextResponse.json({ error: "Project is required." }, { status: 400 });
    const { service } = await requireMaterialsConfiguration(request, projectId);
    const [{ data: members, error: membersError }, { data: rules, error: rulesError }] = await Promise.all([
      service.from("project_access").select("user_id").eq("project_id", projectId),
      service.from("project_material_notification_rules").select("*").eq("project_id", projectId).order("updated_at"),
    ]);
    if (membersError || rulesError) throw new Error(membersError?.message || rulesError?.message);
    const ids = [...new Set([...(members || []).map(row => clean(row.user_id)), ...(rules || []).map(row => clean(row.user_id))].filter(Boolean))];
    const projectUsers = await resolveProjectUserLabels(service, ids);
    projectUsers.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ projectUsers, rules: rules || [] });
  } catch (error) {
    const result = qualityApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const projectId = clean(body.projectId), userId = clean(body.userId);
    if (!projectId || !userId) return NextResponse.json({ error: "Project and recipient are required." }, { status: 400 });
    const { service, user } = await requireMaterialsConfiguration(request, projectId);
    const { data: member, error: memberError } = await service.from("project_access").select("user_id").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) return NextResponse.json({ error: "Recipient must be a member of this project." }, { status: 400 });

    const { data: existing, error: existingError } = await service.from("project_material_notification_rules").select("*").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    const payload: Record<string, unknown> = {
      project_id: projectId,
      user_id: userId,
      available_for_selection: typeof body.availableForSelection === "boolean" ? body.availableForSelection : existing?.available_for_selection ?? true,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    for (const field of eventFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) payload[field] = body[field] === true;
      else payload[field] = existing?.[field] ?? defaults[field];
    }
    const { data, error } = await service.from("project_material_notification_rules").upsert(payload, { onConflict: "project_id,user_id" }).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ rule: data });
  } catch (error) {
    const result = qualityApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { projectId?: string; userId?: string };
    const projectId = clean(body.projectId), userId = clean(body.userId);
    if (!projectId || !userId) return NextResponse.json({ error: "Project and recipient are required." }, { status: 400 });
    const { service, user } = await requireMaterialsConfiguration(request, projectId);
    const { data, error } = await service.from("project_material_notification_rules")
      .update({ available_for_selection: false, active: false, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("project_id", projectId).eq("user_id", userId).select("user_id").maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, removed: Boolean(data) });
  } catch (error) {
    const result = qualityApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
