import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function createTrainingServiceClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function normaliseRole(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export type TrainingIdentity = {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;

  /**
   * Legacy single-role value retained for older Training configuration/rules.
   * New access decisions should use roleCodes / grantsAll / userCanManageTraining.
   */
  role: string;

  /**
   * All active roles assigned through the dynamic TTTracker RBAC system.
   */
  roleCodes: string[];

  /**
   * True when the user holds a full-access dynamic TTTracker role.
   */
  grantsAll: boolean;
};

type DynamicRoleRow = {
  id: string;
  code: string | null;
  name: string | null;
  grants_all: boolean | null;
  is_active: boolean | null;
};

type DynamicRoleIdentityRow = {
  id: string;
  code: string | null;
  name: string | null;
};

type RoleAssignmentIdRow = {
  role_id: string | null;
};

type UserRoleAssignmentRow = {
  user_id: string | null;
  role_id: string | null;
};

type LegacyUserRoleRow = {
  user_id: string | null;
  role: string | null;
};

type EmployeeIdentityRow = {
  id: string;
  full_name: string | null;
  user_id: string | null;
  active: boolean | null;
};

type LegacyIdentityRoleRow = {
  role: string | null;
};

type TrainingReviewRuleRow = {
  id?: string | null;

  scope_type: string | null;

  category_id: string | null;

  training_type_id: string | null;

  principal_type: string | null;

  user_id: string | null;

  role: string | null;

  can_review: boolean | null;

  active: boolean | null;

  receives_in_app?: boolean | null;

  receives_push?: boolean | null;

  receives_email?: boolean | null;
};

type AccessRpcResult =
  | boolean
  | null;

async function dynamicRolesForUser(
  service: ReturnType<
    typeof createTrainingServiceClient
  >,
  userId: string,
): Promise<DynamicRoleRow[]> {
  const {
    data: assignmentData,
    error: assignmentError,
  } = await service
    .from("user_role_assignments")
    .select("role_id")
    .eq("user_id", userId);

  if (assignmentError) {
    /**
     * Keep older TTTracker installs functional while dynamic RBAC
     * is being rolled out. The caller can still use legacy access.
     */
    console.warn(
      "Training dynamic role assignment lookup failed; using legacy access fallback.",
      assignmentError.message,
    );

    return [];
  }

  const assignments =
    (assignmentData ?? []) as RoleAssignmentIdRow[];

  const roleIds = Array.from(
    new Set(
      assignments
        .map((row) =>
          clean(row.role_id),
        )
        .filter(
          (
            value,
          ): value is string =>
            Boolean(value),
        ),
    ),
  );

  if (roleIds.length === 0) {
    return [];
  }

  const {
    data: roleData,
    error: roleError,
  } = await service
    .from("roles")
    .select(
      "id,code,name,grants_all,is_active",
    )
    .in("id", roleIds)
    .eq("is_active", true);

  if (roleError) {
    console.warn(
      "Training dynamic role lookup failed; using legacy access fallback.",
      roleError.message,
    );

    return [];
  }

  return (roleData ??
    []) as DynamicRoleRow[];
}

async function identityForUser(
  service: ReturnType<
    typeof createTrainingServiceClient
  >,
  user: User,
): Promise<TrainingIdentity> {
  const [
    employeeResult,
    legacyRoleResult,
    dynamicRoles,
  ] = await Promise.all([
    service
      .from("employees")
      .select(
        "id,full_name,user_id,active",
      )
      .eq("user_id", user.id)
      .maybeSingle(),

    service
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle(),

    dynamicRolesForUser(
      service,
      user.id,
    ),
  ]);

  if (employeeResult.error) {
    console.warn(
      "Training employee identity lookup failed.",
      employeeResult.error.message,
    );
  }

  if (legacyRoleResult.error) {
    console.warn(
      "Training legacy role lookup failed; using dynamic RBAC only.",
      legacyRoleResult.error.message,
    );
  }

  const employee =
    (employeeResult.data ??
      null) as EmployeeIdentityRow | null;

  const roleRow =
    (legacyRoleResult.data ??
      null) as LegacyIdentityRoleRow | null;

  const email =
    clean(
      user.email,
    ).toLowerCase();

  const metadataName =
    clean(
      user.user_metadata
        ?.full_name ||
        user.user_metadata
          ?.name,
    );

  const dynamicRoleCodes =
    dynamicRoles
      .map((role) =>
        normaliseRole(
          role.code ||
            role.name,
        ),
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      );

  const legacyRole =
    normaliseRole(
      roleRow?.role ||
        "user",
    );

  const roleCodes =
    Array.from(
      new Set([
        ...dynamicRoleCodes,

        ...(legacyRole &&
        legacyRole !== "user"
          ? [legacyRole]
          : []),
      ]),
    );

  return {
    userId: user.id,

    employeeId:
      clean(
        employee?.id,
      ) || null,

    name:
      clean(
        employee?.full_name,
      ) ||
      metadataName ||
      email ||
      "TTTracker User",

    email,

    role:
      legacyRole,

    roleCodes,

    grantsAll:
      dynamicRoles.some(
        (role) =>
          role.grants_all ===
          true,
      ),
  };
}

export async function requireTrainingUser(
  request: Request,
) {
  const authorization =
    request.headers.get(
      "authorization",
    ) ?? "";

  const token =
    authorization
      .replace(
        /^Bearer\s+/i,
        "",
      )
      .trim();

  if (!token) {
    throw new Error(
      "AUTH_REQUIRED",
    );
  }

  const service =
    createTrainingServiceClient();

  const {
    data: { user },
    error,
  } =
    await service.auth.getUser(
      token,
    );

  if (
    error ||
    !user
  ) {
    throw new Error(
      "AUTH_REQUIRED",
    );
  }

  const identity =
    await identityForUser(
      service,
      user,
    );

  return {
    service,
    user,
    identity,
  };
}

/**
 * Legacy compatibility helper only.
 *
 * New Training access should use userCanManageTraining(), which checks
 * the dynamic RBAC system first and only then falls back to these old roles.
 */
export function roleCanManageTraining(
  role: string,
) {
  return [
    "admin",
    "administrator",
    "site_admin",
    "hseq",
    "safety",
    "safety_officer",
    "training_officer",
    "training_admin",
  ].includes(
    normaliseRole(role),
  );
}

/**
 * Checks whether the user has an active dynamic RBAC role where
 * roles.grants_all = true.
 *
 * No role name is hard-coded here.
 */
export async function userHasFullAccessRole(
  service: ReturnType<
    typeof createTrainingServiceClient
  >,
  userId: string,
): Promise<boolean> {
  const roles =
    await dynamicRolesForUser(
      service,
      userId,
    );

  return roles.some(
    (role) =>
      role.grants_all ===
      true,
  );
}

/**
 * Check an effective TTTracker permission using the RBAC database function.
 */
export async function userHasAccessCode(
  service: ReturnType<
    typeof createTrainingServiceClient
  >,
  userId: string,
  accessCode: string,
): Promise<boolean> {
  const code =
    clean(accessCode);

  if (
    !userId ||
    !code
  ) {
    return false;
  }

  try {
    const {
      data,
      error,
    } = await service.rpc(
      "user_has_access",
      {
        p_user_id:
          userId,

        p_access_code:
          code,
      },
    );

    if (error) {
      console.warn(
        `Training access lookup failed for ${code}; using compatibility fallback.`,
        error.message,
      );

      return false;
    }

    return (
      data as AccessRpcResult
    ) === true;
  } catch (error) {
    console.warn(
      `Training access RPC unavailable for ${code}; using compatibility fallback.`,
      error,
    );

    return false;
  }
}

/**
 * Central Training-management access decision.
 *
 * Order:
 * 1. grants_all dynamic role
 * 2. dynamic tt.training.manage permission
 * 3. legacy role compatibility
 */
export async function userCanManageTraining({
  service,
  identity,
}: {
  service: ReturnType<
    typeof createTrainingServiceClient
  >;

  identity:
    TrainingIdentity;
}): Promise<boolean> {
  /**
   * Full dynamic Administrator.
   */
  if (
    identity.grantsAll
  ) {
    return true;
  }

  /**
   * Configurable effective permission.
   */
  if (
    await userHasAccessCode(
      service,
      identity.userId,
      "tt.training.manage",
    )
  ) {
    return true;
  }

  /**
   * Compatibility with the existing Training access model.
   */
  return roleCanManageTraining(
    identity.role,
  );
}

function identityMatchesRuleRole(
  identity: TrainingIdentity,
  value: unknown,
) {
  const requested =
    normaliseRole(value);

  if (!requested) {
    return false;
  }

  return new Set(
    [
      identity.role,
      ...identity.roleCodes,
    ].filter(Boolean),
  ).has(requested);
}

/**
 * Returns true when the current user can review the requested Training scope.
 *
 * Full-access Administrator / Training management permission automatically
 * allows all review scopes.
 */
export async function userCanReviewTraining({
  service,
  identity,
  trainingTypeId,
  categoryId,
}: {
  service: ReturnType<
    typeof createTrainingServiceClient
  >;

  identity:
    TrainingIdentity;

  trainingTypeId?:
    | string
    | null;

  categoryId?:
    | string
    | null;
}) {
  if (
    await userCanManageTraining({
      service,
      identity,
    })
  ) {
    return true;
  }

  const {
    data: ruleData,
    error,
  } = await service
    .from(
      "training_review_rules",
    )
    .select(
      "scope_type,category_id,training_type_id,principal_type,user_id,role,can_review,active",
    )
    .eq(
      "active",
      true,
    )
    .eq(
      "can_review",
      true,
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  const rules =
    (ruleData ??
      []) as TrainingReviewRuleRow[];

  return rules.some(
    (rule) => {
      const principalMatches =
        (
          rule.principal_type ===
            "user" &&
          rule.user_id ===
            identity.userId
        ) ||
        (
          rule.principal_type ===
            "role" &&
          identityMatchesRuleRole(
            identity,
            rule.role,
          )
        );

      if (
        !principalMatches
      ) {
        return false;
      }

      if (
        rule.scope_type ===
        "type"
      ) {
        return (
          Boolean(
            trainingTypeId,
          ) &&
          rule.training_type_id ===
            trainingTypeId
        );
      }

      if (
        rule.scope_type ===
        "category"
      ) {
        return (
          Boolean(
            categoryId,
          ) &&
          rule.category_id ===
            categoryId
        );
      }

      return true;
    },
  );
}

/**
 * Determines whether the current user may upload Training for a different
 * employee.
 *
 * Full dynamic Administrators and Training managers are permitted.
 */
export async function assertCanSubmitForEmployee({
  service,
  identity,
  employeeId,
}: {
  service: ReturnType<
    typeof createTrainingServiceClient
  >;

  identity:
    TrainingIdentity;

  employeeId:
    string;
}) {
  if (
    identity.employeeId ===
    employeeId
  ) {
    return;
  }

  if (
    await userCanManageTraining({
      service,
      identity,
    })
  ) {
    return;
  }

  const {
    data: ruleData,
    error,
  } = await service
    .from(
      "training_review_rules",
    )
    .select(
      "id,principal_type,user_id,role,can_review,active",
    )
    .eq(
      "active",
      true,
    )
    .eq(
      "can_review",
      true,
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  const rules =
    (ruleData ??
      []) as TrainingReviewRuleRow[];

  const configuredReviewer =
    rules.some(
      (rule) =>
        (
          rule.principal_type ===
            "user" &&
          rule.user_id ===
            identity.userId
        ) ||
        (
          rule.principal_type ===
            "role" &&
          identityMatchesRuleRole(
            identity,
            rule.role,
          )
        ),
    );

  if (
    !configuredReviewer
  ) {
    throw new Error(
      "TRAINING_FORBIDDEN",
    );
  }
}

export type TrainingReviewerRecipient = {
  userId: string;

  receivesInApp:
    boolean;

  receivesPush:
    boolean;

  receivesEmail:
    boolean;
};

/**
 * Resolve all configured review recipients.
 *
 * Supports:
 * - specific users
 * - dynamic multi-role assignments
 * - legacy user_roles fallback
 */
export async function reviewerRecipientsFor({
  service,
  trainingTypeId,
  categoryId,
}: {
  service: ReturnType<
    typeof createTrainingServiceClient
  >;

  trainingTypeId:
    string;

  categoryId?:
    | string
    | null;
}): Promise<
  TrainingReviewerRecipient[]
> {
  const {
    data: ruleData,
    error,
  } = await service
    .from(
      "training_review_rules",
    )
    .select(
      "scope_type,category_id,training_type_id,principal_type,user_id,role,can_review,receives_in_app,receives_push,receives_email,active",
    )
    .eq(
      "active",
      true,
    )
    .eq(
      "can_review",
      true,
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  const rules =
    (ruleData ??
      []) as TrainingReviewRuleRow[];

  /**
   * First identify which reviewer rules apply to this Training record.
   */
  const matching =
    rules.filter(
      (rule) => {
        if (
          rule.scope_type ===
          "type"
        ) {
          return (
            rule.training_type_id ===
            trainingTypeId
          );
        }

        if (
          rule.scope_type ===
          "category"
        ) {
          return (
            Boolean(
              categoryId,
            ) &&
            rule.category_id ===
              categoryId
          );
        }

        /**
         * Any other configured scope currently represents the
         * general/all-Training reviewer scope.
         */
        return true;
      },
    );

  const recipients =
    new Map<
      string,
      TrainingReviewerRecipient
    >();

  const roleRules =
    new Map<
      string,
      TrainingReviewRuleRow[]
    >();

  function mergeRecipient(
    userId: string,
    rule: Pick<
      TrainingReviewRuleRow,
      | "receives_in_app"
      | "receives_push"
      | "receives_email"
    >,
  ) {
    if (!userId) {
      return;
    }

    const current =
      recipients.get(
        userId,
      ) ?? {
        userId,

        receivesInApp:
          false,

        receivesPush:
          false,

        receivesEmail:
          false,
      };

    current.receivesInApp =
      current.receivesInApp ||
      rule.receives_in_app !==
        false;

    current.receivesPush =
      current.receivesPush ||
      rule.receives_push !==
        false;

    current.receivesEmail =
      current.receivesEmail ||
      rule.receives_email ===
        true;

    recipients.set(
      userId,
      current,
    );
  }

  /**
   * Resolve direct-user reviewer rules and collect role-based rules.
   */
  for (
    const rule
    of matching
  ) {
    if (
      rule.principal_type ===
        "user" &&
      rule.user_id
    ) {
      mergeRecipient(
        rule.user_id,
        rule,
      );

      continue;
    }

    if (
      rule.principal_type ===
        "role" &&
      rule.role
    ) {
      const role =
        normaliseRole(
          rule.role,
        );

      const list =
        roleRules.get(
          role,
        ) ?? [];

      list.push(rule);

      roleRules.set(
        role,
        list,
      );
    }
  }

  if (
    roleRules.size >
    0
  ) {
    /**
     * DYNAMIC RBAC
     *
     * This is important for newly-created TTTracker users.
     * A user does not need a matching user_roles row.
     */
    const {
      data:
        dynamicRoleData,

      error:
        dynamicRoleError,
    } = await service
      .from("roles")
      .select(
        "id,code,name",
      )
      .eq(
        "is_active",
        true,
      );

    if (
      !dynamicRoleError
    ) {
      const dynamicRoles =
        (dynamicRoleData ??
          []) as DynamicRoleIdentityRow[];

      const roleRuleEntries =
        new Map<
          string,
          TrainingReviewRuleRow[]
        >();

      const matchingRoleIds:
        string[] = [];

      for (
        const role
        of dynamicRoles
      ) {
        const roleId =
          clean(role.id);

        const keys =
          Array.from(
            new Set(
              [
                normaliseRole(
                  role.code,
                ),

                normaliseRole(
                  role.name,
                ),
              ].filter(
                (
                  value,
                ): value is string =>
                  Boolean(
                    value,
                  ),
              ),
            ),
          );

        const rulesForRole =
          keys.flatMap(
            (key) =>
              roleRules.get(
                key,
              ) ?? [],
          );

        if (
          !roleId ||
          rulesForRole.length ===
            0
        ) {
          continue;
        }

        matchingRoleIds.push(
          roleId,
        );

        roleRuleEntries.set(
          roleId,
          rulesForRole,
        );
      }

      if (
        matchingRoleIds.length >
        0
      ) {
        const {
          data:
            assignmentData,

          error:
            assignmentError,
        } = await service
          .from(
            "user_role_assignments",
          )
          .select(
            "user_id,role_id",
          )
          .in(
            "role_id",
            matchingRoleIds,
          );

        if (
          !assignmentError
        ) {
          const assignments =
            (assignmentData ??
              []) as UserRoleAssignmentRow[];

          for (
            const assignment
            of assignments
          ) {
            const userId =
              clean(
                assignment.user_id,
              );

            const roleId =
              clean(
                assignment.role_id,
              );

            const rulesForRole =
              roleRuleEntries.get(
                roleId,
              ) ?? [];

            for (
              const rule
              of rulesForRole
            ) {
              mergeRecipient(
                userId,
                rule,
              );
            }
          }
        }
      }
    }

    /**
     * LEGACY RBAC
     *
     * Retained while older TTTracker areas are being migrated.
     */
    const {
      data:
        legacyRoleData,

      error:
        roleError,
    } = await service
      .from(
        "user_roles",
      )
      .select(
        "user_id,role",
      );

    if (roleError) {
      throw new Error(
        roleError.message,
      );
    }

    const legacyRoleRows =
      (legacyRoleData ??
        []) as LegacyUserRoleRow[];

    for (
      const row
      of legacyRoleRows
    ) {
      const matchingRoleRules =
        roleRules.get(
          normaliseRole(
            row.role,
          ),
        );

      if (
        !matchingRoleRules
      ) {
        continue;
      }

      const userId =
        clean(
          row.user_id,
        );

      if (!userId) {
        continue;
      }

      for (
        const rule
        of matchingRoleRules
      ) {
        mergeRecipient(
          userId,
          rule,
        );
      }
    }
  }

  return Array.from(
    recipients.values(),
  );
}

export async function reviewerUserIdsFor(
  args: {
    service: ReturnType<
      typeof createTrainingServiceClient
    >;

    trainingTypeId:
      string;

    categoryId?:
      | string
      | null;
  },
) {
  const recipients =
    await reviewerRecipientsFor(
      args,
    );

  return recipients.map(
    (recipient) =>
      recipient.userId,
  );
}

export function trainingApiError(
  error: unknown,
) {
  const message =
    error instanceof Error
      ? error.message
      : String(
          error ?? "",
        );

  if (
    message ===
    "AUTH_REQUIRED"
  ) {
    return {
      status: 401,

      message:
        "You must be logged in to TTTracker.",
    };
  }

  if (
    message ===
    "TRAINING_FORBIDDEN"
  ) {
    return {
      status: 403,

      message:
        "You do not have permission to manage this training record.",
    };
  }

  if (
    message ===
    "REVIEW_FORBIDDEN"
  ) {
    return {
      status: 403,

      message:
        "You are not configured to review this training record.",
    };
  }

  return {
    status: 500,

    message:
      message ||
      "Unexpected Training error.",
  };
}