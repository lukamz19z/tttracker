import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  assertCanSubmitForEmployee,
  requireTrainingUser,
  reviewerRecipientsFor,
  roleCanManageTraining,
  trainingApiError,
} from "@/lib/training/server";
import { ensureEmployeeBaseTrainingFolder, publishApprovedTrainingRecord } from "@/lib/training/sharepoint";
import { createTrainingNotifications } from "@/lib/training/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrainingService = Awaited<
  ReturnType<typeof requireTrainingUser>
>["service"];

type UserRoleRow = {
  user_id: string | null;
  role: string | null;
};

function clean(value: FormDataEntryValue | string | null | undefined) {
  return String(value ?? "").trim();
}

function parseStringArray(value: FormDataEntryValue | null) {
  if (!value) return [] as string[];

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function parseJsonObject(value: FormDataEntryValue | null) {
  if (!value) return {} as Record<string, unknown>;

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function addInterval(
  issueDate: string,
  value: number | null,
  unit: string | null,
) {
  if (!issueDate || !value || value <= 0 || !unit) return null;

  const date = new Date(`${issueDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  if (unit === "days") date.setDate(date.getDate() + value);
  if (unit === "weeks") date.setDate(date.getDate() + value * 7);
  if (unit === "months") date.setMonth(date.getMonth() + value);
  if (unit === "years") date.setFullYear(date.getFullYear() + value);

  return date.toISOString().slice(0, 10);
}

function fileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function safeBase(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function fallbackFilename({
  employeeName,
  trainingCode,
  side,
  expiryDate,
  originalName,
}: {
  employeeName: string;
  trainingCode: string;
  side?: string | null;
  expiryDate?: string | null;
  originalName: string;
}) {
  const extension = fileExtension(originalName) || "pdf";
  const datePart = expiryDate ? `_${expiryDate}` : "";
  const sidePart = side ? `_${side}` : "";

  return `${safeBase(employeeName)}_${safeBase(trainingCode || "TRAINING")}${datePart}${sidePart}.${extension}`;
}

function recordStatusFor(expiryDate: string | null, doesNotExpire: boolean) {
  if (doesNotExpire || !expiryDate) return "current";

  const expiry = new Date(`${expiryDate}T23:59:59`);
  if (Number.isNaN(expiry.getTime())) return "current";

  return expiry.getTime() < Date.now() ? "expired" : "current";
}

async function configuredFilename({
  service,
  employeeId,
  trainingTypeId,
  classCodes,
  expiryDate,
  side,
  originalName,
  fallback,
}: {
  service: TrainingService;
  employeeId: string;
  trainingTypeId: string;
  classCodes: string[];
  expiryDate: string | null;
  side: string;
  originalName: string;
  fallback: string;
}) {
  const extension = fileExtension(originalName) || "pdf";

  try {
    const { data, error } = await service.rpc(
      "generate_training_document_filename",
      {
        p_employee_id: employeeId,
        p_training_type_id: trainingTypeId,
        p_class_codes: classCodes,
        p_expiry_date: expiryDate,
        p_document_side: side === "other" ? null : side,
        p_extension: extension,
      },
    );

    if (!error && clean(data)) return clean(data);
  } catch {
    // Keep compatibility if the filename RPC is not present yet.
  }

  return fallback;
}

async function reviewerFallbackIds(
  service: TrainingService,
): Promise<string[]> {
  const { data, error } = await service
    .from("user_roles")
    .select("user_id,role");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as UserRoleRow[];

  return rows
    .filter((row) =>
      [
        "admin",
        "administrator",
        "site_admin",
        "hseq",
        "safety",
        "safety_officer",
        "training_officer",
        "training_admin",
      ].includes(clean(row.role).toLowerCase()),
    )
    .map((row) => clean(row.user_id))
    .filter((userId) => Boolean(userId));
}

async function stageFile({
  service,
  bucket,
  recordId,
  employeeId,
  file,
  generatedFileName,
  documentSide,
  sequence,
  uploadedBy,
}: {
  service: TrainingService;
  bucket: string;
  recordId: string;
  employeeId: string;
  file: File;
  generatedFileName: string;
  documentSide: string;
  sequence: number;
  uploadedBy: string;
}) {
  const content = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(content).digest("hex");
  const extension = fileExtension(generatedFileName) || fileExtension(file.name);
  const stagingPath = `${employeeId}/${recordId}/${sequence}-${generatedFileName}`;

  const { error: uploadError } = await service.storage
    .from(bucket)
    .upload(stagingPath, content, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data: document, error: documentError } = await service
    .from("employee_training_documents")
    .insert({
      training_record_id: recordId,
      document_type_name: "Training Document",
      document_type_code: "TRAINING_EVIDENCE",
      document_side: documentSide,
      document_label:
        documentSide === "front"
          ? "Front"
          : documentSide === "back"
            ? "Back"
            : "Document",
      sequence_number: sequence,
      original_file_name: file.name,
      source_file_name: file.name,
      generated_file_name: generatedFileName,
      file_extension: extension || null,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      file_hash_sha256: hash,
      staging_bucket: bucket,
      staging_path: stagingPath,
      active: true,
      uploaded_by: uploadedBy,
    })
    .select("id,staging_path")
    .single();

  if (documentError) {
    await service.storage.from(bucket).remove([stagingPath]);
    throw new Error(documentError.message);
  }

  return document;
}

export async function POST(request: Request) {
  const stagedPaths: string[] = [];
  let createdRecordId: string | null = null;
  let stagingBucket = "training-staging";
  let service: TrainingService | null = null;

  try {
    const auth = await requireTrainingUser(request);
    service = auth.service;
    const { identity } = auth;

    const form = await request.formData();

    const employeeId = clean(form.get("employeeId"));
    const trainingTypeId = clean(form.get("trainingTypeId"));
    const projectId = clean(form.get("projectId")) || null;
    const issuer = clean(form.get("issuer"));
    const certificateNumber = clean(form.get("certificateNumber"));
    const issueDate = clean(form.get("issueDate")) || null;
    let expiryDate = clean(form.get("expiryDate")) || null;
    const notes = clean(form.get("notes")) || null;
    const metadata = parseJsonObject(form.get("metadata"));
    const selectedOptionIds = parseStringArray(form.get("selectedOptionIds"));
    const selectedOptionCodes = parseStringArray(form.get("selectedOptionCodes"));
    const replacementMode = clean(form.get("replacementMode")) || "none";
    const supersedesRecordId = clean(form.get("supersedesRecordId")) || null;

    if (!employeeId) {
      return NextResponse.json(
        { error: "Select an employee." },
        { status: 400 },
      );
    }

    if (!trainingTypeId) {
      return NextResponse.json(
        { error: "Select a training type." },
        { status: 400 },
      );
    }

    await assertCanSubmitForEmployee({
      service,
      identity,
      employeeId,
    });

    const [
      { data: employee, error: employeeError },
      { data: trainingType, error: typeError },
      { data: settings, error: settingsError },
    ] = await Promise.all([
      service
        .from("employees")
        .select("id,payroll_id,full_name,user_id,active,sharepoint_drive_id,sharepoint_folder_id,sharepoint_web_url,sharepoint_folder_name")
        .eq("id", employeeId)
        .maybeSingle(),
      service
        .from("training_types")
        .select("*")
        .eq("id", trainingTypeId)
        .eq("active", true)
        .maybeSingle(),
      service
        .from("training_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle(),
    ]);

    if (employeeError) throw new Error(employeeError.message);
    if (typeError) throw new Error(typeError.message);
    if (settingsError) throw new Error(settingsError.message);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee profile could not be found." },
        { status: 404 },
      );
    }

    if (!trainingType) {
      return NextResponse.json(
        { error: "Training type could not be found or is inactive." },
        { status: 404 },
      );
    }

    if (trainingType.requires_project && !projectId) {
      return NextResponse.json(
        { error: "A project is required for this training type." },
        { status: 400 },
      );
    }

    if (trainingType.requires_issuer && !issuer) {
      return NextResponse.json(
        { error: "Enter the issuing organisation." },
        { status: 400 },
      );
    }

    if (trainingType.requires_certificate_number && !certificateNumber) {
      return NextResponse.json(
        { error: "Enter the certificate or licence number." },
        { status: 400 },
      );
    }

    if (trainingType.requires_issue_date && !issueDate) {
      return NextResponse.json(
        { error: "Enter the issue date." },
        { status: 400 },
      );
    }

    const validityMode = clean(trainingType.validity_mode) || "manual";

    if (validityMode === "automatic" && issueDate && !expiryDate) {
      expiryDate = addInterval(
        issueDate,
        Number(trainingType.validity_interval_value ?? 0) || null,
        clean(trainingType.validity_interval_unit) || null,
      );
    }

    const doesNotExpire =
      validityMode === "never" || Boolean(trainingType.allows_no_expiry);

    if (
      validityMode !== "never" &&
      trainingType.requires_expiry_date &&
      !expiryDate
    ) {
      return NextResponse.json(
        { error: "Enter an expiry date." },
        { status: 400 },
      );
    }

    if (supersedesRecordId) {
      const { data: replacement, error: replacementError } = await service
        .from("employee_training_records")
        .select("id,employee_id,training_type_id,superseded_at")
        .eq("id", supersedesRecordId)
        .maybeSingle();

      if (replacementError) throw new Error(replacementError.message);

      if (
        !replacement ||
        replacement.employee_id !== employeeId ||
        replacement.training_type_id !== trainingTypeId ||
        replacement.superseded_at
      ) {
        return NextResponse.json(
          { error: "The record selected for replacement is not valid." },
          { status: 409 },
        );
      }
    }

    if (
      replacementMode === "add" &&
      !trainingType.allows_multiple_current
    ) {
      return NextResponse.json(
        {
          error:
            "This training type does not allow multiple current records. Select the record being replaced.",
        },
        { status: 409 },
      );
    }

    const singleFile = form.get("file");
    const frontFile = form.get("frontFile");
    const backFile = form.get("backFile");

    const actualFiles: Array<{
      file: File;
      side: string;
      requestedName: string;
    }> = [];

    if (singleFile instanceof File && singleFile.size > 0) {
      actualFiles.push({
        file: singleFile,
        side: "other",
        requestedName: clean(form.get("generatedFilename")),
      });
    }

    if (frontFile instanceof File && frontFile.size > 0) {
      actualFiles.push({
        file: frontFile,
        side: "front",
        requestedName: clean(form.get("generatedFrontFilename")),
      });
    }

    if (backFile instanceof File && backFile.size > 0) {
      actualFiles.push({
        file: backFile,
        side: "back",
        requestedName: clean(form.get("generatedBackFilename")),
      });
    }

    const uploadType =
      clean(form.get("documentUploadType")) ||
      clean(trainingType.document_upload_type) ||
      (trainingType.requires_document ? "single" : "none");

    if (trainingType.requires_document) {
      if (uploadType === "front_back" && actualFiles.length < 2) {
        return NextResponse.json(
          { error: "Upload both the front and back document files." },
          { status: 400 },
        );
      }

      if (uploadType !== "front_back" && actualFiles.length < 1) {
        return NextResponse.json(
          { error: "Upload the required training document." },
          { status: 400 },
        );
      }
    }

    const allowedExtensions = Array.isArray(trainingType.allowed_extensions)
      ? trainingType.allowed_extensions.map((item: unknown) =>
          String(item).toLowerCase().replace(/^\./, ""),
        )
      : ["pdf", "jpg", "jpeg", "png"];

    const maxFileSizeMb =
      Number(trainingType.max_file_size_mb ?? 20) > 0
        ? Number(trainingType.max_file_size_mb)
        : 20;

    for (const item of actualFiles) {
      const extension = fileExtension(item.file.name);

      if (extension && !allowedExtensions.includes(extension)) {
        return NextResponse.json(
          {
            error: `${item.file.name} is not an allowed file type. Allowed: ${allowedExtensions.join(", ")}.`,
          },
          { status: 400 },
        );
      }

      if (item.file.size > maxFileSizeMb * 1024 * 1024) {
        return NextResponse.json(
          {
            error: `${item.file.name} exceeds the ${maxFileSizeMb} MB limit.`,
          },
          { status: 400 },
        );
      }
    }

    stagingBucket = clean(settings?.staging_bucket) || "training-staging";

    // Legacy employee profiles are supported automatically. If this employee
    // existed before the SharePoint folder fields were added, this resolves or
    // creates their employee folder + Training subfolder and writes the folder
    // IDs back to the existing employees row. No new employee profile is made.
    await ensureEmployeeBaseTrainingFolder({
      service,
      employee,
    });

    const autoApproveAuthorisedUpload =
      Boolean(settings?.auto_approve_authorised_uploads) &&
      roleCanManageTraining(identity.role);

    const requiresReview =
      trainingType.requires_review !== false &&
      !autoApproveAuthorisedUpload;

    const workflowStatus = requiresReview ? "pending_review" : "approved";
    const submittedAt = new Date().toISOString();

    const recordPayload = {
      employee_id: employeeId,
      training_type_id: trainingTypeId,
      training_name: clean(trainingType.name),
      training_short_code: clean(trainingType.short_code) || null,
      category: clean(trainingType.category) || null,
      record_kind: clean(trainingType.record_kind) || null,
      certificate_number: certificateNumber || null,
      class_codes: selectedOptionCodes,
      option_ids: selectedOptionIds,
      option_codes: selectedOptionCodes,
      provider: issuer || null,
      issuing_authority: issuer || null,
      issue_date: issueDate,
      expiry_date: doesNotExpire ? null : expiryDate,
      does_not_expire: doesNotExpire,
      notes,
      project_id: projectId,
      metadata: {
        ...metadata,
        replacement_mode: replacementMode,
      },
      workflow_status: workflowStatus,
      record_status: requiresReview
        ? "pending_verification"
        : recordStatusFor(expiryDate, doesNotExpire),
      source: clean(form.get("source")) || "website",
      batch_id: clean(form.get("batchId")) || null,
      supersedes_record_id: supersedesRecordId,
      current_version: true,
      submitted_by_user_id: identity.userId,
      submitted_by_name: identity.name,
      submitted_by_email: identity.email,
      submitted_at: submittedAt,
      approved_at: requiresReview ? null : submittedAt,
      reviewed_at: requiresReview ? null : submittedAt,
      reviewed_by_user_id: requiresReview ? null : identity.userId,
      reviewed_by_name: requiresReview ? null : identity.name,
      reviewed_by_email: requiresReview ? null : identity.email,
    };

    const { data: record, error: recordError } = await service
      .from("employee_training_records")
      .insert(recordPayload)
      .select("id")
      .single();

    if (recordError) throw new Error(recordError.message);

    createdRecordId = record.id;

    for (let index = 0; index < actualFiles.length; index += 1) {
      const item = actualFiles[index];

      const fallbackName = fallbackFilename({
        employeeName: clean(employee.full_name),
        trainingCode:
          clean(trainingType.short_code) || clean(trainingType.name),
        side: item.side === "other" ? null : item.side,
        expiryDate: doesNotExpire ? null : expiryDate,
        originalName: item.file.name,
      });

      const generatedFileName =
        item.requestedName ||
        (await configuredFilename({
          service,
          employeeId,
          trainingTypeId,
          classCodes: selectedOptionCodes,
          expiryDate: doesNotExpire ? null : expiryDate,
          side: item.side,
          originalName: item.file.name,
          fallback: fallbackName,
        }));

      const document = await stageFile({
        service,
        bucket: stagingBucket,
        recordId: record.id,
        employeeId,
        file: item.file,
        generatedFileName,
        documentSide: item.side,
        sequence: index + 1,
        uploadedBy: identity.userId,
      });

      if (document?.staging_path) {
        stagedPaths.push(document.staging_path);
      }
    }

    if (!requiresReview) {
      // Publish the new evidence first. The existing approved record is not
      // superseded until the replacement has safely reached SharePoint.
      if (actualFiles.length > 0) {
        await publishApprovedTrainingRecord({
          service,
          recordId: record.id,
        });
      }

      if (supersedesRecordId) {
        const supersededAt = new Date().toISOString();

        const { error: supersedeError } = await service
          .from("employee_training_records")
          .update({
            superseded_at: supersededAt,
            superseded_by_record_id: record.id,
            current_version: false,
            record_status: "superseded",
            updated_at: supersededAt,
          })
          .eq("id", supersedesRecordId);

        if (supersedeError) throw new Error(supersedeError.message);
      }

      let notificationWarning: string | null = null;

      let emailSent = 0;

      if (employee.user_id && employee.user_id !== identity.userId) {
        try {
          const notificationResult =
            await createTrainingNotifications({
              service,
              userIds: [employee.user_id],
              inAppUserIds: [employee.user_id],
              pushUserIds: [employee.user_id],
              emailUserIds: [employee.user_id],
              emailSubject: `Training approved - ${trainingType.name}`,
              eventType: "training_record_approved",
              title: "Training record approved",
              message: `${trainingType.name} was added to your TTTracker Training profile.`,
              severity: "success",
              actionRoute: "/profile",
              actionParams: { training_record_id: record.id },
              sourceRecordId: record.id,
            });

          emailSent = Number(notificationResult.emailSent ?? 0);
        } catch (error) {
          console.error("Approved Training notification failed", error);
          notificationWarning =
            "The Training record was approved, but the employee notification could not be sent.";
        }
      }

      return NextResponse.json({
        success: true,
        recordId: record.id,
        workflowStatus: "approved",
        autoApproved: autoApproveAuthorisedUpload,
        emailSent,
        notificationWarning,
      });
    }

    let reviewerRecipients = await reviewerRecipientsFor({
      service,
      trainingTypeId,
      categoryId: clean(trainingType.category_id) || null,
    });

    if (reviewerRecipients.length === 0) {
      const fallbackIds = await reviewerFallbackIds(service);
      reviewerRecipients = fallbackIds.map((userId) => ({
        userId,
        receivesInApp: true,
        receivesPush: true,
        receivesEmail: false,
      }));
    }

    // Keep the full reviewer list for permissions and queue access, but do not
    // notify the person who just submitted the record. A Training Officer who
    // uploads evidence they are authorised to review does not need an email,
    // push and in-app notification telling them about their own upload.
    const notificationRecipients = reviewerRecipients.filter(
      (recipient) => recipient.userId !== identity.userId,
    );

    const reviewerIds = notificationRecipients.map(
      (recipient) => recipient.userId,
    );
    const reviewerInAppIds = notificationRecipients
      .filter((recipient) => recipient.receivesInApp)
      .map((recipient) => recipient.userId);
    const reviewerPushIds = notificationRecipients
      .filter((recipient) => recipient.receivesPush)
      .map((recipient) => recipient.userId);
    const reviewerEmailIds = notificationRecipients
      .filter((recipient) => recipient.receivesEmail)
      .map((recipient) => recipient.userId);

    let notificationWarning: string | null = null;
    let reviewersNotified = 0;

    if (reviewerRecipients.length === 0) {
      notificationWarning =
        "No reviewer is configured for this Training record. It remains safely in the Verification Queue.";
    } else if (reviewerIds.length > 0) {
      try {
        await createTrainingNotifications({
          service,
          userIds: reviewerIds,
          inAppUserIds: reviewerInAppIds,
          pushUserIds: reviewerPushIds,
          emailUserIds: reviewerEmailIds,
          emailSubject: `Training review required - ${employee.full_name} - ${trainingType.name}`,
          eventType: "training_review_required",
          title: "Training record requires review",
          message: `${employee.full_name} submitted ${trainingType.name} for review.`,
          severity: "warning",
          actionRoute: "/people/training/verification",
          actionParams: {
            training_record_id: record.id,
            employee_id: employeeId,
          },
          sourceRecordId: record.id,
        });
        reviewersNotified = reviewerIds.length;
      } catch (error) {
        console.error("Training review notification failed", error);
        notificationWarning =
          "The Training record is safely in the Verification Queue, but reviewer notification could not be sent.";
      }
    }
    // If the only matching reviewer is the submitter, the record remains in the
    // queue and no self-notification is sent. That is expected behaviour.

    return NextResponse.json({
      success: true,
      recordId: record.id,
      workflowStatus: "pending_review",
      reviewersNotified,
      notificationWarning,
    });
  } catch (error) {
    if (service && stagedPaths.length > 0) {
      try {
        await service.storage.from(stagingBucket).remove(stagedPaths);
      } catch {
        // Keep the original error.
      }
    }

    if (service && createdRecordId) {
      try {
        await service
          .from("employee_training_records")
          .delete()
          .eq("id", createdRecordId);
      } catch {
        // Keep the original error.
      }
    }

    const apiError = trainingApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
