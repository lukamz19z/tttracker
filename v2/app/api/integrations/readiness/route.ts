import { NextRequest, NextResponse } from "next/server";
import { integrationContext, integrationError } from "@/lib/integrations/server";
import { providerReadiness } from "@/lib/integrations/readiness";
export async function GET(request: NextRequest) {
  try {
    const provider = request.nextUrl.searchParams.get("provider");
    if (provider !== "sharepoint" && provider !== "xero") throw new Error("INTEGRATION_SCOPE_INVALID");
    const { context } = await integrationContext(request.nextUrl.searchParams.get("organisation"), provider, "view");
    return NextResponse.json(await providerReadiness(provider, !!context.permissions?.[`integrations.${provider}.manage`]), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json(integrationError(error), { status: 403 }); }
}
