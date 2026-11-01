import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reportScreen = await readFile(new URL("../../mobile/app/materials/report-missing.tsx", import.meta.url), "utf8");
const mobileContext = await readFile(new URL("../../mobile/contexts/MaterialsContext.tsx", import.meta.url), "utf8");
const mobileApi = await readFile(new URL("../../app/api/mobile/materials/missing/route.ts", import.meta.url), "utf8");
const websiteApi = await readFile(new URL("../../app/api/materials/missing/route.ts", import.meta.url), "utf8");
const collectApi = await readFile(new URL("../../app/api/mobile/materials/missing/collect-excess/route.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/20261101153000_v1_material_excess_lifecycle.sql", import.meta.url), "utf8");
const eligibleUsers = await readFile(new URL("../../lib/materials/eligible-users.ts", import.meta.url), "utf8");
const existingMigration = await readFile(new URL("../migrations/20261031190000_v1_material_missing_workflow.sql", import.meta.url), "utf8");
const mobileDocketMaterials = await readFile(new URL("../../lib/dockets/mobile-docket-materials.ts", import.meta.url), "utf8");
const docketEditor = await readFile(new URL("../../app/api/mobile/daily-dockets/editor/route.ts", import.meta.url), "utf8");
const docketSave = await readFile(new URL("../../app/api/mobile/daily-dockets/save/route.ts", import.meta.url), "utf8");
const webDocket = await readFile(new URL("../../components/dockets/DailyDocketForm.tsx", import.meta.url), "utf8");
const materialsEvidenceApi = await readFile(new URL("../../app/api/mobile/materials/missing/evidence/route.ts", import.meta.url), "utf8");
const mobileMaterials = await readFile(new URL("../../mobile/app/materials/missing.tsx", import.meta.url), "utf8");
const mobileTransferReceive = await readFile(new URL("../../app/api/mobile/materials/transfers/[transferId]/receive/route.ts", import.meta.url), "utf8");
const websiteMaterials = await readFile(new URL("../../app/(protected)/project/[projectId]/tower/[towerId]/materials/page.tsx", import.meta.url), "utf8");

test("one report flow supports Missing and Excess while preserving offline mutation payload", () => {
  assert.match(reportScreen, /What are you reporting?/);
  assert.match(reportScreen, /issueType,"?towerId/);
  assert.match(reportScreen, /location:issueType==="excess"/);
  assert.match(mobileApi, /tttracker_v1_create_excess_material/);
  assert.match(websiteApi, /tttracker_v1_create_excess_material/);
  assert.match(mobileContext, /event_type:isExcess\?"excess":"missing"/);
});

test("excess collection is a locked, idempotent ledger event with quantity protection", () => {
  assert.match(migration, /tttracker_v1_create_excess_material/);
  assert.match(migration, /tttracker_v1_collect_excess_material/);
  assert.match(migration, /for update of e/);
  assert.match(migration, /client_mutation_id=p_client_mutation_id/);
  assert.match(migration, /if p_quantity>v_remaining then raise exception/);
  assert.match(migration, /'partially_collected'/);
  assert.match(migration, /'excess_collected'/);
  assert.match(collectApi, /excess_partial_collection/);
  assert.match(collectApi, /excess_resolved/);
});

test("existing material source/category IDs and legacy Missing schema are preserved", () => {
  assert.match(reportScreen, /normalizeMissingMaterialType/);
  assert.match(migration, /source_record_id/);
  assert.match(migration, /material_category/);
  assert.match(migration, /specification/);
  assert.match(existingMigration, /tttracker_v1_create_missing_material/);
  assert.doesNotMatch(migration, /drop constraint.*material_type/i);
});

test("Assign pool uses dynamic permissions and Notify pool uses the project configuration list", () => {
  assert.match(eligibleUsers, /materials\.manage_issues/);
  assert.match(eligibleUsers, /materials\.configure/);
  assert.match(eligibleUsers, /project_material_notification_rules/);
  assert.match(eligibleUsers, /eq\("available_for_selection", true\)/);
  assert.match(eligibleUsers, /assignmentUsers: sort\(assignmentIds\), notifyUsers: sort\(notifyIds\)/);
  assert.match(reportScreen, /assignmentUsers/);
  assert.match(reportScreen, /notifyUsers/);
  assert.match(mobileApi, /authorised Materials manager/);
});

test("personnel controls remain available for Missing and Excess independently of configured rules", async () => {
  const mobileScreen = reportScreen;
  const websiteForm = await readFile(new URL("../../components/materials/ReportMissingMaterialForm.tsx", import.meta.url), "utf8");
  const mobileCreateApi = await readFile(new URL("../../app/api/mobile/materials/missing/route.ts", import.meta.url), "utf8");
  assert.match(mobileScreen, /<Text style=\{styles\.label\}>Assign To · Optional<\/Text>/);
  assert.match(mobileScreen, /<Text style=\{styles\.label\}>Also Notify · Optional/);
  assert.match(mobileScreen, /assignedToUserId:assignedToUserId\|\|null,notifyUserIds/);
  assert.match(mobileScreen, /No eligible Materials managers available/);
  assert.match(websiteForm, /Assign To · Optional/);
  assert.match(websiteForm, /Also Notify · Optional/);
  assert.match(websiteForm, /assignedToUserId:assignee\|\|null,notifyUserIds:notify/);
  assert.match(websiteApi, /eligible\.notifyUsers/);
  assert.match(mobileCreateApi, /eligible\.notifyUsers/);
  assert.match(websiteApi, /notifyMissingMaterialEvent\(\{service,projectId,sourceEventId:issue\.event_id,kind:issueType==="excess"\?"excess_raised":"raised"/);
  assert.match(mobileCreateApi, /kind: issueType === "excess" \? "excess_raised" : "raised"/);
});

test("Excess transfers extend the canonical bundle transfer ledger with atomic quantity reservations", () => {
  assert.match(migration, /tower_material_transfers alter column source_bundle_id drop not null/);
  assert.match(migration, /source_issue_key uuid/);
  assert.match(migration, /tttracker_v1_create_excess_transfer/);
  assert.match(migration, /tttracker_v1_receive_excess_transfer/);
  assert.match(migration, /for update of e/);
  assert.match(migration, /v_reserved numeric/);
  assert.match(migration, /Selected Missing requirement is linked to a different canonical material/);
  assert.match(migration, /p_client_mutation_id\|\|':source'/);
  assert.match(migration, /p_client_mutation_id\|\|':destination'/);
  assert.match(mobileMaterials, /Transfer to Tower/);
  assert.match(websiteMaterials, /\/api\/materials\/missing\/transfers/);
  assert.match(mobileTransferReceive, /tttracker_v1_receive_excess_transfer/);
});

test("Daily Dockets include active Excess and preserve finalised material snapshots", () => {
  assert.match(mobileDocketMaterials, /\.in\("event_type", \["missing", "excess"\]\)/);
  assert.match(mobileDocketMaterials, /issue_type: issueType/);
  assert.match(mobileDocketMaterials, /transferred_today_quantity/);
  assert.match(docketSave, /material_issue_snapshot: issueSnapshot/);
  assert.match(docketEditor, /savedIssueSnapshot/);
  assert.match(docketEditor, /selectDocketMaterialSnapshot/);
  assert.match(docketEditor, /docketMaterialIssues/);
  assert.match(webDocket, /\.in\("event_type", \["missing", "excess"\]\)/);
  assert.match(webDocket, /Excess \/ Available/);
  assert.match(webDocket, /transferredTodayByIssue/);
});

test("Initial Excess photos are retained offline and linked to the canonical Excess event", () => {
  assert.match(reportScreen, /chooseExcessPhotos/);
  assert.match(reportScreen, /initialEvidence:issueType==="excess"\?excessPhotos/);
  assert.match(mobileContext, /receiptEventId: result\.issue\.event_id/);
  assert.match(mobileContext, /for \(const photo of mutation\.input\.initialEvidence/);
  assert.match(materialsEvidenceApi, /isInitialIssueEvidence/);
  assert.match(materialsEvidenceApi, /client_evidence_id:clientEvidenceId/);
  assert.match(materialsEvidenceApi, /materials-evidence/);
});
