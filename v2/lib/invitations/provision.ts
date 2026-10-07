import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Bootstrap only creates missing standard-role defaults. Acceptance never seeds permissions.
export async function initialOrganisationRole(
  organisationId: string,
  actorId: string,
): Promise<string> {
  const { data, error } = await createSupabaseAdmin().rpc(
    "tttracker_v2_platform_invitation",
    {
      p_actor: actorId,
      p_action: "bootstrap",
      p_organisation_id: organisationId,
    },
  );
  if (error || typeof data?.roleId !== "string")
    throw new Error(error?.message ?? "INITIAL_ROLE_NOT_AVAILABLE");
  return data.roleId;
}
