import {
  ensureDriveFolder,
  getBCContractingSite,
  getDriveByName,
  graphRequest,
  uploadDriveItemContent,
  type SharePointDriveItem,
} from "@/lib/sharepoint/graph";
import { sanitiseSharePointName } from "@/lib/sharepoint/projects";
import { createTrainingServiceClient } from "@/lib/training/server";

type TrainingService = ReturnType<typeof createTrainingServiceClient>;

export type TrainingSettings = {
  sharepoint_site_id?: string | null;
  sharepoint_site_name?: string | null;
  sharepoint_site_url?: string | null;
  sharepoint_drive_id?: string | null;
  sharepoint_drive_name?: string | null;
  sharepoint_base_folder?: string | null;
  employee_folder_template?: string | null;
  training_subfolder_name?: string | null;
  staging_bucket?: string | null;
  core_metadata_map?: Record<string, string> | null;
};

export type EmployeeRow = {
  id: string;
  payroll_id?: string | null;
  full_name: string;
  sharepoint_drive_id?: string | null;
  sharepoint_folder_id?: string | null;
  sharepoint_web_url?: string | null;
  sharepoint_folder_name?: string | null;
};

type ProjectRow = {
  name: string | null;
  project_number: string | null;
};

type TrainingRecordRow = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string | null;
  training_short_code: string | null;
  category: string | null;
  certificate_number: string | null;
  provider: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  project_id: string | null;
  option_codes: string[] | null;
  class_codes: string[] | null;
  metadata: Record<string, unknown> | null;
  sharepoint_web_url: string | null;
};

type TrainingTypeRow = {
  id: string;
  category_id: string | null;
  category: string | null;
  name: string | null;
  short_code: string | null;
};

type TrainingCategoryRow = {
  sharepoint_folder_name: string | null;
  name: string | null;
};

type TrainingTypeFieldRow = {
  field_key: string | null;
  sharepoint_column: string | null;
  active: boolean | null;
};

type TrainingDocumentRow = {
  id: string;
  generated_file_name: string;
  mime_type: string | null;
  sequence_number: number | null;
  staging_bucket: string | null;
  staging_path: string | null;
  sharepoint_item_id: string | null;
  sharepoint_web_url: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function employeeFolderName(template: string, employee: EmployeeRow) {
  const payroll = clean(employee.payroll_id);
  const name = clean(employee.full_name) || "Employee";

  const rendered = template
    .replaceAll("{payroll_id}", payroll)
    .replaceAll("{employee_name}", name)
    .replace(/\s*-\s*-\s*/g, " - ")
    .replace(/^\s*-\s*|\s*-\s*$/g, "")
    .trim();

  return sanitiseSharePointName(rendered || name);
}

async function getDriveRootId(driveId: string) {
  const root = await graphRequest<{ id: string }>(
    `/drives/${encodeURIComponent(driveId)}/root?$select=id`,
  );

  if (!root.id) {
    throw new Error("Could not resolve the SharePoint document library root.");
  }

  return root.id;
}

export async function loadTrainingSettings(service: TrainingService) {
  const { data, error } = await service
    .from("training_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data ?? {
    sharepoint_base_folder: "Employees",
    employee_folder_template: "{payroll_id} - {employee_name}",
    training_subfolder_name: "Training",
    staging_bucket: "training-staging",
    core_metadata_map: {},
  }) as TrainingSettings;
}

export async function resolveTrainingDrive(service: TrainingService) {
  const settings = await loadTrainingSettings(service);

  if (clean(settings.sharepoint_drive_id)) {
    return {
      settings,
      siteId: clean(settings.sharepoint_site_id),
      driveId: clean(settings.sharepoint_drive_id),
      driveName: clean(settings.sharepoint_drive_name),
    };
  }

  const configuredDriveName = clean(settings.sharepoint_drive_name);
  if (!configuredDriveName) {
    throw new Error(
      "Training SharePoint is not configured. Select a document library in Training Configuration.",
    );
  }

  const site = await getBCContractingSite();
  const drive = await getDriveByName(site.id, configuredDriveName);

  const { error } = await service
    .from("training_settings")
    .update({
      sharepoint_site_id: site.id,
      sharepoint_site_name: site.displayName ?? null,
      sharepoint_site_url: site.webUrl ?? null,
      sharepoint_drive_id: drive.id,
      sharepoint_drive_name: drive.name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) throw new Error(error.message);

  return {
    settings: {
      ...settings,
      sharepoint_site_id: site.id,
      sharepoint_drive_id: drive.id,
      sharepoint_drive_name: drive.name,
    },
    siteId: site.id,
    driveId: drive.id,
    driveName: drive.name,
  };
}

/**
 * Works for employees that existed before this migration.
 *
 * If an employee profile has no stored SharePoint folder ids, this function
 * finds or creates the folder from the configured template, writes the ids
 * back to the existing employee row, then ensures the Training subfolder.
 */
export async function ensureEmployeeBaseTrainingFolder({
  service,
  employee,
}: {
  service: TrainingService;
  employee: EmployeeRow;
}) {
  const { settings, driveId } = await resolveTrainingDrive(service);
  const rootId = await getDriveRootId(driveId);

  const baseFolder = await ensureDriveFolder({
    driveId,
    parentItemId: rootId,
    name: sanitiseSharePointName(
      clean(settings.sharepoint_base_folder) || "Employees",
    ),
  });

  let employeeFolder: SharePointDriveItem | null = null;

  if (
    clean(employee.sharepoint_drive_id) === driveId &&
    clean(employee.sharepoint_folder_id)
  ) {
    try {
      employeeFolder = await graphRequest<SharePointDriveItem>(
        `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(
          clean(employee.sharepoint_folder_id),
        )}?$select=id,name,webUrl,parentReference`,
      );
    } catch {
      employeeFolder = null;
    }
  }

  if (!employeeFolder) {
    const template =
      clean(settings.employee_folder_template) ||
      "{payroll_id} - {employee_name}";

    const folderName = employeeFolderName(template, employee);

    employeeFolder = await ensureDriveFolder({
      driveId,
      parentItemId: baseFolder.id,
      name: folderName,
    });

    const { error } = await service
      .from("employees")
      .update({
        sharepoint_drive_id: driveId,
        sharepoint_folder_id: employeeFolder.id,
        sharepoint_web_url: employeeFolder.webUrl ?? null,
        sharepoint_folder_name: employeeFolder.name,
      })
      .eq("id", employee.id);

    if (error) throw new Error(error.message);
  }

  const trainingFolder = await ensureDriveFolder({
    driveId,
    parentItemId: employeeFolder.id,
    name: sanitiseSharePointName(
      clean(settings.training_subfolder_name) || "Training",
    ),
  });

  return {
    settings,
    driveId,
    baseFolder,
    employeeFolder,
    trainingFolder,
  };
}

export async function ensureEmployeeTrainingCategoryFolder({
  service,
  employee,
  categoryFolderName,
}: {
  service: TrainingService;
  employee: EmployeeRow;
  categoryFolderName: string;
}) {
  const resolved = await ensureEmployeeBaseTrainingFolder({
    service,
    employee,
  });

  const categoryFolder = await ensureDriveFolder({
    driveId: resolved.driveId,
    parentItemId: resolved.trainingFolder.id,
    name: sanitiseSharePointName(categoryFolderName || "Other"),
  });

  return {
    ...resolved,
    categoryFolder,
  };
}

async function projectLabelFor(
  service: TrainingService,
  projectId?: string | null,
) {
  const resolvedProjectId = clean(projectId);
  if (!resolvedProjectId) return "";

  const { data, error } = await service
    .from("projects")
    .select("name,project_number")
    .eq("id", resolvedProjectId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const project = (data ?? null) as ProjectRow | null;

  return clean(project?.project_number)
    ? `${clean(project?.project_number)} - ${clean(project?.name)}`.trim()
    : clean(project?.name);
}

async function metadataFields({
  service,
  settings,
  record,
  employee,
  status,
}: {
  service: TrainingService;
  settings: TrainingSettings;
  record: TrainingRecordRow;
  employee: EmployeeRow;
  status: string;
}) {
  const values: Record<string, unknown> = {
    employee_id: clean(employee.payroll_id),
    employee_name: clean(employee.full_name),
    training_type: clean(record.training_name),
    training_code: clean(record.training_short_code),
    certificate_number: clean(record.certificate_number),
    provider: clean(record.provider || record.issuing_authority),
    issue_date: clean(record.issue_date),
    expiry_date: clean(record.expiry_date),
    project: await projectLabelFor(service, record.project_id),
    status,
    tttracker_record_id: record.id,
    option_codes: Array.isArray(record.option_codes)
      ? record.option_codes.join(", ")
      : Array.isArray(record.class_codes)
        ? record.class_codes.join(", ")
        : "",
  };

  const result: Record<string, unknown> = {};
  const coreMap =
    settings.core_metadata_map &&
    typeof settings.core_metadata_map === "object"
      ? settings.core_metadata_map
      : {};

  for (const [sourceKey, columnValue] of Object.entries(coreMap)) {
    const column = clean(columnValue);
    const value = values[sourceKey];

    if (
      column &&
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      result[column] = value;
    }
  }

  if (record.training_type_id) {
    const { data: customFields, error } = await service
      .from("training_type_fields")
      .select("field_key,sharepoint_column,active")
      .eq("training_type_id", record.training_type_id)
      .eq("active", true);

    if (error) throw new Error(error.message);

    const recordMetadata: Record<string, unknown> =
      record.metadata && typeof record.metadata === "object"
        ? record.metadata
        : {};

    const fieldRows =
      (customFields ?? []) as TrainingTypeFieldRow[];

    for (const field of fieldRows) {
      const key = clean(field.field_key);
      const column = clean(field.sharepoint_column);
      if (!key || !column) continue;

      const value = recordMetadata[key];
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        result[column] = Array.isArray(value) ? value.join(", ") : value;
      }
    }
  }

  return result;
}

async function patchSharePointMetadata({
  driveId,
  itemId,
  fields,
}: {
  driveId: string;
  itemId: string;
  fields: Record<string, unknown>;
}) {
  if (Object.keys(fields).length === 0) return;

  await graphRequest(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(
      itemId,
    )}/listItem/fields`,
    {
      method: "PATCH",
      body: JSON.stringify(fields),
    },
  );
}

export async function publishApprovedTrainingRecord({
  service,
  recordId,
}: {
  service: TrainingService;
  recordId: string;
}) {
  const { data: record, error: recordError } = await service
    .from("employee_training_records")
    .select("*")
    .eq("id", recordId)
    .maybeSingle();

  if (recordError) throw new Error(recordError.message);
  if (!record) throw new Error("Training record could not be found.");

  const trainingRecord = record as TrainingRecordRow;

  const { data: employee, error: employeeError } = await service
    .from("employees")
    .select(
      "id,payroll_id,full_name,sharepoint_drive_id,sharepoint_folder_id,sharepoint_web_url,sharepoint_folder_name",
    )
    .eq("id", trainingRecord.employee_id)
    .maybeSingle();

  if (employeeError) throw new Error(employeeError.message);
  if (!employee) throw new Error("Employee profile could not be found.");

  const employeeRow = employee as EmployeeRow;

  const { data: trainingType, error: typeError } = await service
    .from("training_types")
    .select("id,category_id,category,name,short_code")
    .eq("id", trainingRecord.training_type_id)
    .maybeSingle();

  if (typeError) throw new Error(typeError.message);

  const trainingTypeRow =
    (trainingType ?? null) as TrainingTypeRow | null;

  let categoryFolderName = clean(trainingRecord.category) || "Other";

  if (trainingTypeRow?.category_id) {
    const { data: category } = await service
      .from("training_categories")
      .select("sharepoint_folder_name,name")
      .eq("id", trainingTypeRow.category_id)
      .maybeSingle();

    const categoryRow =
      (category ?? null) as TrainingCategoryRow | null;

    categoryFolderName =
      clean(categoryRow?.sharepoint_folder_name) ||
      clean(categoryRow?.name) ||
      categoryFolderName;
  }

  const folder = await ensureEmployeeTrainingCategoryFolder({
    service,
    employee: employeeRow,
    categoryFolderName,
  });

  const { data: documents, error: documentError } = await service
    .from("employee_training_documents")
    .select("*")
    .eq("training_record_id", recordId)
    .eq("active", true)
    .order("sequence_number");

  if (documentError) throw new Error(documentError.message);

  const documentRows =
    (documents ?? []) as TrainingDocumentRow[];

  const settings = folder.settings;
  const stagingBucket =
    clean(settings.staging_bucket) || "training-staging";

  let firstWebUrl = clean(trainingRecord.sharepoint_web_url);

  for (const document of documentRows) {
    if (clean(document.sharepoint_item_id) && clean(document.sharepoint_web_url)) {
      if (!firstWebUrl) firstWebUrl = clean(document.sharepoint_web_url);
      continue;
    }

    const stagingPath = clean(document.staging_path);

    if (!stagingPath) {
      throw new Error(
        `Training document "${document.generated_file_name}" has no staged file.`,
      );
    }

    const bucket = clean(document.staging_bucket) || stagingBucket;

    const { data: stagedFile, error: downloadError } = await service.storage
      .from(bucket)
      .download(stagingPath);

    if (downloadError || !stagedFile) {
      throw new Error(
        downloadError?.message ||
          `Could not load staged file ${document.generated_file_name}.`,
      );
    }

    const content = new Uint8Array(await stagedFile.arrayBuffer());

    const item = await uploadDriveItemContent({
      driveId: folder.driveId,
      parentItemId: folder.categoryFolder.id,
      fileName: document.generated_file_name,
      content,
      contentType:
        clean(document.mime_type) || stagedFile.type || "application/octet-stream",
    });

    const fields = await metadataFields({
      service,
      settings,
      record: trainingRecord,
      employee: employeeRow,
      status: "Approved",
    });

    try {
      await patchSharePointMetadata({
        driveId: folder.driveId,
        itemId: item.id,
        fields,
      });
    } catch (error) {
      console.warn(
        "Training file uploaded but SharePoint metadata could not be applied:",
        error,
      );
    }

    const now = new Date().toISOString();

    const { error: updateError } = await service
      .from("employee_training_documents")
      .update({
        sharepoint_drive_id: folder.driveId,
        sharepoint_folder_id: folder.categoryFolder.id,
        sharepoint_item_id: item.id,
        sharepoint_web_url: item.webUrl ?? null,
        sharepoint_folder_path: `${folder.employeeFolder.name}/${folder.trainingFolder.name}/${folder.categoryFolder.name}`,
        published_at: now,
        updated_at: now,
      })
      .eq("id", document.id);

    if (updateError) throw new Error(updateError.message);

    await service.storage
      .from(bucket)
      .remove([stagingPath]);

    await service
      .from("employee_training_documents")
      .update({
        staging_path: null,
        staging_bucket: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", document.id);

    if (!firstWebUrl) firstWebUrl = clean(item.webUrl);
  }

  const publishedAt = new Date().toISOString();

  const { error: recordUpdateError } = await service
    .from("employee_training_records")
    .update({
      sharepoint_web_url: firstWebUrl || null,
      sharepoint_published_at: publishedAt,
      updated_at: publishedAt,
    })
    .eq("id", recordId);

  if (recordUpdateError) throw new Error(recordUpdateError.message);

  return {
    driveId: folder.driveId,
    employeeFolderId: folder.employeeFolder.id,
    trainingFolderId: folder.trainingFolder.id,
    categoryFolderId: folder.categoryFolder.id,
    webUrl: firstWebUrl || null,
  };
}
