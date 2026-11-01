import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const template = await readFile(new URL("../../lib/email/material-notifications.ts", import.meta.url), "utf8");
const links = await readFile(new URL("../../lib/materials/notification-links.ts", import.meta.url), "utf8");
const notifications = await readFile(new URL("../../lib/materials/missing-notifications.ts", import.meta.url), "utf8");
const sendEmail = await readFile(new URL("../../lib/email/daily-dockets.ts", import.meta.url), "utf8");
const openPage = await readFile(new URL("../../app/open/materials/[projectId]/[towerId]/[issueKey]/page.tsx", import.meta.url), "utf8");
const login = await readFile(new URL("../../app/(auth)/login/page.tsx", import.meta.url), "utf8");
const materialsPage = await readFile(new URL("../../app/(protected)/project/[projectId]/tower/[towerId]/materials/page.tsx", import.meta.url), "utf8");

function loadRenderer() {
  const source = template.replace(
    'import { docketEmailShell } from "@/lib/email/daily-dockets";',
    'const docketEmailShell = (_title, body) => `<html><body><strong>TTTracker</strong>${body}</body></html>`;',
  );
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "module", output)(loaded.exports, loaded);
  return loaded.exports.renderMaterialNotificationEmail;
}

test("Materials email uses an escaped, absolute direct issue CTA and plain-text fallback", () => {
  assert.match(template, /href=\"\$\{escapeHtml\(details\.url\)\}\"/);
  assert.match(template, />View Material Issue<\/a>/);
  assert.match(template, /View Material Issue: \$\{details\.url\}/);
  assert.match(links, /\/project\/\$\{encodeURIComponent\(input\.projectId\)\}\/tower\/\$\{encodeURIComponent\(input\.towerId\)\}\/materials/);
  assert.match(links, /\/open\/materials\//);
  assert.match(links, /url\.protocol = "https:"/);
  assert.doesNotMatch(notifications, /Open Missing Materials|\[\/materials\/missing\]/);
  assert.match(sendEmail, /text,\s*attachments:/);
});

test("Material email presents useful event details and omits empty values", () => {
  for (const label of ["Material", "Tower", "Segment", "Drawing", "Urgency", "Required By", "Raised By", "Assigned To", "Project", "Remaining"]) {
    assert.ok(template.includes(`\"${label}\"`), `Missing email field ${label}`);
  }
  assert.match(template, /\.filter\(\(\[, value\]\) => Boolean\(clean\(value\)\)\)/);
  assert.match(template, /replaceAll\("<", "&lt;"\)/);
  assert.match(template, /replaceAll\('"', "&quot;"\)/);
  assert.match(template, /table role=\"presentation\"/);
  assert.match(template, /kindLabel\.toUpperCase\(\)/);
});

test("Rendered screenshot-equivalent email has clean details, escaping, and a direct issue URL", () => {
  const render = loadRenderer();
  const rendered = render({
    kindLabel: "Missing Material",
    title: "Missing Material — Tower 5C3/5C1-136",
    tower: "5C3/5C1-136",
    project: "P-UGL-26-002",
    material: "1003H <script>",
    quantityLabel: "Quantity Missing",
    quantity: 1,
    unit: "ea",
    urgency: "Normal",
    requiredBy: "02/11/2026",
    raisedBy: "Luka Zetovic",
    url: "https://www.tttracker.com.au/open/materials/project-1/tower-136/issue-1?kind=missing&eventId=event-1",
  });
  assert.equal(rendered.subject, "[TTTracker] Missing Material — Tower 5C3/5C1-136");
  assert.match(rendered.html, /href="https:\/\/www\.tttracker\.com\.au\/open\/materials\/project-1\/tower-136\/issue-1\?kind=missing&amp;eventId=event-1"/);
  assert.match(rendered.html, /View Material Issue/);
  assert.match(rendered.html, /1003H &lt;script&gt;/);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /02\/11\/2026/);
  assert.match(rendered.text, /View Material Issue: https:\/\/www\.tttracker\.com\.au\/open\/materials\/project-1\/tower-136\/issue-1\?kind=missing&eventId=event-1/);
  assert.doesNotMatch(rendered.html, /\[\/materials\/missing\]/);
});

test("Email open route preserves a safe login return and focuses the canonical web issue", () => {
  assert.match(openPage, /redirect\(`\/login\?next=\$\{encodeURIComponent\(target\)\}`\)/);
  assert.match(openPage, /redirect\(target\)/);
  assert.match(login, /requested\.startsWith\("\/"\) && !requested\.startsWith\("\/\/"\) && !requested\.includes\("\\\\"\)/);
  assert.match(materialsPage, /query\.get\("issue"\)/);
  assert.match(materialsPage, /setActiveTab\("issues"\)/);
  assert.match(materialsPage, /targetIssue\?\.kind === "missing" \? targetIssue\.issueKey : null/);
  assert.match(materialsPage, /material-issue-\$\{targetIssue\.issueKey\}/);
  assert.match(notifications, /buildMaterialIssueRoute\(/);
  assert.match(notifications, /buildMaterialIssueUrl\(/);
});

