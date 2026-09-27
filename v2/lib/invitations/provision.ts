import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";

type EnsureInvitationAccessInput = {
  organisationId: string;
  userId: string;
  roleCode: string;
  invitationId: string;
  invitedBy: string | null;
};

export async function ensureInvitationAccess(
  input: EnsureInvitationAccessInput,
) {
  const supabase = createSupabaseAdmin();

  const { data: existingMembership, error: membershipLookupError } =
    await supabase
      .from("organisation_users")
      .select("status")
      .eq("organisation_id", input.organisationId)
      .eq("user_id", input.userId)
      .maybeSingle();

  if (membershipLookupError) {
    throw new Error(membershipLookupError.message);
  }

  const membershipStatus =
    existingMembership?.status === "active"
      ? "active"
      : "invited";

  const { error: membershipError } = await supabase
    .from("organisation_users")
    .upsert(
      {
        organisation_id: input.organisationId,
        user_id: input.userId,
        status: membershipStatus,
        joined_at:
          membershipStatus === "active"
            ? undefined
            : null,
        invited_by: input.invitedBy,
        metadata: {
          source: "tttracker_invitation",
          invitation_id: input.invitationId,
        },
      },
      {
        onConflict: "organisation_id,user_id",
      },
    );

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  let { data: role, error: roleLookupError } = await supabase
    .from("v2_roles")
    .select("id, code")
    .eq("organisation_id", input.organisationId)
    .eq("code", input.roleCode)
    .eq("is_active", true)
    .maybeSingle();

  if (roleLookupError) {
    throw new Error(roleLookupError.message);
  }

  if (!role && input.roleCode === "admin") {
    const { data: createdRole, error: createRoleError } = await supabase
      .from("v2_roles")
      .insert({
        organisation_id: input.organisationId,
        code: "admin",
        name: "Administrator",
        description: "Organisation administrator.",
        is_system: true,
        is_active: true,
        sort_order: 10,
        created_by: input.invitedBy,
      })
      .select("id, code")
      .single();

    if (createRoleError || !createdRole) {
      throw new Error(
        createRoleError?.message ??
          "Could not create organisation administrator role.",
      );
    }

    role = createdRole;
  }

  if (!role) {
    throw new Error(
      `Role '${input.roleCode}' is not configured for this organisation.`,
    );
  }

  if (role.code === "admin") {
    const { data: permissions, error: permissionError } = await supabase
      .from("v2_permissions")
      .select("id")
      .eq("is_active", true);

    if (permissionError) {
      throw new Error(permissionError.message);
    }

    if (permissions?.length) {
      const { error: rolePermissionError } = await supabase
        .from("v2_role_permissions")
        .upsert(
          permissions.map((permission) => ({
            organisation_id: input.organisationId,
            role_id: role!.id,
            permission_id: permission.id,
            allowed: true,
            created_by: input.invitedBy,
          })),
          {
            onConflict: "role_id,permission_id",
          },
        );

      if (rolePermissionError) {
        throw new Error(rolePermissionError.message);
      }
    }
  }

  const { error: assignmentError } = await supabase
    .from("v2_user_role_assignments")
    .upsert(
      {
        organisation_id: input.organisationId,
        user_id: input.userId,
        role_id: role.id,
        status: "active",
        assigned_by: input.invitedBy,
      },
      {
        onConflict: "organisation_id,user_id,role_id",
      },
    );

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }
}
