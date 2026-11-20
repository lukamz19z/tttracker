import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

export async function PATCH(request: Request, context: { params: Promise<{ chartId: string }> }) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.review);
    const { chartId } = await context.params;
    const body = await request.json() as { status?: unknown };
    if (body.status !== "Verified" && body.status !== "Superseded") liftInvalid("Chart status can only be changed to Verified or Superseded through this review action.");
    const { data: chart, error } = await service.from("lift_load_charts").select("id,status").eq("id", chartId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!chart) return NextResponse.json({ error: "Load chart was not found." }, { status: 404 });
    if (chart.status === "Verified" && body.status !== "Superseded") return NextResponse.json({ status: chart.status });
    if (chart.status === "Superseded") liftInvalid("A superseded chart cannot be reactivated; create a new revision.");
    if (body.status === "Verified" && chart.status !== "Imported") liftInvalid("Only imported manufacturer charts can be verified. Complete an import before review.");
    const { data, error: updateError } = await service.from("lift_load_charts").update({ status: body.status }).eq("id", chartId).select("id,status").single();
    if (updateError || !data) throw new Error(updateError?.message || "Chart status was not returned.");
    return NextResponse.json({ chart: data });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
