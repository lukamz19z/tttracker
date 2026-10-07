import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { peopleError, requirePeopleContext } from "@/lib/people/server";
async function run(
  organisation: string | null,
  person: string | null,
  domain: string | null,
  values?: unknown,
) {
  const context = await requirePeopleContext(organisation);
  const { data, error } = await (
    await createSupabaseServer()
  ).rpc("tttracker_v2_people_private_domain", {
    p_org: context.organisation.organisationId,
    p_person: person,
    p_domain: domain,
    p_values: values ?? null,
  });
  if (error) throw new Error(error.message);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
export async function GET(r: NextRequest) {
  try {
    const p = r.nextUrl.searchParams;
    return await run(p.get("organisation"), p.get("person"), p.get("domain"));
  } catch (e) {
    unstable_rethrow(e);
    const x = peopleError(e);
    return NextResponse.json({ error: x.error }, { status: x.status });
  }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    return await run(b.organisation, b.person, b.domain, b.values);
  } catch (e) {
    unstable_rethrow(e);
    const x = peopleError(e);
    return NextResponse.json({ error: x.error }, { status: x.status });
  }
}
