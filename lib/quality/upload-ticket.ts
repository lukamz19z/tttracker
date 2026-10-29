import { createHmac, timingSafeEqual } from "node:crypto";

export type QualityUploadTicket = {
  sessionId: string;
  userId: string; projectId: string; towerId: string; defectId: string;
  revisionId: string; revisionItemId: string; fileRole: string;
  clientMutationId: string; watermarkPosition: string; capturedAt: string;
  driveId: string; folderId: string; stagingName: string;
  name: string; mimeType: string; size: number; expires: number;
  evidencePhase: string;
  capturedBy?: string; capturedDate?: string;
};
function signature(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Quality upload signing is unavailable.");
  return createHmac("sha256", key).update(payload).digest();
}
export function signQualityUpload(value: QualityUploadTicket) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function verifyQualityUpload(ticket: string, userId: string): QualityUploadTicket {
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig) throw new Error("Invalid Quality upload ticket.");
  const actual = Buffer.from(sig,"base64url"), expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) throw new Error("Invalid Quality upload ticket.");
  const value = JSON.parse(Buffer.from(payload,"base64url").toString()) as QualityUploadTicket;
  if (value.userId !== userId || value.expires < Date.now()) throw new Error("Quality upload expired. Retry this evidence.");
  return value;
}
