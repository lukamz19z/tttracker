import { NextResponse } from "next/server";

import {
  createTrainingServiceClient,
  requireTrainingUser,
  reviewerRecipientsFor,
  roleCanManageTraining,
  trainingApiError,
} from "@/lib/training/server";
import { createTrainingNotifications } from "@/lib/training/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type TrainingSettingsRow = {
  expiry_scan_enabled: boolean | null;
  default_expiry_warning_days: number[] | null;
  push_enabled: boolean | null;
  in_app_enabled: boolean | null;
};

type TrainingExpiryRecord = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  workflow_status: string | null;
  current_version: boolean | null;
  superseded_at: string | null;
  revoked_at: string | null;
};

type TrainingTypeExpiryRow = {
  id: string;
  name: string | null;
  category_id: string | null;
  expiry_warning_days: number[] | null;
};

type EmployeeNotificationRow = {
  id: string;
  full_name: string | null;
  user_id: string | null;
};

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function daysUntil(dateValue: string) {
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();

  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return Math.ceil((date.getTime() - start) / 86_400_000);
}

function chooseThreshold(days: number, configured: number[]) {
  if (days < 0) return 0;

  const thresholds = Array.from(
    new Set(
      configured
        .map(Number)
        .filter((value) => Number.isFinite(value) && value >= 0)
        .map((value) => Math.round(value)),
    ),
  ).sort((a, b) => a - b);

  return thresholds.find((threshold) => days <= threshold) ?? null;
}

function severity(days: number) {
  if (days < 0 || days <= 7) return "critical" as const;
  if (days <= 30) return "warning" as const;
  return "info" as const;
}

async function authorisedService(request: Request) {
  const cronSecret = clean(process.env.CRON_SECRET);
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.replace(/^Bearer\s+/i, "").trim();

  if (cronSecret && supplied === cronSecret) {
    return createTrainingServiceClient();
  }

  const { service, identity } = await requireTrainingUser(request);

  if (!roleCanManageTraining(identity.role)) {
    throw new Error("TRAINING_FORBIDDEN");
  }

  return service;
}

async function runScan(request: Request) {
  const service = await authorisedService(request);

  const { data: settings, error: settingsError } = await service
    .from("training_settings")
    .select(
      "expiry_scan_enabled,default_expiry_warning_days,push_enabled,in_app_enabled",
    )
    .eq("id", true)
    .maybeSingle();

  if (settingsError) throw new Error(settingsError.message);

  const settingsRow = (settings ?? null) as TrainingSettingsRow | null;

  if (settingsRow?.expiry_scan_enabled === false) {
    return NextResponse.json({
      success: true,
      scanned: 0,
      notifications: 0,
      message: "Expiry scanning is disabled.",
    });
  }

  const defaultThresholds = Array.isArray(
    settingsRow?.default_expiry_warning_days,
  )
    ? settingsRow.default_expiry_warning_days
    : [90, 60, 30, 14, 7];

  const { data: records, error: recordError } = await service
    .from("employee_training_records")
    .select(
      "id,employee_id,training_type_id,training_name,expiry_date,does_not_expire,workflow_status,current_version,superseded_at,revoked_at",
    )
    .eq("workflow_status", "approved")
    .eq("current_version", true)
    .is("superseded_at", null)
    .is("revoked_at", null)
    .not("expiry_date", "is", null);

  if (recordError) throw new Error(recordError.message);

  const recordRows = (records ?? []) as TrainingExpiryRecord[];

  const typeIds = Array.from(
    new Set(
      recordRows
        .map((record) => clean(record.training_type_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const employeeIds = Array.from(
    new Set(
      recordRows
        .map((record) => clean(record.employee_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  let typeRows: TrainingTypeExpiryRow[] = [];

  if (typeIds.length > 0) {
    const { data: typeData, error: typeError } = await service
      .from("training_types")
      .select("id,name,category_id,expiry_warning_days")
      .in("id", typeIds);

    if (typeError) throw new Error(typeError.message);

    typeRows = (typeData ?? []) as TrainingTypeExpiryRow[];
  }

  let employeeRows: EmployeeNotificationRow[] = [];

  if (employeeIds.length > 0) {
    const { data: employeeData, error: employeeError } = await service
      .from("employees")
      .select("id,full_name,user_id")
      .in("id", employeeIds);

    if (employeeError) throw new Error(employeeError.message);

    employeeRows = (employeeData ?? []) as EmployeeNotificationRow[];
  }

  const typeById = new Map<string, TrainingTypeExpiryRow>(
    typeRows.map((type) => [type.id, type]),
  );

  const employeeById = new Map<string, EmployeeNotificationRow>(
    employeeRows.map((employee) => [employee.id, employee]),
  );

  let notifications = 0;
  let examined = 0;

  for (const record of recordRows) {
    if (record.does_not_expire || !record.expiry_date) continue;

    const days = daysUntil(record.expiry_date);
    if (days === null) continue;

    const trainingTypeId = clean(record.training_type_id);
    const type = trainingTypeId
      ? typeById.get(trainingTypeId)
      : undefined;
    const thresholds = Array.isArray(type?.expiry_warning_days)
      ? type.expiry_warning_days
      : defaultThresholds;

    const threshold = chooseThreshold(days, thresholds);
    if (threshold === null) continue;

    examined += 1;

    const eventKey = `${record.id}:expiry:${threshold}`;
    const { data: existing } = await service
      .from("training_notification_events")
      .select("id")
      .eq("event_key", eventKey)
      .maybeSingle();

    if (existing) continue;

    const employee = employeeById.get(record.employee_id);
    const trainingName =
      clean(type?.name) || clean(record.training_name) || "Training record";

    const title =
      days < 0
        ? "Training qualification expired"
        : "Training qualification due for renewal";

    const message =
      days < 0
        ? `${trainingName} for ${employee?.full_name || "an employee"} expired ${Math.abs(
            days,
          )} day${Math.abs(days) === 1 ? "" : "s"} ago.`
        : `${trainingName} for ${employee?.full_name || "an employee"} expires in ${days} day${
            days === 1 ? "" : "s"
          }.`;

    const { error: eventError } = await service
      .from("training_notification_events")
      .insert({
        event_key: eventKey,
        training_record_id: record.id,
        employee_id: record.employee_id,
        event_type:
          days < 0 ? "training_expired" : "training_expiring",
        threshold_days: threshold,
      });

    // Another concurrent scan may have inserted the same event first.
    if (eventError) {
      const code = clean((eventError as SupabaseErrorLike).code);
      if (code === "23505") continue;
      throw new Error(eventError.message);
    }

    if (employee?.user_id) {
      await createTrainingNotifications({
        service,
        userIds: [employee.user_id],
        eventType:
          days < 0 ? "training_expired" : "training_expiring",
        title,
        message:
          days < 0
            ? `${trainingName} has expired. Upload renewed evidence when available.`
            : `${trainingName} expires in ${days} day${
                days === 1 ? "" : "s"
              }. Plan the renewal now.`,
        severity: severity(days),
        actionRoute: "/profile",
        actionParams: {
          training_record_id: record.id,
          expiry_date: record.expiry_date,
          days_remaining: days,
        },
        sourceRecordId: record.id,
      });

      notifications += 1;
    }

    let reviewerRecipients = trainingTypeId
      ? await reviewerRecipientsFor({
          service,
          trainingTypeId,
          categoryId: clean(type?.category_id) || null,
        })
      : [];

    reviewerRecipients = reviewerRecipients.filter(
      (recipient) => recipient.userId !== employee?.user_id,
    );

    const reviewerIds = reviewerRecipients.map(
      (recipient) => recipient.userId,
    );
    const reviewerInAppIds = reviewerRecipients
      .filter((recipient) => recipient.receivesInApp)
      .map((recipient) => recipient.userId);
    const reviewerPushIds = reviewerRecipients
      .filter((recipient) => recipient.receivesPush)
      .map((recipient) => recipient.userId);

    if (reviewerIds.length > 0) {
      await createTrainingNotifications({
        service,
        userIds: reviewerIds,
        inAppUserIds: reviewerInAppIds,
        pushUserIds: reviewerPushIds,
        eventType:
          days < 0 ? "training_expired" : "training_expiring",
        title,
        message,
        severity: severity(days),
        actionRoute: "/people/training/renewals",
        actionParams: {
          training_record_id: record.id,
          employee_id: record.employee_id,
          expiry_date: record.expiry_date,
          days_remaining: days,
        },
        sourceRecordId: record.id,
      });

      notifications += reviewerIds.length;
    }
  }

  return NextResponse.json({
    success: true,
    scanned: recordRows.length,
    matchedThreshold: examined,
    notifications,
  });
}

export async function GET(request: Request) {
  try {
    return await runScan(request);
  } catch (error) {
    const apiError = trainingApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
