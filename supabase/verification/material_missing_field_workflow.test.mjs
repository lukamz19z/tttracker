import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mobileForm = await readFile(new URL("../../mobile/app/materials/report-missing.tsx", import.meta.url), "utf8");
const materialTypes = await readFile(new URL("../../mobile/lib/materials/canonical-material-type.ts", import.meta.url), "utf8");
const reportRoute = await readFile(new URL("../../app/api/mobile/materials/missing/route.ts", import.meta.url), "utf8");
const notificationService = await readFile(new URL("../../lib/materials/missing-notifications.ts", import.meta.url), "utf8");
const pushRegistration = await readFile(new URL("../../app/api/mobile/push-token/route.ts", import.meta.url), "utf8");
const websiteForm = await readFile(new URL("../../components/materials/ReportMissingMaterialForm.tsx", import.meta.url), "utf8");
const websiteRoute = await readFile(new URL("../../app/api/materials/missing/route.ts", import.meta.url), "utf8");

test("report form separates type and Existing/Manual modes and type-scopes the cached picker", () => {
  assert.match(mobileForm, /Material Type/);
  assert.match(mobileForm, /sourceMode==="existing"\?/);
  assert.match(mobileForm, /sourceMode==="manual"/);
  assert.match(mobileForm, /if\(kind==="bundle"\)/);
  assert.match(mobileForm, /if\(kind==="member"\)/);
  assert.match(mobileForm, /kind==="packer"&&type!=="packer"/);
  assert.match(mobileForm, /!towerId\|\|item\.tower_id===towerId/);
  assert.match(mobileForm, /setSegment\(knownSegments\.length===1\?knownSegments\[0\]:""\)/);
  assert.match(mobileForm, /setDrawing\(clean\(selectedMember\?\.drawing_number\|\|bolt\?\.drawing_number\)\)/);
});

test("manual categories share the canonical material classifier and retain date-only calendar values", () => {
  assert.match(materialTypes, /"packer_plate"/);
  assert.match(materialTypes, /"grid_mesh"/);
  assert.match(materialTypes, /return knownType\(input\.category\) \|\| "other"/);
  assert.match(mobileForm, /const dateDb=\(date:Date\)/);
  assert.match(mobileForm, /setRequiredBy\(dateDb\(day\)\)/);
  assert.match(mobileForm, /Today/);
  assert.match(mobileForm, /Tomorrow/);
  assert.doesNotMatch(mobileForm, /DD\/MM\/YYYY.*TextInput/);
});

test("canonical create commits before notification and stores selected recipients on the material event", () => {
  assert.ok(reportRoute.indexOf("service.rpc(\"tttracker_v1_create_missing_material\"") < reportRoute.indexOf("notifyMissingMaterialEvent({"));
  assert.match(reportRoute, /assigned_to_user_id: assignedToUserId, notify_user_ids: notifyUserIds/);
  assert.match(reportRoute, /materialType: normalizeMissingMaterialType/);
});

test("notification delivery merges recipients, filters preferences, deep-links, and validates Expo tickets", () => {
  assert.match(notificationService, /const channels=new Map/);
  assert.match(notificationService, /channels\.delete\(args\.actorUserId\)/);
  assert.match(notificationService, /filterAppNotificationUserIds/);
  assert.match(notificationService, /user_notifications"\)\.insert/);
  assert.match(notificationService, /ticket\?\.status==="error"/);
  assert.match(notificationService, /ticket\?\.status!=="ok"/);
  assert.match(notificationService, /DeviceNotRegistered/);
  assert.match(notificationService, /action_route:route,action_params:actionParams/);
  assert.match(notificationService, /Missing Materials notification result/);
});

test("push token registration links active Expo token to the authenticated canonical user", () => {
  assert.match(pushRegistration, /requireMobileUser/);
  assert.match(pushRegistration, /user_id: identity\.userId/);
  assert.match(pushRegistration, /expo_push_token: token/);
  assert.match(pushRegistration, /active: true/);
});

test("website tower form uses Existing/Manual, calendar date, canonical mutation and same event notification service",()=>{
  assert.match(websiteForm,/Material Type/);
  assert.match(websiteForm,/Existing/);
  assert.match(websiteForm,/Manual/);
  assert.match(websiteForm,/<input type="date"/);
  assert.match(websiteForm,/assignedToUserId:assignee\|\|null,notifyUserIds:notify/);
  assert.match(websiteRoute,/tttracker_v1_create_missing_material/);
  assert.match(websiteRoute,/normalizeMissingMaterialType/);
  assert.match(websiteRoute,/notifyMissingMaterialEvent/);
});
