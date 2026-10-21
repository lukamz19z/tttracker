import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync("v2/components/people/people-documents-hub.tsx", "utf8");
const page = readFileSync("v2/components/people/people-settings-page.tsx", "utf8");
const styles = readFileSync("v2/components/people/people.module.css", "utf8");

assert.match(page, /section === "documents"\) return <PeopleDocumentsHub/);
assert.doesNotMatch(page, /Training evidence naming/);
assert.match(component, /label: "Manage Training File Naming", href: `\/workspace\/people\/training\/configuration\?\$\{query\}&section=file_naming`/);
assert.match(component, /label: "Manage SharePoint Storage", href: `\/workspace\/settings\/integrations\/sharepoint\?\$\{query\}&context=people`/);
assert.match(component, /label: "Manage Onboarding Templates", href: `\/workspace\/settings\/people\/onboarding\/templates\?\$\{query\}`/);
assert.match(component, /label: "Configure Document Rules", href: onboardingSetup/);
assert.match(component, /className="tt-button-secondary"/);
assert.match(component, /permissions\["training\.configure"\] === true/);
assert.match(component, /permissions\["people\.configure"\] === true/);
assert.match(component, /catch\(\(\) => \{ if \(active\) setState\(\{ data: null, unavailable: true \}\); \}\)/);
assert.match(component, /ruleStatus\(peopleRule, "folder_template"\)/);
assert.match(component, /ruleStatus\(trainingRule, "filename_template"\)/);
assert.match(component, /activeLocations\.length === 0 \? "Needs Attention" : "Connected"/);
assert.match(styles, /\.peopleDocumentRows\s*\{[^}]*grid-template-columns: repeat\(auto-fit/);
assert.match(styles, /@media \(max-width: 760px\)\s*\{\s*\.peopleDocumentRows \{ grid-template-columns: minmax\(0, 1fr\); \}/);

console.log("People Documents hub route, permission, status, action and responsive checks passed.");
