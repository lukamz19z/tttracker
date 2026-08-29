import {
  ClientSecretCredential,
} from "@azure/identity";
import type {
  SupabaseClient,
} from "@supabase/supabase-js";

type AccessAreaRow = {
  id: string;
  code: string;
  name: string;
  source: string | null;
  source_identifier: string | null;
  permission_level: string | null;
  is_active: boolean | null;
};

type RoleRow = {
  id: string;
  code: string;
};

type UserRoleRow = {
  user_id: string;
  role: string;
};

type RolePermissionRow = {
  role_id: string;
  access_area_id: string;
  allowed: boolean;
};

type OverrideRow = {
  user_id: string;
  access_area_id: string;
  allowed: boolean;
};

type MappingRow = {
  user_id: string;
  microsoft_email: string | null;
  is_enabled: boolean;
};

type EmployeeRow = {
  user_id: string | null;
  active: boolean | null;
};

type ExistingGrantRow = {
  id: string;
  user_id: string;
  access_area_id: string;
  microsoft_email: string;
  drive_id: string;
  item_id: string;
  permission_id: string | null;
  permission_role: string;
  status: string;
};

type GraphPermission = {
  id?: string;
};

type InviteResponse = {
  value?: GraphPermission[];
};

type ResourceTarget = {
  driveId: string;
  itemId: string;
};

export type SharePointReconcileResult = {
  areas: number;
  expectedUsers: number;
  added: number;
  removed: number;
  unchanged: number;
  failed: number;
  errors: string[];
};

function requiredEnv(
  name: string,
) {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

async function graphToken() {
  const credential =
    new ClientSecretCredential(
      requiredEnv(
        "AZURE_TENANT_ID",
      ),
      requiredEnv(
        "AZURE_CLIENT_ID",
      ),
      requiredEnv(
        "AZURE_CLIENT_SECRET",
      ),
    );

  const token =
    await credential.getToken(
      "https://graph.microsoft.com/.default",
    );

  if (!token?.token) {
    throw new Error(
      "Could not obtain Microsoft Graph token.",
    );
  }

  return token.token;
}

async function graphRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response =
    await fetch(
      `https://graph.microsoft.com/v1.0${path}`,
      {
        ...init,
        headers: {
          Authorization:
            `Bearer ${token}`,
          Accept:
            "application/json",
          ...(
            init.body
              ? {
                  "Content-Type":
                    "application/json",
                }
              : {}
          ),
          ...(init.headers ?? {}),
        },
        cache:
          "no-store",
      },
    );

  if (
    response.status ===
    204
  ) {
    return {} as T;
  }

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Microsoft Graph ${response.status}: ${text}`,
    );
  }

  if (!text) {
    return {} as T;
  }

  return JSON.parse(
    text,
  ) as T;
}

function permissionRole(
  level:
    | string
    | null,
) {
  const normalized =
    String(level ?? "")
      .trim()
      .toLowerCase();

  if (
    normalized.includes(
      "read",
    ) ||
    normalized.includes(
      "view",
    )
  ) {
    return "read";
  }

  return "write";
}

async function resolveTarget(
  token: string,
  area: AccessAreaRow,
): Promise<ResourceTarget> {
  const identifier =
    String(
      area.source_identifier ??
        "",
    ).trim();

  if (
    area.source ===
    "sharepoint_folder"
  ) {
    const separator =
      identifier.indexOf(
        ":",
      );

    if (
      separator <= 0
    ) {
      throw new Error(
        `${area.name}: invalid SharePoint folder identifier.`,
      );
    }

    return {
      driveId:
        identifier.slice(
          0,
          separator,
        ),
      itemId:
        identifier.slice(
          separator +
            1,
        ),
    };
  }

  if (
    area.source ===
    "sharepoint_library"
  ) {
    if (!identifier) {
      throw new Error(
        `${area.name}: SharePoint drive id is missing.`,
      );
    }

    const root =
      await graphRequest<{
        id: string;
      }>(
        token,
        `/drives/${encodeURIComponent(
          identifier,
        )}/root?$select=id`,
      );

    return {
      driveId:
        identifier,
      itemId:
        root.id,
    };
  }

  throw new Error(
    `${area.name}: unsupported SharePoint source ${area.source ?? "unknown"}.`,
  );
}

async function listAllAuthUsers(
  service:
    SupabaseClient,
) {
  const users =
    new Map<
      string,
      string
    >();

  let page = 1;

  while (true) {
    const {
      data,
      error,
    } =
      await service.auth.admin
        .listUsers({
          page,
          perPage:
            1000,
        });

    if (error) {
      throw new Error(
        error.message,
      );
    }

    for (
      const user
      of data.users
    ) {
      const email =
        user.email?.trim();

      if (email) {
        users.set(
          user.id,
          email,
        );
      }
    }

    if (
      data.users.length <
      1000
    ) {
      break;
    }

    page += 1;
  }

  return users;
}

async function grantAccess(
  token: string,
  target:
    ResourceTarget,
  email: string,
  role: string,
) {
  const response =
    await graphRequest<InviteResponse>(
      token,
      `/drives/${encodeURIComponent(
        target.driveId,
      )}/items/${encodeURIComponent(
        target.itemId,
      )}/invite`,
      {
        method:
          "POST",
        body:
          JSON.stringify({
            recipients: [
              {
                email,
              },
            ],
            requireSignIn:
              true,
            sendInvitation:
              false,
            roles: [
              role,
            ],
            retainInheritedPermissions:
              true,
          }),
      },
    );

  const permissionId =
    response.value?.[0]
      ?.id;

  if (!permissionId) {
    throw new Error(
      `Microsoft Graph did not return a permission id for ${email}.`,
    );
  }

  return permissionId;
}

async function revokeAccess(
  token: string,
  grant:
    ExistingGrantRow,
) {
  if (
    !grant.permission_id
  ) {
    return;
  }

  const response =
    await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        grant.drive_id,
      )}/items/${encodeURIComponent(
        grant.item_id,
      )}/permissions/${encodeURIComponent(
        grant.permission_id,
      )}`,
      {
        method:
          "DELETE",
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
        cache:
          "no-store",
      },
    );

  /*
   * 404 is treated as already removed. This also makes reconcile
   * tolerant of a folder/library that was deleted in SharePoint.
   */
  if (
    response.ok ||
    response.status ===
      404
  ) {
    return;
  }

  const text =
    await response.text();

  throw new Error(
    `Microsoft Graph ${response.status}: ${text}`,
  );
}

export async function reconcileSharePointPermissions(
  service:
    SupabaseClient,
  onlyAreaIds?:
    string[],
): Promise<SharePointReconcileResult> {
  let areasQuery =
    service
      .from(
        "access_areas",
      )
      .select(`
        id,
        code,
        name,
        source,
        source_identifier,
        permission_level,
        is_active
      `)
      .eq(
        "is_active",
        true,
      )
      .in(
        "source",
        [
          "sharepoint_library",
          "sharepoint_folder",
        ],
      );

  if (
    onlyAreaIds &&
    onlyAreaIds.length >
      0
  ) {
    areasQuery =
      areasQuery.in(
        "id",
        onlyAreaIds,
      );
  }

  const [
    areasResult,
    rolesResult,
    userRolesResult,
    rolePermissionsResult,
    overridesResult,
    mappingsResult,
    employeesResult,
    grantsResult,
    authUsers,
  ] =
    await Promise.all([
      areasQuery,

      service
        .from("roles")
        .select(
          "id,code",
        )
        .eq(
          "is_active",
          true,
        ),

      service
        .from(
          "user_roles",
        )
        .select(
          "user_id,role",
        ),

      service
        .from(
          "role_permissions",
        )
        .select(
          "role_id,access_area_id,allowed",
        ),

      service
        .from(
          "user_permission_overrides",
        )
        .select(
          "user_id,access_area_id,allowed",
        ),

      service
        .from(
          "sharepoint_user_mappings",
        )
        .select(
          "user_id,microsoft_email,is_enabled",
        ),

      service
        .from("employees")
        .select(
          "user_id,active",
        )
        .not(
          "user_id",
          "is",
          null,
        ),

      service
        .from(
          "sharepoint_permission_grants",
        )
        .select(`
          id,
          user_id,
          access_area_id,
          microsoft_email,
          drive_id,
          item_id,
          permission_id,
          permission_role,
          status
        `),

      listAllAuthUsers(
        service,
      ),
    ]);

  const failures = [
    areasResult.error,
    rolesResult.error,
    userRolesResult.error,
    rolePermissionsResult.error,
    overridesResult.error,
    mappingsResult.error,
    employeesResult.error,
    grantsResult.error,
  ].filter(Boolean);

  if (
    failures.length >
    0
  ) {
    throw new Error(
      failures[0]
        ?.message ??
        "Could not load SharePoint permission data.",
    );
  }

  const areas =
    (
      areasResult.data ??
      []
    ) as AccessAreaRow[];

  const roles =
    (
      rolesResult.data ??
      []
    ) as RoleRow[];

  const userRoles =
    (
      userRolesResult.data ??
      []
    ) as UserRoleRow[];

  const rolePermissions =
    (
      rolePermissionsResult.data ??
      []
    ) as RolePermissionRow[];

  const overrides =
    (
      overridesResult.data ??
      []
    ) as OverrideRow[];

  const mappings =
    (
      mappingsResult.data ??
      []
    ) as MappingRow[];

  const employees =
    (
      employeesResult.data ??
      []
    ) as EmployeeRow[];

  const existingGrants =
    (
      grantsResult.data ??
      []
    ) as ExistingGrantRow[];

  const roleIdByCode =
    new Map(
      roles.map(
        (role) => [
          role.code
            .trim()
            .toLowerCase(),
          role.id,
        ],
      ),
    );

  const roleByUser =
    new Map(
      userRoles.map(
        (row) => [
          row.user_id,
          row.role
            .trim()
            .toLowerCase(),
        ],
      ),
    );

  const activeEmployeeByUser =
    new Map<
      string,
      boolean
    >();

  for (
    const employee
    of employees
  ) {
    if (
      employee.user_id
    ) {
      activeEmployeeByUser.set(
        employee.user_id,
        employee.active !==
          false,
      );
    }
  }

  const mappingByUser =
    new Map(
      mappings.map(
        (mapping) => [
          mapping.user_id,
          mapping,
        ],
      ),
    );

  const rolePermissionMap =
    new Map<
      string,
      boolean
    >();

  for (
    const permission
    of rolePermissions
  ) {
    rolePermissionMap.set(
      `${permission.role_id}:${permission.access_area_id}`,
      permission.allowed,
    );
  }

  const overrideMap =
    new Map<
      string,
      boolean
    >();

  for (
    const override
    of overrides
  ) {
    overrideMap.set(
      `${override.user_id}:${override.access_area_id}`,
      override.allowed,
    );
  }

  const userIds =
    new Set(
      userRoles.map(
        (row) =>
          row.user_id,
      ),
    );

  const expected =
    new Map<
      string,
      {
        userId: string;
        areaId: string;
        email: string;
      }
    >();

  for (
    const userId
    of userIds
  ) {
    /*
     * If a matching employee row exists and that employee is inactive,
     * revoke SharePoint access. Accounts without an employee row are
     * still supported for admin/service users.
     */
    if (
      activeEmployeeByUser.has(
        userId,
      ) &&
      activeEmployeeByUser.get(
        userId,
      ) === false
    ) {
      continue;
    }

    const mapping =
      mappingByUser.get(
        userId,
      );

    if (
      mapping &&
      mapping.is_enabled ===
        false
    ) {
      continue;
    }

    const email =
      mapping?.microsoft_email
        ?.trim() ||
      authUsers.get(
        userId,
      );

    if (!email) {
      continue;
    }

    const roleCode =
      roleByUser.get(
        userId,
      );

    if (!roleCode) {
      continue;
    }

    const roleId =
      roleIdByCode.get(
        roleCode,
      );

    if (!roleId) {
      continue;
    }

    for (
      const area
      of areas
    ) {
      const overrideKey =
        `${userId}:${area.id}`;

      const roleAllowed =
        rolePermissionMap.get(
          `${roleId}:${area.id}`,
        ) === true;

      const effectiveAllowed =
        overrideMap.has(
          overrideKey,
        )
          ? overrideMap.get(
              overrideKey,
            ) === true
          : roleAllowed;

      if (
        effectiveAllowed
      ) {
        expected.set(
          `${userId}:${area.id}`,
          {
            userId,
            areaId:
              area.id,
            email,
          },
        );
      }
    }
  }

  const currentActive =
    new Map<
      string,
      ExistingGrantRow
    >();

  for (
    const grant
    of existingGrants
  ) {
    if (
      grant.status ===
      "active"
    ) {
      currentActive.set(
        `${grant.user_id}:${grant.access_area_id}`,
        grant,
      );
    }
  }

  const token =
    await graphToken();

  const targetCache =
    new Map<
      string,
      ResourceTarget
    >();

  const result:
    SharePointReconcileResult = {
      areas:
        areas.length,
      expectedUsers:
        new Set(
          Array.from(
            expected.values(),
          ).map(
            (entry) =>
              entry.userId,
          ),
        ).size,
      added:
        0,
      removed:
        0,
      unchanged:
        0,
      failed:
        0,
      errors: [],
    };

  for (
    const [
      key,
      entry,
    ]
    of expected
  ) {
    const area =
      areas.find(
        (item) =>
          item.id ===
          entry.areaId,
      );

    if (!area) {
      continue;
    }

    const role =
      permissionRole(
        area.permission_level,
      );

    const existing =
      currentActive.get(
        key,
      );

    if (
      existing &&
      existing.microsoft_email
        .trim()
        .toLowerCase() ===
        entry.email
          .trim()
          .toLowerCase() &&
      existing.permission_role ===
        role
    ) {
      result.unchanged +=
        1;
      continue;
    }

    try {
      if (existing) {
        await revokeAccess(
          token,
          existing,
        );
      }

      let target =
        targetCache.get(
          area.id,
        );

      if (!target) {
        target =
          await resolveTarget(
            token,
            area,
          );

        targetCache.set(
          area.id,
          target,
        );
      }

      const permissionId =
        await grantAccess(
          token,
          target,
          entry.email,
          role,
        );

      const {
        error,
      } =
        await service
          .from(
            "sharepoint_permission_grants",
          )
          .upsert(
            {
              user_id:
                entry.userId,
              access_area_id:
                entry.areaId,
              microsoft_email:
                entry.email,
              drive_id:
                target.driveId,
              item_id:
                target.itemId,
              permission_id:
                permissionId,
              permission_role:
                role,
              status:
                "active",
              last_error:
                null,
              synced_at:
                new Date()
                  .toISOString(),
            },
            {
              onConflict:
                "user_id,access_area_id",
            },
          );

      if (error) {
        throw new Error(
          error.message,
        );
      }

      result.added +=
        1;
    } catch (error) {
      result.failed +=
        1;

      const message =
        error instanceof Error
          ? error.message
          : "Unknown SharePoint grant error.";

      result.errors.push(
        `${area.name} / ${entry.email}: ${message}`,
      );

      await service
        .from(
          "sharepoint_permission_grants",
        )
        .upsert(
          {
            user_id:
              entry.userId,
            access_area_id:
              entry.areaId,
            microsoft_email:
              entry.email,
            drive_id:
              existing?.drive_id ??
              "",
            item_id:
              existing?.item_id ??
              "",
            permission_id:
              existing?.permission_id ??
              null,
            permission_role:
              role,
            status:
              "error",
            last_error:
              message,
            synced_at:
              new Date()
                .toISOString(),
          },
          {
            onConflict:
              "user_id,access_area_id",
          },
        );
    }
  }

  for (
    const [
      key,
      grant,
    ]
    of currentActive
  ) {
    if (
      expected.has(key)
    ) {
      continue;
    }

    if (
      onlyAreaIds &&
      onlyAreaIds.length >
        0 &&
      !onlyAreaIds.includes(
        grant.access_area_id,
      )
    ) {
      continue;
    }

    try {
      await revokeAccess(
        token,
        grant,
      );

      const {
        error,
      } =
        await service
          .from(
            "sharepoint_permission_grants",
          )
          .update({
            status:
              "removed",
            last_error:
              null,
            synced_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            grant.id,
          );

      if (error) {
        throw new Error(
          error.message,
        );
      }

      result.removed +=
        1;
    } catch (error) {
      result.failed +=
        1;

      const message =
        error instanceof Error
          ? error.message
          : "Unknown SharePoint revoke error.";

      result.errors.push(
        `${grant.microsoft_email}: ${message}`,
      );

      await service
        .from(
          "sharepoint_permission_grants",
        )
        .update({
          status:
            "error",
          last_error:
            message,
          synced_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          grant.id,
        );
    }
  }

  return result;
}