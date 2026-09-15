import { NextResponse } from "next/server";

import {
  requireTrainingUser,
  trainingApiError,
  userCanReviewTraining,
} from "@/lib/training/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrainingReviewRecordRow = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string;
  training_short_code: string | null;
  category: string | null;
  certificate_number: string | null;
  provider: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  notes: string | null;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
  option_codes: string[] | null;
  workflow_status: string | null;
  record_status: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_at: string | null;
  review_comment: string | null;
};

type TrainingTypeReviewRow = {
  id: string;
  category_id: string | null;
};

type EmployeeReviewRow = {
  id: string;
  payroll_id: string | null;
  full_name: string;
};

type ProjectReviewRow = {
  id: string;
  name: string;
  project_number: string | null;
};

type TrainingDocumentReviewRow = {
  id: string;
  training_record_id: string;
  document_side: string | null;
  generated_file_name: string;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  staging_path: string | null;
  sharepoint_web_url: string | null;
  active: boolean | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => clean(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function GET(request: Request) {
  try {
    const { service, identity } = await requireTrainingUser(request);

    const { data: recordData, error: recordError } = await service
      .from("employee_training_records")
      .select(
        "id,employee_id,training_type_id,training_name,training_short_code,category,certificate_number,provider,issue_date,expiry_date,does_not_expire,notes,project_id,metadata,option_codes,workflow_status,record_status,submitted_by_name,submitted_by_email,submitted_at,review_comment",
      )
      .in("workflow_status", ["pending_review", "changes_required"])
      .order("submitted_at", { ascending: true });

    if (recordError) throw new Error(recordError.message);

    const records =
      (recordData ?? []) as TrainingReviewRecordRow[];

    const typeIds = nonEmpty(
      records.map((record) => record.training_type_id),
    );

    let typeRows: TrainingTypeReviewRow[] = [];

    if (typeIds.length > 0) {
      const { data: typeData, error: typeError } = await service
        .from("training_types")
        .select("id,category_id")
        .in("id", typeIds);

      if (typeError) throw new Error(typeError.message);

      typeRows =
        (typeData ?? []) as TrainingTypeReviewRow[];
    }

    const typeById = new Map<string, TrainingTypeReviewRow>(
      typeRows.map((type) => [type.id, type]),
    );

    const allowedRecords: TrainingReviewRecordRow[] = [];

    for (const record of records) {
      const trainingTypeId = clean(record.training_type_id);
      const type = trainingTypeId
        ? typeById.get(trainingTypeId)
        : undefined;

      const allowed = await userCanReviewTraining({
        service,
        identity,
        trainingTypeId: trainingTypeId || null,
        categoryId: clean(type?.category_id) || null,
      });

      if (allowed) {
        allowedRecords.push(record);
      }
    }

    const recordIds = nonEmpty(
      allowedRecords.map((record) => record.id),
    );
    const employeeIds = nonEmpty(
      allowedRecords.map((record) => record.employee_id),
    );
    const projectIds = nonEmpty(
      allowedRecords.map((record) => record.project_id),
    );

    let employees: EmployeeReviewRow[] = [];
    let projects: ProjectReviewRow[] = [];
    let documents: TrainingDocumentReviewRow[] = [];

    if (employeeIds.length > 0) {
      const { data: employeeData, error: employeeError } =
        await service
          .from("employees")
          .select("id,payroll_id,full_name")
          .in("id", employeeIds);

      if (employeeError) {
        throw new Error(employeeError.message);
      }

      employees =
        (employeeData ?? []) as EmployeeReviewRow[];
    }

    if (projectIds.length > 0) {
      const { data: projectData, error: projectError } =
        await service
          .from("projects")
          .select("id,name,project_number")
          .in("id", projectIds);

      if (projectError) {
        throw new Error(projectError.message);
      }

      projects =
        (projectData ?? []) as ProjectReviewRow[];
    }

    if (recordIds.length > 0) {
      const { data: documentData, error: documentError } =
        await service
          .from("employee_training_documents")
          .select(
            "id,training_record_id,document_side,generated_file_name,original_file_name,mime_type,file_size_bytes,staging_path,sharepoint_web_url,active",
          )
          .in("training_record_id", recordIds)
          .eq("active", true);

      if (documentError) {
        throw new Error(documentError.message);
      }

      documents =
        (documentData ?? []) as TrainingDocumentReviewRow[];
    }

    return NextResponse.json({
      records: allowedRecords,
      employees,
      projects,
      documents,
    });
  } catch (error) {
    const apiError = trainingApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
