import { userHasAccess } from "@/lib/access/server";
import { assertQualityProjectAccess, requireQualityUser } from "./server";
import { qualityDisplayName } from "./display-name";

export async function qualityWorkflowAccess(request: Request, projectId?: string, importing = false) {
  const context = await requireQualityUser(request);
  const { service, user, role } = context;
  const [web, mobile, canImport] = await Promise.all([
    userHasAccess(service, user.id, "tt.rectifications"),
    userHasAccess(service, user.id, "mobile.rectifications"),
    userHasAccess(service, user.id, "quality.import_punchlist"),
  ]);
  if (!(web || mobile) || (importing && !(web && canImport))) throw new Error("FORBIDDEN");
  if (projectId) await assertQualityProjectAccess({ service, userId: user.id, role, projectId });
  return { ...context, label: qualityDisplayName(user.user_metadata?.full_name || user.user_metadata?.name || "TTTracker User") };
}
