import { userHasAccess } from "@/lib/access/server";
import { assertQualityProjectAccess, requireQualityUser } from "@/lib/quality/server";

export async function requireMaterialsConfiguration(request: Request, projectId: string) {
  const context = await requireQualityUser(request);
  await assertQualityProjectAccess({
    service: context.service,
    userId: context.user.id,
    role: context.role,
    projectId,
  });
  if (!await userHasAccess(context.service, context.user.id, "materials.configure")) {
    throw new Error("MATERIALS_CONFIGURATION_FORBIDDEN");
  }
  return context;
}
