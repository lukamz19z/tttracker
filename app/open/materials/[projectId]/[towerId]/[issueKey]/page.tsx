import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { buildMaterialIssueRoute, type MaterialIssueKind } from "@/lib/materials/notification-links";

export default async function OpenMaterialIssuePage({ params, searchParams }: {
  params: Promise<{ projectId: string; towerId: string; issueKey: string }>;
  searchParams: Promise<{ kind?: string; eventId?: string }>;
}) {
  const [{ projectId, towerId, issueKey }, query, supabase] = await Promise.all([params, searchParams, createSupabaseServer()]);
  const { data: { user } } = await supabase.auth.getUser();
  const target = buildMaterialIssueRoute({
    projectId, towerId, issueKey, eventId: query.eventId,
    kind: (query.kind === "excess" ? "excess" : "missing") as MaterialIssueKind,
  });
  if (!user) redirect(`/login?next=${encodeURIComponent(target)}`);
  redirect(target);
}
