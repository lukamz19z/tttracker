// Mobile and website use the same authenticated create/idempotency handler.
// Numbering is performed by V1 database triggers, never by the device.
export { POST } from "@/app/api/quality/revisions/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
