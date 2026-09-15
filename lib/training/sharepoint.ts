import {
  deleteDriveItem,
  ensureDriveFolder,
  getBCContractingSite,
  getDriveByName,
  getDriveChildByName,
  graphRequest,
  listDriveChildren,
  moveDriveItem,
  renameDriveItem,
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
  workflow_status?: string | null;
  record_status?: string | null;
  current_version?: boolean | null;
  superseded_at?: string | null;
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

export function employeeFolderName(template: string, employee: EmployeeRow) {
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

  const template =
    clean(settings.employee_folder_template) ||
    "{payroll_id} - {employee_name}";
  const expectedFolderName = employeeFolderName(template, employee);

  let employeeFolder: SharePointDriveItem | null = null;
  let renamed = false;
  let createdOrLinked = false;

  if (
    clean(employee.sharepoint_drive_id) === driveId &&
    clean(employee.sharepoint_folder_id)
  ) {
    try {
      employeeFolder = await graphRequest<SharePointDriveItem>(
        `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(
          clean(employee.sharepoint_folder_id),
        )}?$select=id,name,webUrl,parentReference,folder`,
      );
    } catch {
      employeeFolder = null;
    }
  }

  if (employeeFolder && employeeFolder.name !== expectedFolderName) {
    const conflictingFolder = await getDriveChildByName({
      driveId,
      parentItemId: baseFolder.id,
      name: expectedFolderName,
    });

    if (
      conflictingFolder &&
      conflictingFolder.id !== employeeFolder.id
    ) {
      throw new Error(
        `Cannot rename SharePoint folder "${employeeFolder.name}" to "${expectedFolderName}" because another folder with the corrected name already exists. Resolve the duplicate folder before syncing this employee.`,
      );
    }

    employeeFolder = await renameDriveItem({
      driveId,
      itemId: employeeFolder.id,
      name: expectedFolderName,
    });
    renamed = true;
  }

  if (!employeeFolder) {
    employeeFolder = await ensureDriveFolder({
      driveId,
      parentItemId: baseFolder.id,
      name: expectedFolderName,
    });
    createdOrLinked = true;
  }

  const { error: employeeUpdateError } = await service
    .from("employees")
    .update({
      sharepoint_drive_id: driveId,
      sharepoint_folder_id: employeeFolder.id,
      sharepoint_web_url: employeeFolder.webUrl ?? null,
      sharepoint_folder_name: employeeFolder.name,
    })
    .eq("id", employee.id);

  if (employeeUpdateError) {
    throw new Error(employeeUpdateError.message);
  }

  return {
    settings,
    driveId,
    baseFolder,
    employeeFolder,
    expectedFolderName,
    renamed,
    createdOrLinked,
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
    parentItemId: resolved.employeeFolder.id,
    name: sanitiseSharePointName(categoryFolderName || "Other"),
  });

  return {
    ...resolved,
    categoryFolder,
  };
}

export async function ensureEmployeeSupersededFolder({
  service,
  employee,
}: {
  service: TrainingService;
  employee: EmployeeRow;
}) {
  const resolved = await ensureEmployeeBaseTrainingFolder({
    service,
    employee,
  });

  const supersededFolder = await ensureDriveFolder({
    driveId: resolved.driveId,
    parentItemId: resolved.employeeFolder.id,
    name: "Superseded",
  });

  return {
    ...resolved,
    supersededFolder,
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

function isExpiredDate(value?: string | null) {
  const dateValue = clean(value);
  if (!dateValue) return false;

  const expiry = new Date(`${dateValue.slice(0, 10)}T23:59:59`);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now();
}

function statusForSharePointRecord(record: TrainingRecordRow) {
  if (record.superseded_at || record.current_version === false) {
    return "Superseded";
  }

  if (isExpiredDate(record.expiry_date)) {
    return "Expired";
  }

  if (clean(record.workflow_status) === "approved") {
    return "Approved";
  }

  return clean(record.record_status) || "Approved";
}

async function categoryFolderNameForRecord({
  service,
  record,
}: {
  service: TrainingService;
  record: TrainingRecordRow;
}) {
  let categoryFolderName = clean(record.category) || "Other";

  if (!record.training_type_id) {
    return categoryFolderName;
  }

  const { data: trainingType, error: typeError } = await service
    .from("training_types")
    .select("id,category_id,category,name,short_code")
    .eq("id", record.training_type_id)
    .maybeSingle();

  if (typeError) throw new Error(typeError.message);

  const trainingTypeRow =
    (trainingType ?? null) as TrainingTypeRow | null;

  if (trainingTypeRow?.category_id) {
    const { data: category, error: categoryError } = await service
      .from("training_categories")
      .select("sharepoint_folder_name,name")
      .eq("id", trainingTypeRow.category_id)
      .maybeSingle();

    if (categoryError) throw new Error(categoryError.message);

    const categoryRow =
      (category ?? null) as TrainingCategoryRow | null;

    categoryFolderName =
      clean(categoryRow?.sharepoint_folder_name) ||
      clean(categoryRow?.name) ||
      categoryFolderName;
  }

  return categoryFolderName;
}

async function deleteFolderTreeIfEmpty({
  driveId,
  itemId,
}: {
  driveId: string;
  itemId: string;
}): Promise<boolean> {
  let children;

  try {
    children = await listDriveChildren({
      driveId,
      parentItemId: itemId,
    });
  } catch {
    return false;
  }

  for (const child of children.value ?? []) {
    if (child.folder) {
      await deleteFolderTreeIfEmpty({
        driveId,
        itemId: child.id,
      });
    }
  }

  const after = await listDriveChildren({
    driveId,
    parentItemId: itemId,
  });

  if ((after.value ?? []).length > 0) {
    return false;
  }

  await deleteDriveItem({
    driveId,
    itemId,
  });

  return true;
}

async function cleanupLegacyTrainingFolder({
  driveId,
  employeeFolderId,
  legacyTrainingFolderName,
}: {
  driveId: string;
  employeeFolderId: string;
  legacyTrainingFolderName: string;
}) {
  const legacyName = clean(legacyTrainingFolderName) || "Training";

  const legacyFolder = await getDriveChildByName({
    driveId,
    parentItemId: employeeFolderId,
    name: legacyName,
  });

  if (!legacyFolder?.folder) {
    return false;
  }

  // This only removes folders that are empty all the way down. Any untracked
  // or manually placed file causes the legacy structure to be retained.
  return deleteFolderTreeIfEmpty({
    driveId,
    itemId: legacyFolder.id,
  });
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


export async function syncEmployeeTrainingSharePoint({
  service,
  employee,
  syncMetadata = true,
}: {
  service: TrainingService;
  employee: EmployeeRow;
  syncMetadata?: boolean;
}) {
  const folder = await ensureEmployeeBaseTrainingFolder({
    service,
    employee,
  });

  let metadataUpdated = 0;
  let documentLinksRefreshed = 0;
  let documentsMoved = 0;
  let supersededArchived = 0;
  let recordsChecked = 0;
  let legacyTrainingFolderRemoved = false;

  const { data: records, error: recordsError } = await service
    .from("employee_training_records")
    .select("*")
    .eq("employee_id", employee.id);

  if (recordsError) throw new Error(recordsError.message);

  const recordRows = (records ?? []) as TrainingRecordRow[];
  recordsChecked = recordRows.length;

  if (recordRows.length > 0) {
    const recordById = new Map(
      recordRows.map((record) => [record.id, record]),
    );
    const recordIds = recordRows.map((record) => record.id);

    const { data: documents, error: documentError } = await service
      .from("employee_training_documents")
      .select(
        "id,training_record_id,sharepoint_drive_id,sharepoint_folder_id,sharepoint_item_id,sharepoint_web_url,sharepoint_folder_path",
      )
      .in("training_record_id", recordIds);

    if (documentError) throw new Error(documentError.message);

    const targetFolderByRecordId = new Map<
      string,
      SharePointDriveItem
    >();

    for (const document of documents ?? []) {
      const itemId = clean(document.sharepoint_item_id);
      if (!itemId) continue;

      const record = recordById.get(clean(document.training_record_id));
      if (!record) continue;

      let targetFolder = targetFolderByRecordId.get(record.id);

      if (!targetFolder) {
        if (record.superseded_at || record.current_version === false) {
          const superseded = await ensureEmployeeSupersededFolder({
            service,
            employee,
          });
          targetFolder = superseded.supersededFolder;
        } else {
          const categoryFolderName =
            await categoryFolderNameForRecord({
              service,
              record,
            });

          const category = await ensureEmployeeTrainingCategoryFolder({
            service,
            employee,
            categoryFolderName,
          });

          targetFolder = category.categoryFolder;
        }

        targetFolderByRecordId.set(record.id, targetFolder);
      }

      let currentItem = await graphRequest<SharePointDriveItem>(
        `/drives/${encodeURIComponent(
          folder.driveId,
        )}/items/${encodeURIComponent(
          itemId,
        )}?$select=id,name,webUrl,parentReference,folder,file,size`,
      );

      if (clean(currentItem.parentReference?.id) !== targetFolder.id) {
        currentItem = await moveDriveItem({
          driveId: folder.driveId,
          itemId,
          parentItemId: targetFolder.id,
        });
        documentsMoved += 1;

        if (record.superseded_at || record.current_version === false) {
          supersededArchived += 1;
        }
      }

      if (syncMetadata) {
        const fields = await metadataFields({
          service,
          settings: folder.settings,
          record,
          employee,
          status: statusForSharePointRecord(record),
        });

        if (Object.keys(fields).length > 0) {
          await patchSharePointMetadata({
            driveId: folder.driveId,
            itemId,
            fields,
          });
          metadataUpdated += 1;
        }
      }

      const { error: documentUpdateError } = await service
        .from("employee_training_documents")
        .update({
          sharepoint_drive_id: folder.driveId,
          sharepoint_folder_id: targetFolder.id,
          sharepoint_web_url: currentItem.webUrl ?? null,
          sharepoint_folder_path: `${folder.employeeFolder.name}/${targetFolder.name}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", document.id);

      if (documentUpdateError) {
        throw new Error(documentUpdateError.message);
      }

      documentLinksRefreshed += 1;
    }

    for (const record of recordRows) {
      const { data: firstDocument, error: firstDocumentError } =
        await service
          .from("employee_training_documents")
          .select("sharepoint_web_url")
          .eq("training_record_id", record.id)
          .not("sharepoint_web_url", "is", null)
          .order("sequence_number", { ascending: true })
          .limit(1)
          .maybeSingle();

      if (firstDocumentError) {
        throw new Error(firstDocumentError.message);
      }

      const firstDocumentUrl = clean(
        firstDocument?.sharepoint_web_url,
      );

      if (firstDocumentUrl) {
        const { error: recordUpdateError } = await service
          .from("employee_training_records")
          .update({
            sharepoint_web_url: firstDocumentUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id);

        if (recordUpdateError) {
          throw new Error(recordUpdateError.message);
        }
      }
    }
  }

  try {
    legacyTrainingFolderRemoved = await cleanupLegacyTrainingFolder({
      driveId: folder.driveId,
      employeeFolderId: folder.employeeFolder.id,
      legacyTrainingFolderName:
        clean(folder.settings.training_subfolder_name) || "Training",
    });
  } catch (error) {
    console.warn(
      `Legacy Training folder cleanup skipped for ${employee.full_name}:`,
      error,
    );
  }

  return {
    employeeId: employee.id,
    employeeName: employee.full_name,
    payrollId: clean(employee.payroll_id) || null,
    driveId: folder.driveId,
    folderId: folder.employeeFolder.id,
    folderName: folder.employeeFolder.name,
    webUrl: folder.employeeFolder.webUrl ?? null,
    renamed: folder.renamed,
    createdOrLinked: folder.createdOrLinked,
    recordsChecked,
    metadataUpdated,
    documentLinksRefreshed,
    documentsMoved,
    supersededArchived,
    legacyTrainingFolderRemoved,
  };
}

export async function archiveSupersededTrainingRecord({
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
  if (!record) return { archived: 0 };

  const trainingRecord = record as TrainingRecordRow;

  const { data: employee, error: employeeError } = await service
    .from("employees")
    .select(
      "id,payroll_id,full_name,sharepoint_drive_id,sharepoint_folder_id,sharepoint_web_url,sharepoint_folder_name",
    )
    .eq("id", trainingRecord.employee_id)
    .maybeSingle();

  if (employeeError) throw new Error(employeeError.message);
  if (!employee) return { archived: 0 };

  const employeeRow = employee as EmployeeRow;

  const folder = await ensureEmployeeSupersededFolder({
    service,
    employee: employeeRow,
  });

  const { data: documents, error: documentError } = await service
    .from("employee_training_documents")
    .select(
      "id,training_record_id,sharepoint_drive_id,sharepoint_folder_id,sharepoint_item_id,sharepoint_web_url,sharepoint_folder_path",
    )
    .eq("training_record_id", recordId)
    .not("sharepoint_item_id", "is", null);

  if (documentError) throw new Error(documentError.message);

  let archived = 0;
  let firstWebUrl = "";

  for (const document of documents ?? []) {
    const itemId = clean(document.sharepoint_item_id);
    if (!itemId) continue;

    let item = await graphRequest<SharePointDriveItem>(
      `/drives/${encodeURIComponent(
        folder.driveId,
      )}/items/${encodeURIComponent(
        itemId,
      )}?$select=id,name,webUrl,parentReference,file,size`,
    );

    if (
      clean(item.parentReference?.id) !== folder.supersededFolder.id
    ) {
      item = await moveDriveItem({
        driveId: folder.driveId,
        itemId,
        parentItemId: folder.supersededFolder.id,
      });
    }

    const fields = await metadataFields({
      service,
      settings: folder.settings,
      record: {
        ...trainingRecord,
        current_version: false,
        superseded_at:
          trainingRecord.superseded_at || new Date().toISOString(),
      },
      employee: employeeRow,
      status: "Superseded",
    });

    try {
      await patchSharePointMetadata({
        driveId: folder.driveId,
        itemId,
        fields,
      });
    } catch (error) {
      console.warn(
        "Superseded Training metadata could not be updated:",
        error,
      );
    }

    const { error: updateError } = await service
      .from("employee_training_documents")
      .update({
        sharepoint_drive_id: folder.driveId,
        sharepoint_folder_id: folder.supersededFolder.id,
        sharepoint_web_url: item.webUrl ?? null,
        sharepoint_folder_path: `${folder.employeeFolder.name}/${folder.supersededFolder.name}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", document.id);

    if (updateError) throw new Error(updateError.message);

    if (!firstWebUrl) {
      firstWebUrl = clean(item.webUrl);
    }

    archived += 1;
  }

  if (firstWebUrl) {
    const { error: recordUpdateError } = await service
      .from("employee_training_records")
      .update({
        sharepoint_web_url: firstWebUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    if (recordUpdateError) {
      throw new Error(recordUpdateError.message);
    }
  }

  return {
    archived,
    folderId: folder.supersededFolder.id,
    folderName: folder.supersededFolder.name,
  };
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

  const categoryFolderName = await categoryFolderNameForRecord({
    service,
    record: trainingRecord,
  });

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
      status: statusForSharePointRecord(trainingRecord),
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
        sharepoint_folder_path: `${folder.employeeFolder.name}/${folder.categoryFolder.name}`,
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
    categoryFolderId: folder.categoryFolder.id,
    webUrl: firstWebUrl || null,
  };
}
