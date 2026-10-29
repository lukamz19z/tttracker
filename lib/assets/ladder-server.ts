import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getRequestUser, userHasAccess } from "@/lib/access/server";
import { duplicateLadderMessage } from "./ladders";

export const ladderUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ladderAccess(request: NextRequest, edit = false) {
  const user = await getRequestUser(request);
  const service = createServiceClient();
  const permissions = await Promise.all(
    ["tt.assets", "tt.assets.equipment", "assets.view", "assets.edit"].map(code =>
      userHasAccess(service, user.id, code)),
  );
  if (!permissions[0] || !permissions[1] || !permissions[2] || (edit && !permissions[3])) {
    throw new Error("LADDER_FORBIDDEN");
  }
  return { user, service, canEdit: permissions[3] };
}

export function invalidLadder(message: string): never {
  throw new Error(`LADDER_INVALID:${message}`);
}

export function ladderError(error: unknown) {
  const message = error instanceof Error ? error.message : "Ladder operation failed.";
  const status = message === "LADDER_FORBIDDEN" ? 403
    : message === "EQUIPMENT_NOT_FOUND" ? 404
    : /authentication token|must be logged in/.test(message) ? 401
    : message.startsWith("LADDER_INVALID:") ? 400 : 500;
  if (status === 500) console.error("Ladder Register", error);
  return NextResponse.json({ error: status === 403
    ? "You do not have permission for this ladder register action."
    : status === 404 ? "Ladder not found."
    : message.replace(/^LADDER_INVALID:/, "") }, { status });
}

export function ladderDatabaseError(error: { code: string; message: string }, number: string): never {
  if (error.code === "23505") invalidLadder(duplicateLadderMessage(number));
  if (error.code === "23503") invalidLadder("The selected crew or ladder no longer exists. Refresh and try again.");
  if (["22023", "P0001"].includes(error.code)) invalidLadder(error.message);
  throw new Error(`Ladder Register save failed: ${error.message}`);
}
