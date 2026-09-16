import { NextRequest, NextResponse } from "next/server";

import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrainingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string;
  training_short_code: string | null;
  category: string | null;
  record_kind: string | null;
  certificate_number: string | null;
  class_codes: string[] | null;
  option_ids: string[] | null;
  option_codes: string[] | null;
  provider: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  project_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  workflow_status: string | null;
  record_status: string | null;
  review_comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  current_version: boolean | null;
  supersedes_record_id: string | null;
  superseded_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(
      request,
      "mobile.training",
    );

    if (!identity.employeeId) {
      return NextResponse.json({
        employee: null,
        records: [],
        documents: [],
        types: [],
        options: [],
        fields: [],
        projects: [],
        message: "Your TTTracker login is not linked to an employee profile.",
      });
    }

    const [
      employeeResult,
      recordsResult,
      typesResult,
      optionsResult,
      fieldsResult,
      projectAccessResult,
    ] = await Promise.all([
      service
        .from("employees")
        .select("id,payroll_id,full_name,user_id,active")
        .eq("id", identity.employeeId)
        .maybeSingle(),
      service
        .from("employee_training_records")
        .select("id,employee_id,training_type_id,training_name,training_short_code,category,record_kind,certificate_number,class_codes,option_ids,option_codes,provider,issuing_authority,issue_date,expiry_date,does_not_expire,project_id,notes,metadata,workflow_status,record_status,review_comment,submitted_at,reviewed_at,approved_at,current_version,supersedes_record_id,superseded_at,revoked_at,created_at")
        .eq("employee_id", identity.employeeId)
        .order("created_at", { ascending: false }),
      service
        .from("training_types")
        .select("id,category_id,name,short_code,category,record_kind,active,requires_issue_date,requires_expiry_date,allows_no_expiry,validity_mode,validity_interval_value,validity_interval_unit,requires_certificate_number,requires_issuer,requires_project,requires_document,document_upload_type,allows_multiple_current,subtype_mode,requires_review,allowed_extensions,max_file_size_mb,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      service
        .from("training_type_options")
        .select("id,training_type_id,name,code,description,active,sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      service
        .from("training_type_fields")
        .select("id,training_type_id,field_key,label,field_type,required,options,placeholder,help_text,active,sort_order")
        .eq("active", true)
        .order("sort_order"),
      service
        .from("project_access")
        .select("project_id,projects(id,name,project_number,status)")
        .eq("user_id", identity.userId),
    ]);

    for (const result of [employeeResult, recordsResult, typesResult, optionsResult, fieldsResult, projectAccessResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const records = (recordsResult.data ?? []) as TrainingRecord[];
    const recordIds = records.map((record) => record.id);

    const documentResult = recordIds.length
      ? await service
          .from("employee_training_documents")
          .select("id,training_record_id,document_type_name,document_type_code,document_side,generated_file_name,original_file_name,mime_type,file_size_bytes,staging_path,sharepoint_web_url,active,created_at")
          .in("training_record_id", recordIds)
          .order("created_at")
      : { data: [], error: null };

    if (documentResult.error) throw new Error(documentResult.error.message);

    const projects = (projectAccessResult.data ?? [])
      .map((row) => {
        const relation = row.projects;
        const project = Array.isArray(relation) ? relation[0] ?? null : relation;
        if (!project) return null;
        return {
          id: project.id,
          name: project.name,
          projectNumber: project.project_number,
          status: project.status,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return NextResponse.json({
      employee: employeeResult.data,
      records,
      documents: documentResult.data ?? [],
      types: typesResult.data ?? [],
      options: optionsResult.data ?? [],
      fields: fieldsResult.data ?? [],
      projects,
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
