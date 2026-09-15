export type TrainingComplianceStatus =
  | "current"
  | "expiring"
  | "expired"
  | "missing"
  | "pending_review"
  | "revoked"
  | "not_required";

export type TrainingEmployeeLike = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  user_id?: string | null;
};

export type TrainingRecordLike = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  workflow_status?: string | null;
  record_status?: string | null;
  current_version?: boolean | null;
  superseded_at?: string | null;
  revoked_at?: string | null;
  does_not_expire?: boolean | null;
  expiry_date?: string | null;
  issue_date?: string | null;
  created_at?: string | null;
  option_codes?: string[] | null;
};

export type TrainingRequirementLike = {
  id?: string;
  training_type_id: string;
  requirement_level?: "mandatory" | "recommended" | string | null;
  renewal_lead_days?: number | null;
  accepted_alternative_training_type_ids?: string[] | null;
  required_option_codes?: string[] | null;
  active?: boolean | null;
};

export type RoleTrainingRequirementLike = TrainingRequirementLike & {
  role_name: string;
};

export type ProjectTrainingRequirementLike = TrainingRequirementLike & {
  project_id: string;
  applies_to_role?: string | null;
};

export type EvaluatedTrainingRequirement = {
  status: TrainingComplianceStatus;
  record: TrainingRecordLike | null;
  matchedTrainingTypeId: string | null;
  daysRemaining: number | null;
  requiredTrainingTypeId: string;
  acceptedTrainingTypeIds: string[];
  requirementLevel: string;
  requiredOptionCodes: string[];
};

const DAY_MS = 86_400_000;

export function cleanTrainingValue(value: unknown) {
  return String(value ?? "").trim();
}

export function normaliseTrainingRole(value: unknown) {
  return cleanTrainingValue(value)
    .toLowerCase()
    .replaceAll("-", "_")
    .replace(/\s+/g, "_");
}

export function parseTrainingDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function trainingDaysUntil(
  value?: string | null,
  fromDate = new Date(),
) {
  const expiry = parseTrainingDate(value);
  if (!expiry) return null;

  const fromUtc = Date.UTC(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
  );
  const toUtc = Date.UTC(
    expiry.getFullYear(),
    expiry.getMonth(),
    expiry.getDate(),
  );

  return Math.ceil((toUtc - fromUtc) / DAY_MS);
}

function recordWorkflow(record: TrainingRecordLike) {
  return cleanTrainingValue(record.workflow_status).toLowerCase();
}

function recordStatus(record: TrainingRecordLike) {
  return cleanTrainingValue(record.record_status).toLowerCase();
}

export function isTrainingRecordPending(record: TrainingRecordLike) {
  return ["pending_review", "changes_required"].includes(
    recordWorkflow(record),
  );
}

export function isTrainingRecordApproved(record: TrainingRecordLike) {
  if (record.current_version === false) return false;
  if (record.superseded_at) return false;
  if (record.revoked_at) return false;

  const workflow = recordWorkflow(record);

  if (workflow) return workflow === "approved";

  // Compatibility with records created before the controlled workflow was
  // introduced. The migration stamps historical records approved, but this
  // fallback prevents an older row from disappearing if that migration was
  // applied incrementally.
  return ["current", "expired", "approved"].includes(recordStatus(record));
}

function hasRequiredOptionCodes(
  record: TrainingRecordLike,
  requiredOptionCodes: string[],
) {
  if (requiredOptionCodes.length === 0) return true;

  const available = new Set(
    (record.option_codes ?? [])
      .map((code) => cleanTrainingValue(code).toUpperCase())
      .filter(Boolean),
  );

  return requiredOptionCodes.every((code) =>
    available.has(cleanTrainingValue(code).toUpperCase()),
  );
}

function recordSortValue(record: TrainingRecordLike) {
  if (record.does_not_expire) return Number.MAX_SAFE_INTEGER;

  const expiry = parseTrainingDate(record.expiry_date);
  if (expiry) return expiry.getTime();

  const issue = parseTrainingDate(record.issue_date);
  if (issue) return issue.getTime();

  const created = record.created_at
    ? new Date(record.created_at).getTime()
    : 0;

  return Number.isFinite(created) ? created : 0;
}

export function evaluateTrainingRequirement({
  employeeId,
  requirement,
  records,
  defaultLeadDays = 60,
}: {
  employeeId: string;
  requirement: TrainingRequirementLike;
  records: TrainingRecordLike[];
  defaultLeadDays?: number;
}): EvaluatedTrainingRequirement {
  const alternativeIds =
    requirement.accepted_alternative_training_type_ids ?? [];

  const acceptedTrainingTypeIds = Array.from(
    new Set(
      [requirement.training_type_id, ...alternativeIds]
        .map(cleanTrainingValue)
        .filter(Boolean),
    ),
  );

  const acceptedSet = new Set(acceptedTrainingTypeIds);
  const requiredOptionCodes = (requirement.required_option_codes ?? [])
    .map((code) => cleanTrainingValue(code).toUpperCase())
    .filter(Boolean);

  const matching = records.filter(
    (record) =>
      record.employee_id === employeeId &&
      Boolean(record.training_type_id) &&
      acceptedSet.has(cleanTrainingValue(record.training_type_id)),
  );

  const approved = matching
    .filter(isTrainingRecordApproved)
    .filter((record) =>
      hasRequiredOptionCodes(record, requiredOptionCodes),
    )
    .sort((a, b) => recordSortValue(b) - recordSortValue(a));

  const leadDays =
    Number.isFinite(Number(requirement.renewal_lead_days)) &&
    Number(requirement.renewal_lead_days) >= 0
      ? Number(requirement.renewal_lead_days)
      : defaultLeadDays;

  if (approved.length > 0) {
    const record = approved[0];

    if (record.does_not_expire || !record.expiry_date) {
      return {
        status: "current",
        record,
        matchedTrainingTypeId: record.training_type_id,
        daysRemaining: null,
        requiredTrainingTypeId: requirement.training_type_id,
        acceptedTrainingTypeIds,
        requirementLevel: cleanTrainingValue(
          requirement.requirement_level || "mandatory",
        ),
        requiredOptionCodes,
      };
    }

    const daysRemaining = trainingDaysUntil(record.expiry_date);

    if (daysRemaining !== null && daysRemaining < 0) {
      return {
        status: "expired",
        record,
        matchedTrainingTypeId: record.training_type_id,
        daysRemaining,
        requiredTrainingTypeId: requirement.training_type_id,
        acceptedTrainingTypeIds,
        requirementLevel: cleanTrainingValue(
          requirement.requirement_level || "mandatory",
        ),
        requiredOptionCodes,
      };
    }

    if (daysRemaining !== null && daysRemaining <= leadDays) {
      return {
        status: "expiring",
        record,
        matchedTrainingTypeId: record.training_type_id,
        daysRemaining,
        requiredTrainingTypeId: requirement.training_type_id,
        acceptedTrainingTypeIds,
        requirementLevel: cleanTrainingValue(
          requirement.requirement_level || "mandatory",
        ),
        requiredOptionCodes,
      };
    }

    return {
      status: "current",
      record,
      matchedTrainingTypeId: record.training_type_id,
      daysRemaining,
      requiredTrainingTypeId: requirement.training_type_id,
      acceptedTrainingTypeIds,
      requirementLevel: cleanTrainingValue(
        requirement.requirement_level || "mandatory",
      ),
      requiredOptionCodes,
    };
  }

  const pending = matching
    .filter(isTrainingRecordPending)
    .filter((record) =>
      hasRequiredOptionCodes(record, requiredOptionCodes),
    );

  if (pending.length > 0) {
    return {
      status: "pending_review",
      record: pending[0],
      matchedTrainingTypeId: pending[0].training_type_id,
      daysRemaining: null,
      requiredTrainingTypeId: requirement.training_type_id,
      acceptedTrainingTypeIds,
      requirementLevel: cleanTrainingValue(
        requirement.requirement_level || "mandatory",
      ),
      requiredOptionCodes,
    };
  }

  const revoked = matching.find((record) => Boolean(record.revoked_at));

  return {
    status: revoked ? "revoked" : "missing",
    record: revoked ?? null,
    matchedTrainingTypeId: revoked?.training_type_id ?? null,
    daysRemaining: null,
    requiredTrainingTypeId: requirement.training_type_id,
    acceptedTrainingTypeIds,
    requirementLevel: cleanTrainingValue(
      requirement.requirement_level || "mandatory",
    ),
    requiredOptionCodes,
  };
}

export function roleRequirementsForEmployee({
  employee,
  requirements,
}: {
  employee: TrainingEmployeeLike;
  requirements: RoleTrainingRequirementLike[];
}) {
  const role = normaliseTrainingRole(employee.role);

  return requirements.filter(
    (requirement) =>
      requirement.active !== false &&
      normaliseTrainingRole(requirement.role_name) === role,
  );
}

export function projectRequirementsForEmployee({
  employee,
  projectId,
  requirements,
}: {
  employee: TrainingEmployeeLike;
  projectId: string;
  requirements: ProjectTrainingRequirementLike[];
}) {
  const role = normaliseTrainingRole(employee.role);

  return requirements.filter((requirement) => {
    if (requirement.active === false) return false;
    if (requirement.project_id !== projectId) return false;

    const requiredRole = normaliseTrainingRole(
      requirement.applies_to_role,
    );

    return !requiredRole || requiredRole === role;
  });
}

export function combinedRequirementsForEmployee({
  employee,
  projectId,
  roleRequirements,
  projectRequirements,
}: {
  employee: TrainingEmployeeLike;
  projectId?: string | null;
  roleRequirements: RoleTrainingRequirementLike[];
  projectRequirements: ProjectTrainingRequirementLike[];
}) {
  const combined = [
    ...roleRequirementsForEmployee({
      employee,
      requirements: roleRequirements,
    }),
    ...(projectId
      ? projectRequirementsForEmployee({
          employee,
          projectId,
          requirements: projectRequirements,
        })
      : []),
  ];

  const merged = new Map<string, TrainingRequirementLike>();

  for (const requirement of combined) {
    const current = merged.get(requirement.training_type_id);

    if (!current) {
      merged.set(requirement.training_type_id, {
        ...requirement,
        accepted_alternative_training_type_ids: Array.from(
          new Set(
            requirement.accepted_alternative_training_type_ids ?? [],
          ),
        ),
        required_option_codes: Array.from(
          new Set(requirement.required_option_codes ?? []),
        ),
      });
      continue;
    }

    merged.set(requirement.training_type_id, {
      ...current,
      requirement_level:
        current.requirement_level === "mandatory" ||
        requirement.requirement_level === "mandatory"
          ? "mandatory"
          : current.requirement_level || requirement.requirement_level,
      renewal_lead_days: Math.max(
        Number(current.renewal_lead_days ?? 0),
        Number(requirement.renewal_lead_days ?? 0),
      ),
      accepted_alternative_training_type_ids: Array.from(
        new Set([
          ...(current.accepted_alternative_training_type_ids ?? []),
          ...(requirement.accepted_alternative_training_type_ids ?? []),
        ]),
      ),
      required_option_codes: Array.from(
        new Set([
          ...(current.required_option_codes ?? []),
          ...(requirement.required_option_codes ?? []),
        ]),
      ),
    });
  }

  return Array.from(merged.values());
}

export function matrixStatusForTrainingType({
  employeeId,
  trainingTypeId,
  records,
  leadDays = 60,
  required = false,
}: {
  employeeId: string;
  trainingTypeId: string;
  records: TrainingRecordLike[];
  leadDays?: number;
  required?: boolean;
}): EvaluatedTrainingRequirement {
  const matching = records.filter(
    (record) =>
      record.employee_id === employeeId &&
      record.training_type_id === trainingTypeId,
  );

  if (!required && matching.length === 0) {
    return {
      status: "not_required",
      record: null,
      matchedTrainingTypeId: null,
      daysRemaining: null,
      requiredTrainingTypeId: trainingTypeId,
      acceptedTrainingTypeIds: [trainingTypeId],
      requirementLevel: "not_required",
      requiredOptionCodes: [],
    };
  }

  return evaluateTrainingRequirement({
    employeeId,
    requirement: {
      training_type_id: trainingTypeId,
      requirement_level: required ? "mandatory" : "recorded",
      renewal_lead_days: leadDays,
    },
    records,
    defaultLeadDays: leadDays,
  });
}

export function isCompliantTrainingStatus(
  status: TrainingComplianceStatus,
) {
  return status === "current" || status === "expiring";
}

export function isBlockingTrainingStatus(
  status: TrainingComplianceStatus,
) {
  return ["expired", "missing", "revoked"].includes(status);
}

export function trainingComplianceLabel(
  status: TrainingComplianceStatus,
) {
  switch (status) {
    case "current":
      return "Current";
    case "expiring":
      return "Expiring";
    case "expired":
      return "Expired";
    case "missing":
      return "Missing";
    case "pending_review":
      return "Pending Review";
    case "revoked":
      return "Revoked";
    case "not_required":
      return "Not Required";
  }
}
