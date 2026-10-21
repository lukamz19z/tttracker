import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requirePeopleContext, peopleError } from "@/lib/people/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { contextTokens, renderPath } from "@/lib/integrations/resolver";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { organisation?: string; filename_template?: string };
    const context = await requirePeopleContext(body.organisation);
    if (!context.permissions?.["training.configure"]) throw new Error("PEOPLE_PERMISSION_DENIED");
    const template = String(body.filename_template ?? "").trim();
    const supported = new Set([...contextTokens.training, "year", "month", "document_category", "document_type"]);
    const tokens = [...template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
    if (!template || template.length > 240 || /[<>:"/\\|?*\x00-\x1f]/.test(template) || /[{}]/.test(template.replace(/\{[^{}]+\}/g, "")) || tokens.some((token) => !supported.has(token))) throw new Error("TRAINING_FILENAME_TEMPLATE_INVALID");
    try { renderPath(template, "training", Object.fromEntries(tokens.map((token) => [token, "Example"])), true); }
    catch { throw new Error("TRAINING_FILENAME_TEMPLATE_INVALID"); }

    const db = createSupabaseAdmin();
    const org = context.organisation.organisationId;
    const existing = await db.from("v2_document_destinations").select("id,filename_template").eq("organisation_id", org).eq("context", "training");
    if (existing.error) throw new Error("TRAINING_FILENAME_DEFAULT_UNAVAILABLE");
    if (!existing.data?.length) throw new Error("TRAINING_FILENAME_DEFAULT_NOT_CONFIGURED");
    const updated = await db.from("v2_document_destinations").update({ filename_template: template }).eq("organisation_id", org).eq("context", "training").select("id");
    if (updated.error || !updated.data?.length) throw new Error("TRAINING_FILENAME_DEFAULT_SAVE_FAILED");
    const audit = await db.from("v2_people_audit").insert({ organisation_id: org, actor_id: context.userId, action: "training_filename_default_updated", data_area: "training_document_naming", context: { old_templates: (existing.data ?? []).map((row) => row.filename_template), new_template: template } });
    if (audit.error) console.error("Training filename audit unavailable", { code: "TRAINING_FILENAME_AUDIT_UNAVAILABLE" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    unstable_rethrow(error);
    const result = peopleError(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
