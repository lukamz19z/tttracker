import test from "node:test";
import assert from "node:assert/strict";
import { matchPunchlistTowerSegment, punchlistFilterSection } from "../lib/quality/punchlist.ts";

test("Punchlist source section remains the filter label while canonical segment stays separate", () => {
  assert.equal(punchlistFilterSection({
    source_type: "punchlist",
    tower_segment: "+0m Leg Extension",
    source_payload: { sourceSection: "Leg Extension", segment: "+0m Leg Extension" },
  }), "Leg Extension");
  assert.equal(punchlistFilterSection({ source_type: "manual", tower_segment: "+3m Leg Extension" }), "+3m Leg Extension");
});

test("legacy Punchlist imports keep their original section filter label", () => {
  assert.equal(punchlistFilterSection({
    source_type: "punchlist",
    tower_segment: "Leg Extension",
    source_payload: { segment: "Leg Extension" },
  }), "Leg Extension");
});

test("ambiguous source sections are not forced to a tower segment", () => {
  assert.equal(matchPunchlistTowerSegment("Leg Extension", ["+0m Leg Extension", "+3m Leg Extension", "Common Body"]), null);
});

test("an unambiguous source section maps to the one canonical tower segment", () => {
  assert.equal(matchPunchlistTowerSegment("Leg Extension", ["+0m Leg Extension", "Common Body"]), "+0m Leg Extension");
  assert.equal(matchPunchlistTowerSegment("Common Body", ["+0m Leg Extension", "Common Body"]), "Common Body");
});
