import "server-only";
import { requireMaterialsContext } from "./security";
import { MaterialsSecurityError, type MaterialsCapability } from "./access-policy";
import { ProjectAccessError } from "@/lib/projects/access";

// Only expected authorization denials become page states; authentication and lookup errors propagate.
export async function materialsPageContext(projectId: string, organisationId: string | null, capability: MaterialsCapability = "view") {
  try { return await requireMaterialsContext(projectId, organisationId, capability); }
  catch (error) {
    if ((error instanceof MaterialsSecurityError || error instanceof ProjectAccessError)
      && error.status === 403 && ["MATERIALS_PERMISSION_DENIED", "MATERIALS_SCOPE_DENIED"].includes(error.message)) return null;
    throw error;
  }
}
