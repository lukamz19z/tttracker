import { NextResponse } from "next/server";
import { qualityWorkflowAccess } from "@/lib/quality/workflow-access";
import { qualityApiError } from "@/lib/quality/server";
import { atomicQualityError } from "@/lib/quality/atomic-error";
import { qualityTowerDisplay } from "@/lib/quality/tower-label";
import { punchlistFields, type PunchlistRow } from "@/lib/quality/punchlist";
import { resolveProjectTower, sourceDateToDb } from "@/lib/quality/punchlist-import-values";
import { validateDetailValues, type DetailSchema } from "@/lib/quality/operational-details";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, sourceKey } = body;
    const { service, user, label } = await qualityWorkflowAccess(request, projectId, true);
    if (!projectId || typeof sourceKey !== "string" || !sourceKey.trim() || sourceKey.length > 200 || !Array.isArray(body.rows) || !body.rows.length || body.rows.length > 500) return NextResponse.json({ error: "Select a project, stable source/client key and 1 to 500 mapped rows." }, { status: 400 });
    if(body.rows.some((row:unknown)=>!row || typeof row!=="object" || punchlistFields.some(key=>typeof (row as Record<string,unknown>)[key]!=="string")))return NextResponse.json({error:"Every mapped row must contain text values for the selected fields."},{status:400});
    const [towers, revisions, existing,issueTypes] = await Promise.all([
      service.from("towers").select("id,name,extra_data").eq("project_id", projectId),
      service.from("tower_revisions").select("id,tower_id,revision_number,source_type,status").eq("project_id", projectId).in("status", ["Draft", "Open", "In Progress", "Ready for Review"]),
      service.from("tower_revision_items").select("id,tower_id,external_reference,source_payload,revision_id,status,record_version").eq("project_id", projectId).eq("source_type", "punchlist").eq("import_source_key", sourceKey.trim()),
      service.from("project_field_issue_types").select("id,name,active,applies_to,detail_schema").eq("project_id",projectId).eq("active",true).in("applies_to",["revision","both"]).order("sort_order").order("name"),
    ]);
    for (const result of [towers, revisions, existing,issueTypes]) if (result.error) throw new Error(result.error.message);
    if ([towers.data?.length, revisions.data?.length, existing.data?.length,issueTypes.data?.length].some(count => count === 1000)) throw new Error("Punchlist preview exceeds the query page size. Narrow this import before continuing.");
    const errors: string[] = [], seen = new Set<string>();
    const resolutions:Record<string,string> = body.towerResolutions && typeof body.towerResolutions==="object" && !Array.isArray(body.towerResolutions) ? body.towerResolutions : {};
    const rows = (body.rows as PunchlistRow[]).map((raw, index) => {
      const row = { ...raw, rowKey:String(index+2) };
      const configured=issueTypes.data?.find(issue=>issue.name.trim().toLowerCase()===row.defectType.trim().toLowerCase());
      row.issueTypeId=configured?.id || "";
      row.operationalDetails=row.operationalDetails && typeof row.operationalDetails==="object" && !Array.isArray(row.operationalDetails)?row.operationalDetails:{};
      const match=resolveProjectTower(row.tower,towers.data || [],resolutions[row.tower]);
      if(match.state!=="matched")errors.push(`Row ${index+2}: tower ${match.state} (${row.tower}). Select a TTTracker tower in the preview.`);
      row.towerId=match.tower?.id || "";
      if (!row.externalReference || !row.description || !row.defectType) errors.push(`Row ${index + 2}: external reference, defect type and description are required.`);
      if (Object.entries(row).some(([key,value])=>key!=="operationalDetails" && typeof value!=="string") || Object.values(row).some(value => typeof value === "string" && value.length > 10000)) errors.push(`Row ${index + 2}: invalid cell data.`);
      if(configured){const detailError=validateDetailValues((configured.detail_schema||{fields:[]}) as DetailSchema,row.operationalDetails);if(detailError)errors.push(`Row ${index+2}: ${detailError}`);}
      else if(Object.keys(row.operationalDetails).length)errors.push(`Row ${index+2}: selected defect type does not match a configured project issue type; structured fields were not imported.`);
      if (row.inspector.includes("@")) errors.push(`Row ${index + 2}: Inspector must be a person name, not an email address.`);
      if (row.leg && !["A", "B", "C", "D"].includes(row.leg)) errors.push(`Row ${index + 2}: choose Leg A, B, C or D.`);
      const date=sourceDateToDb(row.sourceDate,Boolean(body.confirm));
      if(date===null) errors.push(`Row ${index+2}: Source date must be DD/MM/YYYY.`);
      else row.sourceDate=date;
      const key = `${row.towerId}:${row.externalReference?.toUpperCase()}`;
      if (seen.has(key)) errors.push(`Row ${index + 2}: duplicate external reference ${row.externalReference}.`);
      seen.add(key);
      return row;
    });
    const candidates = rows.map(row => ({ row, existing: existing.data?.find(item => item.tower_id === row.towerId && item.external_reference?.trim().toUpperCase() === row.externalReference?.toUpperCase()) || null }));
    const absent = existing.data?.filter(item => !seen.has(`${item.tower_id}:${item.external_reference?.trim().toUpperCase()}`)) || [];
    if (!body.confirm) return NextResponse.json({ rows, errors, candidates, absent, revisions: revisions.data, towers: towers.data?.map(tower => ({ id: tower.id, name: qualityTowerDisplay(tower.name) })),issueTypes:issueTypes.data?.map(issue=>({id:issue.id,name:issue.name,detail_schema:issue.detail_schema})) });
    if (errors.length) return NextResponse.json({ error: errors.join("\n") }, { status: 400 });
    const result = await service.rpc("import_v1_quality_punchlist", { p_project: projectId, p_actor: user.id, p_batch: body.batchId, p_request: { importedByLabel:label, sourceKey: sourceKey.trim(), filename: String(body.filename || "Punchlist"), sourceRevision: String(body.sourceRevision || ""), rows, targets: body.targets || {} } });
    if (result.error) { const error = atomicQualityError(result.error); return NextResponse.json({ error: error.message }, { status: error.status }); }
    return NextResponse.json({ results: result.data, batchId: body.batchId });
  } catch (error) { const result = qualityApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
