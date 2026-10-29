import { NextRequest, NextResponse } from "next/server";
import { invalidLadder, ladderAccess, ladderDatabaseError, ladderError, ladderUuid } from "@/lib/assets/ladder-server";
import type { Ladder } from "@/lib/assets/ladders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { service, canEdit } = await ladderAccess(request);
    const items: Ladder[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await service.from("equipment_ladders").select("*")
        .order("ladder_number").order("id").range(offset, offset + 999);
      if (result.error) throw new Error(`Ladder Register query failed: ${result.error.message}`);
      items.push(...result.data as Ladder[]);
      if (result.data.length < 1000) break;
    }
    return NextResponse.json({ items, canEdit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return ladderError(error); }
}

async function save(request: NextRequest, editing: boolean) {
  try {
    const { service, user } = await ladderAccess(request, true);
    const body = await request.json().catch(() => invalidLadder("Submit valid ladder details."));
    if (!body || typeof body !== "object" || Array.isArray(body)) invalidLadder("Submit ladder details.");
    if (editing && !ladderUuid.test(String(body.id))) invalidLadder("Choose the ladder to edit.");
    if (!editing && body.id != null) invalidLadder("New ladders cannot supply an existing asset ID.");
    if (typeof body.ladder_number !== "string" || !body.ladder_number.trim() || body.ladder_number.trim().length > 120 || /[\x00-\x1f\x7f]/.test(body.ladder_number.trim())) {
      invalidLadder("Enter a Ladder Register Number of 1 to 120 characters.");
    }
    for (const field of ["make", "ladder_type", "height", "notes", "status"]) {
      if (body[field] != null && (typeof body[field] !== "string" || body[field].length > (field === "notes" ? 10000 : 500))) invalidLadder(`Check the ladder ${field.replaceAll("_", " ")}.`);
    }
    for (const field of ["crew_id", "supersedes_ladder_id"]) {
      if (body[field] && !ladderUuid.test(String(body[field]))) invalidLadder("Choose a valid crew or ladder.");
    }
    if (editing && body.updated_at !== null && (typeof body.updated_at !== "string" || !Number.isFinite(Date.parse(body.updated_at)))) invalidLadder("Refresh the ladder before editing.");
    if (body.last_internal_inspection && (typeof body.last_internal_inspection !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.last_internal_inspection) || !Number.isFinite(Date.parse(body.last_internal_inspection)) || new Date(body.last_internal_inspection).toISOString().slice(0, 10) !== body.last_internal_inspection)) invalidLadder("Choose a valid inspection date.");
    if (!editing && body.supersedes_ladder_id && body.confirm_supersedes !== true) invalidLadder("Confirm that the selected ladder will be marked as Superseded.");
    // Only supported form fields reach the RPC; no caller-supplied audit columns.
    const payload = Object.fromEntries(["ladder_number", "make", "ladder_type", "height", "crew_id", "status", "last_internal_inspection", "notes", "supersedes_ladder_id", "confirm_supersedes", "updated_at"].map(key => [key, body[key] ?? null]));
    payload.ladder_number = body.ladder_number.trim();
    const result = await service.rpc("v1_ladder_save", { p_data: payload, p_actor: user.id, p_id: editing ? body.id : null });
    if (result.error) ladderDatabaseError(result.error, body.ladder_number);
    const item = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!item?.id) throw new Error("Ladder save succeeded without returning the saved asset ID.");
    return NextResponse.json({ item });
  } catch (error) { return ladderError(error); }
}

export async function POST(request: NextRequest) { return save(request, false); }
export async function PATCH(request: NextRequest) { return save(request, true); }

export async function DELETE(request: NextRequest) {
  try {
    const { service } = await ladderAccess(request, true);
    const id = request.nextUrl.searchParams.get("id") || "";
    if (!ladderUuid.test(id)) invalidLadder("Choose the ladder to delete.");
    const result = await service.from("equipment_ladders").delete().eq("id", id).select("id").maybeSingle();
    if (result.error) {
      if (result.error.code === "23503") invalidLadder("This ladder is linked to other records and must be retained.");
      ladderDatabaseError(result.error, "");
    }
    if (!result.data) invalidLadder("Ladder not found. Refresh the register.");
    return NextResponse.json({ success: true });
  } catch (error) { return ladderError(error); }
}
