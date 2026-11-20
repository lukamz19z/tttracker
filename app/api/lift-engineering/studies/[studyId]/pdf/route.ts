import { NextResponse } from "next/server";
import { assertLiftProjectAccess, liftApiError, requireLiftAccess, LIFT_ACCESS } from "@/lib/lift-engineering/server";
import { ensureLiftStudyFolder, uploadLiftStudyPdf } from "@/lib/lift-engineering/sharepoint";
import { generateLiftStudyPdf } from "@/lib/lift-engineering/study-pdf";

export async function POST(request: Request, context: { params: Promise<{ studyId: string }> }) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { studyId } = await context.params;
    const { data: study, error } = await service.from("lift_studies").select("id,project_id,study_number,title,current_revision_id,status").eq("id", studyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!study) return NextResponse.json({ error: "Lift Study was not found." }, { status: 404 });
    await assertLiftProjectAccess(service, user.id, study.project_id);
    const [{ data: project, error: projectError }, { data: revision, error: revisionError }, { data: reviews, error: reviewError }] = await Promise.all([
      service.from("projects").select("id,sharepoint_drive_id,sharepoint_folder_id").eq("id", study.project_id).single(),
      service.from("lift_study_revisions").select("id,revision_label,status,issued_at,calculation_engine_version,methodology_version,input_snapshot,output_snapshot,generated_pdf").eq("id", study.current_revision_id).maybeSingle(),
      service.from("lift_study_reviews").select("action,actor_label,comments,created_at").eq("study_revision_id", study.current_revision_id).order("created_at"),
    ]);
    if (projectError || !project) throw new Error(projectError?.message || "Project could not be found.");
    if (revisionError) throw new Error(revisionError.message);
    if (reviewError) throw new Error(reviewError.message);
    if (!revision) return NextResponse.json({ error: "Current Lift Study revision was not found." }, { status: 404 });
    if (!project.sharepoint_drive_id || !project.sharepoint_folder_id) return NextResponse.json({ error: "Project SharePoint delivery folder is not configured." }, { status: 409 });
    const output = revision.output_snapshot && typeof revision.output_snapshot === "object" ? revision.output_snapshot as Record<string, unknown> : {};
    const input = revision.input_snapshot && typeof revision.input_snapshot === "object" ? revision.input_snapshot as Record<string, unknown> : {};
    const lifts = Array.isArray(output.lifts) ? output.lifts : [];
    if (lifts.length === 0) return NextResponse.json({ error: "Calculate at least one lift before generating the report." }, { status: 409 });
    const bytes = generateLiftStudyPdf({ ...output, studyNumber: study.study_number, title: study.title, status: revision.status,
      revisionLabel: revision.revision_label, calculationEngineVersion: revision.calculation_engine_version,
      methodologyVersion: revision.methodology_version, sourceDocuments: input.sourceDocuments, reviews: reviews ?? [] });
    const folder = await ensureLiftStudyFolder({ driveId: project.sharepoint_drive_id, projectFolderId: project.sharepoint_folder_id,
      studyNumber: study.study_number, revisionLabel: revision.revision_label });
    const fileName = `${study.study_number}-REV-${revision.revision_label}-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
    const uploaded = await uploadLiftStudyPdf({ driveId: project.sharepoint_drive_id, folderId: folder.id, fileName, content: bytes });
    const ref = { driveId: project.sharepoint_drive_id, folderId: folder.id, itemId: uploaded.id, fileName: uploaded.name, webUrl: uploaded.webUrl ?? null, createdAt: new Date().toISOString() };
    const priorRefs = Array.isArray(revision.generated_pdf) ? revision.generated_pdf : revision.generated_pdf ? [revision.generated_pdf] : [];
    const { error: updateError } = await service.from("lift_study_revisions").update({ generated_pdf: [...priorRefs, ref] }).eq("id", revision.id);
    if (updateError) throw new Error(`PDF uploaded, but the revision reference could not be saved: ${updateError.message}`);
    const { error: docError } = await service.from("lift_documents").insert({ project_id: study.project_id, study_id: study.id, study_revision_id: revision.id,
      document_type: "study_report", file_name: uploaded.name, sharepoint_drive_id: project.sharepoint_drive_id,
      sharepoint_item_id: uploaded.id, sharepoint_folder_id: folder.id, sharepoint_web_url: uploaded.webUrl ?? null,
      created_by: user.id });
    if (docError) throw new Error(`PDF uploaded and revision linked, but document index save failed: ${docError.message}`);
    return NextResponse.json({ document: ref }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
