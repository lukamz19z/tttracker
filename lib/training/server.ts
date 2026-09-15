import { createClient, type User } from "@supabase/supabase-js";

type EmployeeIdentityRow = {
  id: string;
  full_name: string | null;
  user_id: string | null;
  active: boolean | null;
};

type UserRoleRow = {
  user_id: string | null;
  role: string | null;
};

type TrainingReviewRuleRow = {
  scope_type: string | null;
  category_id: string | null;
  training_type_id: string | null;
  principal_type: string | null;
  user_id: string | null;
  role: string | null;
  can_review: boolean | null;
  receives_in_app?: boolean | null;
  receives_push?: boolean | null;
  receives_email?: boolean | null;
  active: boolean | null;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function createTrainingServiceClient() {
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
  return clean(value).toLowerCase().replace(/\s+/g, "_");
}

export type TrainingIdentity = {
  userId: string;
  employeeId: string | null;
  name: string;
  email: string;
  role: string;
};

async function identityForUser(
  service: ReturnType<typeof createTrainingServiceClient>,
  user: User,
): Promise<TrainingIdentity> {
  const [
    { data: employeeData, error: employeeError },
    { data: roleData, error: roleError },
  ] = await Promise.all([
    service
      .from("employees")
      .select("id,full_name,user_id,active")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("user_roles")
      .select("user_id,role")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  if (roleError) {
    throw new Error(roleError.message);
  }

  const employee =
    (employeeData ?? null) as EmployeeIdentityRow | null;
  const roleRow = (roleData ?? null) as UserRoleRow | null;

  const email = clean(user.email).toLowerCase();
  const metadataName = clean(
    user.user_metadata?.full_name || user.user_metadata?.name,
  );

  return {
    userId: user.id,
    employeeId: clean(employee?.id) || null,
    name:
      clean(employee?.full_name) ||
      metadataName ||
      email ||
      "TTTracker User",
    email,
    role: normaliseRole(roleRow?.role || "user"),
  };
}

export async function requireTrainingUser(request: Request) {
  const authorization =
    request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("AUTH_REQUIRED");
  }

  const service = createTrainingServiceClient();

  const {
    data: { user },
    error,
  } = await service.auth.getUser(token);

  if (error || !user) {
    throw new Error("AUTH_REQUIRED");
  }

  const identity = await identityForUser(service, user);

  return {
    service,
    user,
    identity,
  };
}

export function roleCanManageTraining(role: string) {
  return [
    "admin",
    "administrator",
    "site_admin",
    "hseq",
    "safety",
    "safety_officer",
  ].includes(normaliseRole(role));
}

export async function userCanReviewTraining({
  service,
  identity,
  trainingTypeId,
  categoryId,
}: {
  service: ReturnType<typeof createTrainingServiceClient>;
  identity: TrainingIdentity;
  trainingTypeId?: string | null;
  categoryId?: string | null;
}) {
  if (roleCanManageTraining(identity.role)) {
    return true;
  }

  const { data: ruleData, error } = await service
    .from("training_review_rules")
    .select(
      "scope_type,category_id,training_type_id,principal_type,user_id,role,can_review,active",
    )
    .eq("active", true)
    .eq("can_review", true);

  if (error) {
    throw new Error(error.message);
  }

  const rules =
    (ruleData ?? []) as TrainingReviewRuleRow[];

  return rules.some((rule) => {
    const principalMatches =
      (rule.principal_type === "user" &&
        rule.user_id === identity.userId) ||
      (rule.principal_type === "role" &&
        normaliseRole(rule.role) === identity.role);

    if (!principalMatches) {
      return false;
    }

    if (rule.scope_type === "type") {
      return (
        Boolean(trainingTypeId) &&
        rule.training_type_id === trainingTypeId
      );
    }

    if (rule.scope_type === "category") {
      return (
        Boolean(categoryId) &&
        rule.category_id === categoryId
      );
    }

    return true;
  });
}

export async function assertCanSubmitForEmployee({
  service,
  identity,
  employeeId,
}: {
  service: ReturnType<typeof createTrainingServiceClient>;
  identity: TrainingIdentity;
  employeeId: string;
}) {
  if (identity.employeeId === employeeId) {
    return;
  }

  if (roleCanManageTraining(identity.role)) {
    return;
  }

  const { data: ruleData, error } = await service
    .from("training_review_rules")
    .select(
      "scope_type,category_id,training_type_id,principal_type,user_id,role,can_review,active",
    )
    .eq("active", true)
    .eq("can_review", true);

  if (error) {
    throw new Error(error.message);
  }

  const rules =
    (ruleData ?? []) as TrainingReviewRuleRow[];

  const configuredReviewer = rules.some(
    (rule) =>
      (rule.principal_type === "user" &&
        rule.user_id === identity.userId) ||
      (rule.principal_type === "role" &&
        normaliseRole(rule.role) === identity.role),
  );

  if (!configuredReviewer) {
    throw new Error("TRAINING_FORBIDDEN");
  }
}

export type TrainingReviewerRecipient = {
  userId: string;
  receivesInApp: boolean;
  receivesPush: boolean;
  receivesEmail: boolean;
};

export async function reviewerRecipientsFor({
  service,
  trainingTypeId,
  categoryId,
}: {
  service: ReturnType<typeof createTrainingServiceClient>;
  trainingTypeId: string;
  categoryId?: string | null;
}): Promise<TrainingReviewerRecipient[]> {
  const { data: ruleData, error } = await service
    .from("training_review_rules")
    .select(
      "scope_type,category_id,training_type_id,principal_type,user_id,role,can_review,receives_in_app,receives_push,receives_email,active",
    )
    .eq("active", true)
    .eq("can_review", true);

  if (error) {
    throw new Error(error.message);
  }

  const rules =
    (ruleData ?? []) as TrainingReviewRuleRow[];

  const matching = rules.filter((rule) => {
    if (rule.scope_type === "type") {
      return rule.training_type_id === trainingTypeId;
    }

    if (rule.scope_type === "category") {
      return (
        Boolean(categoryId) &&
        rule.category_id === categoryId
      );
    }

    return true;
  });

  const recipients =
    new Map<string, TrainingReviewerRecipient>();

  const roleRules =
    new Map<string, TrainingReviewRuleRow[]>();

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

    const current = recipients.get(userId) ?? {
      userId,
      receivesInApp: false,
      receivesPush: false,
      receivesEmail: false,
    };

    current.receivesInApp =
      current.receivesInApp ||
      rule.receives_in_app !== false;

    current.receivesPush =
      current.receivesPush ||
      rule.receives_push !== false;

    current.receivesEmail =
      current.receivesEmail ||
      rule.receives_email === true;

    recipients.set(userId, current);
  }

  for (const rule of matching) {
    if (
      rule.principal_type === "user" &&
      clean(rule.user_id)
    ) {
      mergeRecipient(clean(rule.user_id), rule);
      continue;
    }

    if (
      rule.principal_type === "role" &&
      clean(rule.role)
    ) {
      const role = normaliseRole(rule.role);
      const list = roleRules.get(role) ?? [];

      list.push(rule);
      roleRules.set(role, list);
    }
  }

  if (roleRules.size > 0) {
    const { data: roleData, error: roleError } =
      await service
        .from("user_roles")
        .select("user_id,role");

    if (roleError) {
      throw new Error(roleError.message);
    }

    const roleRows =
      (roleData ?? []) as UserRoleRow[];

    for (const row of roleRows) {
      const role = normaliseRole(row.role);
      const matchingRoleRules = roleRules.get(role);

      if (!matchingRoleRules) {
        continue;
      }

      const userId = clean(row.user_id);

      if (!userId) {
        continue;
      }

      for (const rule of matchingRoleRules) {
        mergeRecipient(userId, rule);
      }
    }
  }

  return Array.from(recipients.values());
}

export async function reviewerUserIdsFor(args: {
  service: ReturnType<typeof createTrainingServiceClient>;
  trainingTypeId: string;
  categoryId?: string | null;
}) {
  const recipients = await reviewerRecipientsFor(args);

  return recipients.map(
    (recipient) => recipient.userId,
  );
}

export function trainingApiError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : String(error ?? "");

  if (message === "AUTH_REQUIRED") {
    return {
      status: 401,
      message: "You must be logged in to TTTracker.",
    };
  }

  if (message === "TRAINING_FORBIDDEN") {
    return {
      status: 403,
      message:
        "You do not have permission to manage this training record.",
    };
  }

  if (message === "REVIEW_FORBIDDEN") {
    return {
      status: 403,
      message:
        "You are not configured to review this training record.",
    };
  }

  return {
    status: 500,
    message: message || "Unexpected Training error.",
  };
}
