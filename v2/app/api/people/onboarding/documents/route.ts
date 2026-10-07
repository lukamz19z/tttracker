import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requirePeopleContext, peopleError } from "@/lib/people/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const context = await requirePeopleContext(p.get("organisation"));
    const { data, error } = await (
      await createSupabaseServer()
    ).rpc("tttracker_v2_onboarding_admin", {
      p_org: context.organisation.organisationId,
      p_action: "document",
      p_id: p.get("id"),
      p_data: { field: p.get("field") },
    });
    if (error) throw new Error(error.message);
    const rows = await Promise.all(
      (data.rows ?? []).map(
        async (d: {
          id: string;
          name: string;
          side: string;
          storage_key: string;
        }) => {
          const { data: signed, error: failed } = await createSupabaseAdmin()
            .storage.from("v2-people-evidence")
            .createSignedUrl(d.storage_key, 60);
          if (failed) throw new Error("TRAINING_DOCUMENT_UNAVAILABLE");
          return {
            id: d.id,
            name: d.name,
            side: d.side,
            url: signed.signedUrl,
          };
        },
      ),
    );
    return NextResponse.json(
      { rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    unstable_rethrow(e);
    const r = peopleError(e);
    return NextResponse.json(
      { error: r.error },
      { status: r.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
