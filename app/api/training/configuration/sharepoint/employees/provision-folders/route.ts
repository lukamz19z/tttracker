import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  roleCanManageTraining,
  trainingApiError,
} from "@/lib/training/server";
import { ensureEmployeeBaseTrainingFolder } from "@/lib/training/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type EmployeeFolderRow = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  active: boolean | null;
  sharepoint_drive_id: string | null;
  sharepoint_folder_id: string | null;
  sharepoint_web_url: string | null;
  sharepoint_folder_name: string | null;
};

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireTrainingUser(request);

    if (!roleCanManageTraining(identity.role)) {
      return NextResponse.json(
        { error: "Administrator or HSEQ access is required." },
        { status: 403 },
      );
    }

    let body: { includeInactive?: boolean; employeeIds?: string[] } = {};

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

    if (Array.isArray(body.employeeIds) && body.employeeIds.length > 0) {
      query = query.in("id", body.employeeIds);
    }

    const { data: employees, error } = await query;

    if (error) throw new Error(error.message);

    const employeeRows = (employees ?? []) as EmployeeFolderRow[];

    const successes: Array<{
      employeeId: string;
      employeeName: string;
      folderId: string;
      folderName: string;
      webUrl: string | null;
    }> = [];

    const failures: Array<{
      employeeId: string;
      employeeName: string;
      error: string;
    }> = [];

    // Keep Graph requests controlled. This also works as a one-time backfill
    // for employees that had TTTracker profiles before SharePoint folder ids
    // were added to the employees table.
    for (const group of chunks(employeeRows, 5)) {
      const results = await Promise.all(
        group.map(async (employee) => {
          try {
            const folder = await ensureEmployeeBaseTrainingFolder({
              service,
              employee,
            });

            return {
              ok: true as const,
              employee,
              folder,
            };
          } catch (error) {
            return {
              ok: false as const,
              employee,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown SharePoint folder error.",
            };
          }
        }),
      );

      for (const result of results) {
        if (result.ok) {
          successes.push({
            employeeId: result.employee.id,
            employeeName: result.employee.full_name,
            folderId: result.folder.employeeFolder.id,
            folderName: result.folder.employeeFolder.name,
            webUrl: result.folder.employeeFolder.webUrl ?? null,
          });
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
      provisioned: successes.length,
      failed: failures.length,
      successes,
      failures,
    });
  } catch (error) {
    const apiError = trainingApiError(error);
    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
