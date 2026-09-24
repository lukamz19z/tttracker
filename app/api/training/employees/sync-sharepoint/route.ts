import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  roleCanManageTraining,
  trainingApiError,
} from "@/lib/training/server";
import {
  syncEmployeeTrainingSharePoint,
  type EmployeeRow,
} from "@/lib/training/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type EmployeeSyncRow = EmployeeRow & {
  active: boolean | null;
};

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireTrainingUser(request);

    if (!roleCanManageTraining(identity.role)) {
      return NextResponse.json(
        {
          error:
            "Administrator, HSEQ or Training Officer access is required.",
        },
        { status: 403 },
      );
    }

    let body: {
      includeInactive?: boolean;
      employeeIds?: string[];
      syncMetadata?: boolean;
    } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    let query = service
      .from("employees")
      .select(
        "id,payroll_id,full_name,active,sharepoint_drive_id,sharepoint_folder_id,sharepoint_web_url,sharepoint_folder_name",
      )
      .order("full_name");

    if (!body.includeInactive) {
      query = query.eq("active", true);
    }

    const employeeIds = Array.isArray(body.employeeIds)
      ? Array.from(
          new Set(
            body.employeeIds
              .map((id) => String(id ?? "").trim())
              .filter(Boolean),
          ),
        )
      : [];

    if (employeeIds.length > 0) {
      query = query.in("id", employeeIds);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    const employees = (data ?? []) as EmployeeSyncRow[];

    const successes: Array<{
      employeeId: string;
      employeeName: string;
      payrollId: string | null;
      folderId: string;
      folderName: string;
      webUrl: string | null;
      renamed: boolean;
      createdOrLinked: boolean;
      recordsChecked: number;
      metadataUpdated: number;
      documentLinksRefreshed: number;
      documentsMoved: number;
      supersededArchived: number;
      legacyTrainingFolderRemoved: boolean;
    }> = [];

    const failures: Array<{
      employeeId: string;
      employeeName: string;
      error: string;
    }> = [];

    // Keep Graph traffic controlled. Folder sync can involve rename + document
    // metadata/link refresh, so use smaller groups than simple provisioning.
    for (const group of chunks(employees, 2)) {
      const results = await Promise.all(
        group.map(async (employee) => {
          try {
            const result = await syncEmployeeTrainingSharePoint({
              service,
              employee,
              syncMetadata: body.syncMetadata !== false,
            });

            return {
              ok: true as const,
              result,
            };
          } catch (syncError) {
            return {
              ok: false as const,
              employee,
              error:
                syncError instanceof Error
                  ? syncError.message
                  : "Unknown SharePoint sync error.",
            };
          }
        }),
      );

      for (const result of results) {
        if (result.ok) {
          successes.push(result.result);
        } else {
          failures.push({
            employeeId: result.employee.id,
            employeeName: result.employee.full_name,
            error: result.error,
          });
        }
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      requested: employees.length,
      synced: successes.length,
      failed: failures.length,
      renamed: successes.filter((item) => item.renamed).length,
      createdOrLinked: successes.filter(
        (item) => item.createdOrLinked,
      ).length,
      metadataUpdated: successes.reduce(
        (total, item) => total + item.metadataUpdated,
        0,
      ),
      documentLinksRefreshed: successes.reduce(
        (total, item) => total + item.documentLinksRefreshed,
        0,
      ),
      documentsMoved: successes.reduce(
        (total, item) => total + item.documentsMoved,
        0,
      ),
      supersededArchived: successes.reduce(
        (total, item) => total + item.supersededArchived,
        0,
      ),
      legacyTrainingFoldersRemoved: successes.filter(
        (item) => item.legacyTrainingFolderRemoved,
      ).length,
      successes,
      failures,
    });
  } catch (error) {
    console.error("Training SharePoint employee sync failed", error);

    const apiError = trainingApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
