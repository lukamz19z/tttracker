import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform/server";
import { platformIntegrationWorkspace, platformIntegrationHealth } from "@/lib/platform/integrations";
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 503;
  return NextResponse.json({ error: status === 503 ? "Platform integration status is unavailable. Retry shortly." : "Platform access required." }, { status });
}
export async function GET() {
  try { await requirePlatformAdmin(); return NextResponse.json(await platformIntegrationWorkspace(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin(["owner", "admin"]);
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("FORBIDDEN");
    const { provider } = await request.json();
    if (provider !== "sharepoint" && provider !== "xero") return NextResponse.json({ error: "Unsupported platform provider." }, { status: 400 });
    return NextResponse.json(await platformIntegrationHealth(provider), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
