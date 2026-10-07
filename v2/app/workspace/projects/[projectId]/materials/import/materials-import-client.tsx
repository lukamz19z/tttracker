"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Download,
  Layers3,
  Search,
  Upload,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { Card, tt } from "@/components/ui/tt-ui";
import { evaluateApplicability, profileApplicability, type ApplicabilityRule } from "@/lib/materials/applicability";
import { importTargets, towerReferenceAliases, type MaterialImportScope } from "@/lib/materials/import-scope";
import { parseMaterialsCsv } from "@/lib/materials/import-csv";
import type { CsvRow } from "@/lib/towers/csv";
import { isRecord, prepareImportRows, importValidationCounts, groupImportErrors, type ImportRowError } from "@/lib/materials/import-validation";

type Props = {
  organisationId: string;
  projectId: string;
  towers: Array<{ id: string; tower_identifier: string; tower_type?: string | null; line?: string | null }>;
  importProfiles?: Array<{ name: string; sourceRole: string; mapping: Record<string, string>; defaults: Record<string, unknown> }>;
  initialTowerId?: string;
  sourceRoleOptions?: Array<{ key: string; label: string; settings: Record<string, unknown> | null }>;
};

type ImportCategory = "bundles" | "members" | "bolts" | "packers";
type ImportMode = "add" | "merge" | "replace";
type SourceRole = "packing_list" | "drawing_schedule" | "member_schedule" | "supplier_list" | "manual" | "custom";

type FieldDef = { key: string; label: string; required?: boolean; aliases?: string[] };

const categoryMeta: Record<ImportCategory, {
  label: string;
  description: string;
  template: string;
  icon: typeof Boxes;
}> = {
  bundles: {
    label: "Bundles",
    description: "Bundle / pack register for the selected scope. This drives the site bundle check-off list.",
    template: "/templates/materials/bundles.csv",
    icon: Boxes,
  },
  members: {
    label: "Members",
    description: "Member marks, bundle relationship, drawing and tower segment. Packing-list and drawing sources can be imported separately and reconciled.",
    template: "/templates/materials/members.csv",
    icon: Layers3,
  },
  bolts: {
    label: "Bolts",
    description: "Bolt requirements by drawing, segment, diameter, length and type for the selected scope.",
    template: "/templates/materials/bolts.csv",
    icon: Wrench,
  },
  packers: {
    label: "Packers",
    description: "Packer requirements by drawing, segment, diameter / packer mark and quantity for the selected scope.",
    template: "/templates/materials/packers.csv",
    icon: Wrench,
  },
};

const fieldSets: Record<ImportCategory, FieldDef[]> = {
  bundles: [
    { key: "bundle_reference", label: "Bundle Reference", required: true, aliases: ["bundle", "bundle no", "bundle number", "pack", "pack no"] },
    { key: "segment", label: "Tower Segment", aliases: ["tower section"] },
    { key: "package_context", label: "Manifest Section / Package Context", aliases: ["section", "bundle section", "package context"] },
    { key: "required_quantity", label: "Required Qty", aliases: ["qty", "quantity", "bundle qty"] },
    { key: "total_weight_t", label: "Total Weight (t)", aliases: ["weight", "weight t", "total weight"] },
    { key: "source_revision", label: "Source Revision", aliases: ["revision", "rev"] },
    { key: "description", label: "Description", aliases: ["notes", "description"] },
  ],
  members: [
    { key: "applicable_towers", label: "Applicable Towers", aliases: ["applicable towers", "applicability", "applies to", "applicable structures"] },
    { key: "item_reference", label: "Member / Mark", required: true, aliases: ["mark", "mark no", "member", "member mark", "member no", "member number"] },
    { key: "bundle_reference", label: "Bundle Reference", aliases: ["bundle", "bundle no", "bundle number", "pack", "pack no"] },
    { key: "package_context", label: "Packing Context (optional)", aliases: ["package context", "bundle section"] },
    { key: "material_code", label: "Material Code", aliases: ["material code", "grade"] },
    { key: "profile", label: "Profile / Section Size", aliases: ["profile", "section", "section / profile", "section size", "member size"] },
    { key: "required_quantity", label: "Qty / Tower", aliases: ["qty", "quantity", "qty per tower"] },
    { key: "drawing_reference", label: "Drawing Reference", aliases: ["drawing", "drawing no", "drawing number", "dwg", "dwg no"] },
    { key: "drawing_revision", label: "Drawing Revision", aliases: ["revision", "rev", "drawing rev"] },
    { key: "segment", label: "Tower Segment", aliases: ["segment", "tower section"] },
    { key: "description", label: "Description", aliases: ["description", "notes"] },
  ],
  bolts: [
    { key: "item_reference", label: "Bolt Reference", aliases: ["bolt", "bolt reference", "item", "item reference"] },
    { key: "diameter", label: "Diameter", required: true, aliases: ["diameter", "bolt diameter", "size"] },
    { key: "length", label: "Length", aliases: ["length", "bolt length"] },
    { key: "bolt_type", label: "Bolt Type", aliases: ["bolt type", "type", "dn sn"] },
    { key: "required_quantity", label: "Required Qty", required: true, aliases: ["qty", "quantity", "required qty"] },
    { key: "drawing_reference", label: "Drawing Reference", required: true, aliases: ["drawing", "drawing no", "drawing number", "dwg", "dwg no"] },
    { key: "drawing_revision", label: "Drawing Revision", aliases: ["revision", "rev"] },
    { key: "segment", label: "Tower Segment", aliases: ["segment", "section", "tower section"] },
    { key: "description", label: "Description", aliases: ["description", "notes"] },
  ],
  packers: [
    { key: "item_reference", label: "Packer Reference", aliases: ["packer", "packer reference", "item", "item reference"] },
    { key: "diameter", label: "Diameter", aliases: ["diameter", "size"] },
    { key: "packer_mark", label: "Packer Mark / No.", required: true, aliases: ["packer mark", "packer no", "packer number", "mark"] },
    { key: "required_quantity", label: "Required Qty", required: true, aliases: ["qty", "quantity", "required qty"] },
    { key: "drawing_reference", label: "Drawing Reference", required: true, aliases: ["drawing", "drawing no", "drawing number", "dwg", "dwg no"] },
    { key: "drawing_revision", label: "Drawing Revision", aliases: ["revision", "rev"] },
    { key: "segment", label: "Tower Segment", aliases: ["segment", "section", "tower section"] },
    { key: "description", label: "Description", aliases: ["description", "notes"] },
  ],
};

const sourceRoles: Record<ImportCategory, Array<{ key: SourceRole; label: string; help: string }>> = {
  bundles: [
    { key: "supplier_list", label: "Supplier / Bundle List", help: "The physical bundles expected for the tower." },
    { key: "packing_list", label: "Packing List", help: "Bundle data extracted from a supplier packing list." },
    { key: "custom", label: "Custom Source", help: "Any other bundle source with manual column mapping." },
  ],
  members: [
    { key: "packing_list", label: "Packing List", help: "Defines which member is physically in which bundle." },
    { key: "drawing_schedule", label: "Drawing / Material Schedule", help: "Defines which members are required by drawing and tower segment." },
    { key: "member_schedule", label: "Member Schedule", help: "A combined member schedule with bundle, drawing and/or segment data." },
    { key: "custom", label: "Custom Source", help: "Any other member source with manual column mapping." },
  ],
  bolts: [
    { key: "drawing_schedule", label: "Drawing / Bolt Schedule", help: "Bolt requirements from tower drawings or schedules." },
    { key: "supplier_list", label: "Supplier List", help: "Supplier-provided bolt list." },
    { key: "custom", label: "Custom Source", help: "Any other bolt source." },
  ],
  packers: [
    { key: "drawing_schedule", label: "Drawing / Packer Schedule", help: "Packer requirements from tower drawings or schedules." },
    { key: "supplier_list", label: "Supplier List", help: "Supplier-provided packer list." },
    { key: "custom", label: "Custom Source", help: "Any other packer source." },
  ],
};

function norm(value: string) {
  return value.toLowerCase().replace(/[()]/g, "").replace(/[._\/-]+/g, " ").replace(/\s+/g, " ").trim();
}

function autoMap(headers: string[], fields: FieldDef[]) {
  const next: Record<string, string> = {};
  for (const field of fields) {
    const candidates = [field.key, field.label, ...(field.aliases ?? [])].map(norm);
    const exact = headers.find((header) => candidates.includes(norm(header)));
    if (exact) next[field.key] = exact;
  }
  return next;
}

function TowerPicker({ towers, value, onChange }: { towers: Props["towers"]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const selected = towers.find((tower) => tower.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return towers.slice(0, 80);
    return towers.filter((tower) => [tower.tower_identifier, tower.tower_type, tower.line].filter(Boolean).join(" ").toLowerCase().includes(q)).slice(0, 80);
  }, [query, towers]);

  return (
    <div>
      <div className="tt-label">Tower *</div>
      {selected ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid rgba(56,189,248,.35)", borderRadius: 12, padding: 12 }}>
          <div><strong>{selected.tower_identifier}</strong><div className={tt.secondary}>{[selected.tower_type, selected.line].filter(Boolean).join(" · ") || "Selected tower"}</div></div>
          <button type="button" className={`${tt.button} ${tt.buttonSecondary}`} onClick={() => { onChange(""); setQuery(""); }}>Change</button>
        </div>
      ) : (
        <div>
          <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 11, top: 12, opacity: .55 }} /><input className="tt-input" style={{ paddingLeft: 34 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tower number / type…" /></div>
          <div style={{ marginTop: 8, maxHeight: 260, overflow: "auto", display: "grid", gap: 5 }}>
            {filtered.map((tower) => <button key={tower.id} type="button" onClick={() => onChange(tower.id)} style={{ textAlign: "left", border: "1px solid rgba(148,163,184,.18)", background: "transparent", color: "inherit", borderRadius: 10, padding: "9px 11px", cursor: "pointer" }}><strong>{tower.tower_identifier}</strong><span className={tt.secondary} style={{ marginLeft: 8 }}>{[tower.tower_type, tower.line].filter(Boolean).join(" · ")}</span></button>)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MaterialsImportClient({ organisationId, projectId, towers, initialTowerId = "", sourceRoleOptions = [], importProfiles = [] }: Props) {
  const [towerId, setTowerId] = useState(initialTowerId);
  const [category, setCategory] = useState<ImportCategory>("bundles");
  const [sourceRole, setSourceRole] = useState<SourceRole>("supplier_list");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [sourceRowNumbers, setSourceRowNumbers] = useState<number[]>([]);
  const [ignoredEmptyRows, setIgnoredEmptyRows] = useState(0);
  const [validation, setValidation] = useState<ReturnType<typeof importValidationCounts> | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [profileName, setProfileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);
  const [sourceScope, setSourceScope] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualRow, setManualRow] = useState<Record<string, string>>({});

  const [importScope, setImportScope] = useState<MaterialImportScope>("single");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmTypes, setConfirmTypes] = useState(false);
  const [blankBehaviour, setBlankBehaviour] = useState<ApplicabilityRule["blank"]>("common");
  const [applicabilityDelimiter, setApplicabilityDelimiter] = useState(",");
  const [bundleIdentity, setBundleIdentity] = useState<"source_row" | "reference_context">("source_row");
  const [unmatchedBehaviour, setUnmatchedBehaviour] = useState<"error" | "retain">("retain");
  const [effectiveSearch, setEffectiveSearch] = useState("");
  const [referenceSearch, setReferenceSearch] = useState("");
  const [profiles, setProfiles] = useState(importProfiles);
  const [editSetup, setEditSetup] = useState(false);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewPage, setPreviewPage] = useState(0);
  const [errorSearch, setErrorSearch] = useState("");
  const applicabilityRule: ApplicabilityRule | undefined = category === "members" && mapping.applicable_towers
    ? { kind: "tower_list", blank: blankBehaviour, delimiter: applicabilityDelimiter, unmatched: unmatchedBehaviour } : undefined;
  const towerField: FieldDef = { key: "tower_reference", label: "Tower Identifier", required: true, aliases: towerReferenceAliases };
  const fields = importScope === "csv" ? [towerField, ...fieldSets[category]] : fieldSets[category];
  const targetSummary = useMemo(() => importTargets(importScope, towers, towerId, selectedIds,
    prepareImportRows(rows, mapping, category, sourceRowNumbers).rows), [importScope, towers, towerId, selectedIds, rows, mapping, category, sourceRowNumbers]);
  const preparedPreview = prepareImportRows(rows, mapping, category, sourceRowNumbers);
  const applicability = evaluateApplicability(preparedPreview.rows, towers, targetSummary.towers, applicabilityRule);
  const previewRows = rows.filter(row => Object.values(row).some(value => value.toLowerCase().includes(previewSearch.toLowerCase())));
  const previewPages = Math.max(1, Math.ceil(previewRows.length / 10));
  const fatalErrors = [...new Map([...preparedPreview.rowErrors, ...applicability.rowErrors, ...(importScope === "csv" ? targetSummary.rowErrors : []), ...rowErrors].map(error=>[`${error.row}:${error.message}`,error])).values()];
  const fatalRows = new Set(fatalErrors.map(error => error.row)).size;

  const memberPreviewKeys = ["item_reference","bundle_reference","drawing_reference","profile","required_quantity","segment","applicable_towers"];
  const previewFields = category === "members" ? memberPreviewKeys.flatMap(key => fields.filter(field=>field.key===key && mapping[key])) : fields.filter(field=>mapping[field.key]).slice(0,9);
  const required = fields.filter((field) => field.required).map((field) => field.key);
  const missingRequired = required.filter((key) => !mapping[key]);
  const configuredRoles = sourceRoleOptions
    .filter((option) => {
      const appliesTo = Array.isArray(option.settings?.applies_to) ? option.settings?.applies_to as unknown[] : [];
      return appliesTo.length === 0 || appliesTo.map(String).includes(category);
    })
    .map((option) => ({ key: option.key as SourceRole, label: option.label, help: sourceRoles[category].find((role) => role.key === option.key)?.help ?? "Configured material import source." }));
  const availableRoles = configuredRoles.length ? configuredRoles : sourceRoles[category];
  const roleHelp = availableRoles.find((role) => role.key === sourceRole)?.help ?? "";

  function loadProfile(profile: NonNullable<Props["importProfiles"]>[number]) {
    setProfileName(profile.name); setMapping(profile.mapping); setSourceRole(profile.sourceRole as SourceRole);
    const rule = profileApplicability(profile.defaults);
    setBlankBehaviour(rule.blank); setApplicabilityDelimiter(rule.delimiter); setUnmatchedBehaviour("retain");
    const options = isRecord(profile.defaults.import_options) ? profile.defaults.import_options : {};
    setBundleIdentity(options.bundleIdentity === "reference_context" ? "reference_context" : "source_row");
    setValidation(null); setRowErrors([]); setConfirmTypes(false);
  }
  async function saveProfile() {
    if (!profileName.trim()) { setMessage("Enter a profile name before saving."); return; }
    setBusy(true);
    try {
      const defaults = { import_category_key: category, import_options: { applicability: applicabilityRule, bundleIdentity } };
      const response = await fetch(`/api/projects/${projectId}/materials/import/profiles`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId, name: profileName.trim(), sourceRole, mapping, defaults }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Profile could not be saved.");
      const saved = { name: profileName.trim(), sourceRole, mapping, defaults };
      setProfiles(previous => [...previous.filter(profile => profile.name.toLowerCase() !== saved.name.toLowerCase()), saved]);
      setMessage(`Saved profile ${saved.name}. No material records were changed.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Profile could not be saved."); }
    finally { setBusy(false); }
  }
  function resetData(nextCategory = category) {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setSourceRowNumbers([]);
    setIgnoredEmptyRows(0);
    setValidation(null);
    setMapping({});
    setProfileName("");
    setSourceScope("");
    setRowErrors([]);
    setManualRow({});
    setMessage(null);
    setManualMode(false);
    const configured = sourceRoleOptions
      .filter((option) => {
        const appliesTo = Array.isArray(option.settings?.applies_to) ? option.settings?.applies_to as unknown[] : [];
        return appliesTo.length === 0 || appliesTo.map(String).includes(nextCategory);
      })
      .map((option) => option.key as SourceRole);
    const firstRole = configured[0] ?? sourceRoles[nextCategory][0]?.key ?? "custom";
    setSourceRole(firstRole);
    setBlankBehaviour("common"); setUnmatchedBehaviour("retain"); setApplicabilityDelimiter(",");
    const saved = profiles.filter(profile => profile.defaults.import_category_key === nextCategory);
    if (saved.length) loadProfile(saved[0]);
  }

  async function loadFile(file: File) {
    setRows([]);
    setSourceRowNumbers([]);
    setIgnoredEmptyRows(0);
    setValidation(null);
    setHeaders([]);
    setMapping({});
    setFileName("");
    setRowErrors([]);
    try {
      const parsed = parseMaterialsCsv(await file.text());
      setFileName(file.name);
      setSourceScope(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setSourceRowNumbers(parsed.sourceRowNumbers);
      setIgnoredEmptyRows(parsed.ignoredEmptyRows);
      const saved = profiles.find(profile => profile.name.toLowerCase() === profileName.toLowerCase() && profile.defaults.import_category_key === category);
      if (saved) loadProfile(saved); else setMapping(autoMap(parsed.headers, fields));
      setPreviewPage(0);
      setMessage(parsed.rows.length ? null : "No material rows detected. Empty source rows were ignored.");
      setManualMode(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CSV could not be parsed.");
    }
  }

  async function commit(importRows = rows, importMapping = mapping, sourceFileName = fileName) {
    if (importScope !== "csv" && !targetSummary.towers.length) { setMessage("Select the target towers before importing materials."); return; }
    if (["all", "selected"].includes(importScope) && targetSummary.towers.length > 1 && !confirmTypes) { setMessage("Confirm the schedule applies to the selected tower types before importing."); return; }
    const requiredMissing = required.filter((key) => !importMapping[key]);
    if (requiredMissing.length) { setMessage(`Map required field(s): ${requiredMissing.join(", ")}.`); return; }
    if (!importRows.length) { setMessage("There are no rows to import."); return; }

    const rowNumbers = importRows === rows ? sourceRowNumbers : [1];
    const prepared = prepareImportRows(importRows, importMapping, category, rowNumbers);
    if (importScope === "csv") prepared.rowErrors.push(...importTargets(importScope, towers, towerId, selectedIds, prepared.rows).rowErrors);
    prepared.rowErrors.push(...evaluateApplicability(prepared.rows, towers, targetSummary.towers, applicabilityRule).rowErrors);
    setValidation(importValidationCounts(importRows.length - prepared.ignoredEmptyRows, prepared.rowErrors));
    setRowErrors(prepared.rowErrors);
    if (prepared.rowErrors.length) {
      setMessage("Validation failed - fix the rows below before importing. No rows were applied.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/materials/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          towerId,
          importScope,
          targetTowerIds: importScope === "all" ? towers.map(tower => tower.id) : selectedIds,
          confirmTowerTypes: confirmTypes,
          importCategory: category,
          importOptions: { applicability: applicabilityRule, bundleIdentity },
          sourceRole,
          sourceFileName,
          sourceScope: sourceScope.trim() || sourceFileName,
          rows: importRows,
          sourceRowNumbers: rowNumbers,
          mapping: importMapping,
          mode,
          profileName: profileName.trim() || null,
        }),
      });
      const payload = await response.json();
      const errors: ImportRowError[] = payload.rowErrors ?? [];
      setRowErrors(errors);
      setValidation(importValidationCounts(prepared.rows.length, errors, response.ok && payload.ok === true ? prepared.rows.length : 0));
      if (!response.ok || payload.ok !== true) {
        setMessage(payload.error ?? "Import failed. No rows were applied.");
        return;
      }
      setMessage(`${prepared.rows.length} valid source rows stored; ${payload.appliedRequirementRows ?? prepared.rows.length} tower requirements across ${payload.targetTowers ?? 1} tower(s); ${payload.addedRows} master rows added; ${payload.mergedRows} merged; ${payload.unchangedRows} existing masters kept unchanged; ${payload.supersededRows} source requirements superseded. ${payload.pendingAssignments ?? 0} packing assignments pending. All ${prepared.rows.length} source rows recorded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function commitManual() {
    const row: CsvRow = {};
    const nextMapping: Record<string, string> = {};
    fields.forEach((field) => {
      const value = manualRow[field.key] ?? "";
      row[field.label] = value;
      nextMapping[field.key] = field.label;
    });
    await commit([row], nextMapping, "Manual Entry");
  }

  return (
    <div className={tt.stack}>
      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <h2 className={tt.cardTitle}>{categoryMeta[category].label} Import</h2>
          <Link className={`${tt.button} ${tt.buttonSecondary}`} href={`/workspace/projects/${projectId}/materials?organisation=${encodeURIComponent(organisationId)}`}><ArrowLeft size={14}/> Materials Control</Link>
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}>
          <select aria-label="Import type" className="tt-select" style={{width:"auto"}} value={category} onChange={event=>{const next=event.target.value as ImportCategory;setCategory(next);resetData(next);}}>{(Object.keys(categoryMeta) as ImportCategory[]).map(key=><option key={key} value={key}>{categoryMeta[key].label}</option>)}</select>
          <select aria-label="Import scope" className="tt-select" style={{width:"auto"}} value={importScope} onChange={event=>{const next=event.target.value as MaterialImportScope;setImportScope(next);setConfirmTypes(false);setValidation(null);setRowErrors([]);if(next==="csv")setMapping(previous=>({...previous,...autoMap(headers,[towerField])}));}}><option value="single">Single tower</option><option value="selected">Selected towers</option><option value="all">Evaluate all project towers</option><option value="csv">Tower from CSV</option></select>
          <select aria-label="Import mode" className="tt-select" style={{width:"auto"}} value={mode} onChange={event=>{setMode(event.target.value as ImportMode);setRowErrors([]);setValidation(null);}}><option value="add">Add</option><option value="merge">Merge</option><option value="replace">Replace</option></select>
          <label className={`${tt.button} ${tt.buttonSecondary}`}><Upload size={14}/>{fileName ? "Change file" : "Choose CSV"}<input hidden type="file" accept=".csv,text/csv" onChange={event=>{const file=event.target.files?.[0];if(file)void loadFile(file);}}/></label>
          <button className={`${tt.button} ${tt.buttonSecondary}`} onClick={()=>setEditSetup(previous=>!previous)}>{editSetup ? "Done" : "Edit setup"}</button>
        </div>
        <p className={tt.cardDescription} style={{marginTop:8}}>{fileName || (manualMode ? "Manual entry" : "No file selected")} | {rows.length} material rows detected | {targetSummary.towers.length} target towers{ignoredEmptyRows ? ` | ${ignoredEmptyRows} empty source rows ignored` : ""}</p>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:8}}><span>Profile</span><input className="tt-input" style={{width:240}} list="materials-import-profiles" value={profileName} onChange={event=>{setProfileName(event.target.value);const profile=profiles.find(item=>item.name===event.target.value&&item.defaults.import_category_key===category);if(profile)loadProfile(profile);}} placeholder="Search saved profile / new name"/><datalist id="materials-import-profiles">{profiles.filter(profile=>profile.defaults.import_category_key===category).map(profile=><option key={profile.name} value={profile.name}/>)}</datalist><button className={`${tt.button} ${tt.buttonSecondary}`} disabled={busy} onClick={()=>void saveProfile()}>Save profile</button></div>
        {importScope === "single" ? <div style={{marginTop:8}}><TowerPicker towers={towers} value={towerId} onChange={value=>{setTowerId(value);setConfirmTypes(false);setValidation(null);setRowErrors([]);}}/></div> : null}
        {importScope === "selected" ? <div style={{marginTop:8}}><TowerPicker towers={towers.filter(tower=>!selectedIds.includes(tower.id))} value="" onChange={id=>{setSelectedIds(previous=>[...previous,id]);setConfirmTypes(false);setRowErrors([]);}}/><span>{selectedIds.length} towers selected</span><details><summary>Change selected towers</summary>{selectedIds.map(id=><button key={id} className={`${tt.button} ${tt.buttonSecondary}`} onClick={()=>{setSelectedIds(previous=>previous.filter(value=>value!==id));setConfirmTypes(false);}}>{towers.find(tower=>tower.id===id)?.tower_identifier} x</button>)}</details></div> : null}
        {category === "members" && mapping.applicable_towers ? <p className={tt.help}>Blank applicability: {blankBehaviour === "common" ? "Common within selected scope" : blankBehaviour === "none" ? "No towers" : "Fatal error"} | Delimiter: {applicabilityDelimiter} | Unresolved references retained</p> : null}
        {editSetup ? <div style={{display:"grid",gap:10,marginTop:12}}>
          <label>Source document scope<input className="tt-input" value={sourceScope} onChange={event=>setSourceScope(event.target.value)} placeholder="Defaults to filename"/></label>
          <label>Data source<select className="tt-select" value={sourceRole} onChange={event=>{setSourceRole(event.target.value as SourceRole);setRowErrors([]);setValidation(null);}}>{availableRoles.map(role=><option key={role.key} value={role.key}>{role.label}</option>)}</select><span className={tt.help}>{roleHelp}</span></label>
          {category === "members" && mapping.applicable_towers ? <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><label>Blank applicability<select className="tt-select" value={blankBehaviour} onChange={event=>{setBlankBehaviour(event.target.value as ApplicabilityRule["blank"]);setValidation(null);setRowErrors([]);}}><option value="common">Common within selected scope</option><option value="none">Applies to no towers</option><option value="error">Require explicit applicability</option></select></label><label>List delimiter<input className="tt-input" style={{width:90}} value={applicabilityDelimiter} maxLength={5} onChange={event=>{setApplicabilityDelimiter(event.target.value);setRowErrors([]);}}/></label></div> : null}
          {category === "bundles" ? <label>Manifest identity<select className="tt-select" value={bundleIdentity} onChange={event=>setBundleIdentity(event.target.value as "source_row"|"reference_context")}><option value="source_row">Distinct physical source rows</option><option value="reference_context">Reference and context</option></select></label> : null}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><a className={`${tt.button} ${tt.buttonSecondary}`} href={categoryMeta[category].template} download><Download size={14}/> Template</a><a className={`${tt.button} ${tt.buttonSecondary}`} href="/templates/materials/import-guide.md" target="_blank" rel="noreferrer">Import guide</a><button className={`${tt.button} ${tt.buttonSecondary}`} onClick={()=>{setManualMode(previous=>!previous);setRows([]);setValidation(null);setRowErrors([]);}}>Manual entry</button></div>
        </div> : null}
        {manualMode ? <div className={tt.grid2}>{fields.map(field=><label key={field.key}>{field.label}{field.required ? " *" : ""}<input className="tt-input" value={manualRow[field.key]??""} onChange={event=>setManualRow(previous=>({...previous,[field.key]:event.target.value}))}/></label>)}</div> : null}
        {headers.length ? <details open={missingRequired.length>0} style={{marginTop:10}}><summary>Full mapping details | {missingRequired.length ? `${missingRequired.length} required fields missing` : "Required mapping ready"}</summary><div className={tt.mappingList}>{fields.map(field=><label className={tt.mappingRow} key={field.key}>{field.label}{field.required ? " *" : ""}<select className="tt-select" value={mapping[field.key]??""} onChange={event=>{setMapping(previous=>({...previous,[field.key]:event.target.value}));setValidation(null);setRowErrors([]);}}><option value="">Not mapped</option>{headers.map(header=><option key={header} value={header}>{header}</option>)}</select></label>)}</div></details> : null}
      </Card>
      {rows.length ? <Card padded={false}>
        <div className={tt.cardHeader}><div><h2 className={tt.cardTitle}>Preview</h2><p className={tt.cardDescription}>10 rows per page | Original source values</p></div><input className="tt-input" style={{width:240}} value={previewSearch} onChange={event=>{setPreviewSearch(event.target.value);setPreviewPage(0);}} placeholder="Search source rows"/></div>
        <div style={{overflowX:"auto"}}><table className={tt.table}><thead><tr>{previewFields.map(field=><th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{previewRows.slice(Math.min(previewPage,previewPages-1)*10,Math.min(previewPage,previewPages-1)*10+10).map((row,index)=><tr key={index}>{previewFields.map(field=><td key={field.key}>{row[mapping[field.key]] || "-"}</td>)}</tr>)}</tbody></table></div>
        <div style={{display:"flex",gap:10,alignItems:"center",padding:10}}><button className={`${tt.button} ${tt.buttonSecondary}`} disabled={!previewPage} onClick={()=>setPreviewPage(previous=>previous-1)}>Previous</button><span>Page {Math.min(previewPage,previewPages-1)+1} of {previewPages} | {previewRows.length} matching rows</span><button className={`${tt.button} ${tt.buttonSecondary}`} disabled={previewPage>=previewPages-1} onClick={()=>setPreviewPage(previous=>previous+1)}>Next</button></div>
      </Card> : null}
      {rows.length ? <Card>
        <h2 className={tt.cardTitle}>Import readiness</h2>
        <div style={{display:"flex",gap:20,flexWrap:"wrap",marginTop:10}}><span>Valid source rows <strong>{rows.length-fatalRows}</strong></span>{category === "members" ? <><span>Common <strong>{applicability.common}</strong></span><span>Conditional <strong>{applicability.conditional}</strong></span></> : null}<span>Target towers <strong>{targetSummary.towers.length}</strong></span><span>Fatal errors <strong>{fatalRows+missingRequired.length}</strong></span><span>Unresolved tower references <strong>{applicability.unmatchedReferences.length}</strong></span></div>
        {category === "members" ? <p className={tt.help}>{applicability.relationships} applicable tower relationships | {applicability.outOfScopeRows} source rows outside current target scope. Valid source rows are stored even when no tower currently matches.</p> : null}
        <p className={tt.help}>CSV row tower mapping: {importScope === "csv" ? `${targetSummary.rowErrors.length} rows require fixing` : "Not used"} | Applicability references unresolved: {applicability.unmatchedReferences.length}</p>
        <p>{fatalRows || missingRequired.length ? "Fix fatal errors before importing." : "Ready to import"}{validation ? ` | ${validation.appliedRows} source rows stored` : ""}</p>
        {applicability.unmatchedReferences.length ? <details><summary>Unresolved tower references - {applicability.unmatchedReferences.length}</summary><input className="tt-input" value={referenceSearch} onChange={event=>setReferenceSearch(event.target.value)} placeholder="Search tower reference"/>{applicability.unmatchedReferences.filter(reference=>reference.toLowerCase().includes(referenceSearch.toLowerCase())).slice(0,50).map(reference=><div key={reference}>{reference}</div>)}<p className={tt.help}>Retained as warnings, not rejected source rows. Reconcile after adding project towers.</p></details> : null}
        <details><summary>Tower breakdown</summary><input className="tt-input" value={effectiveSearch} onChange={event=>setEffectiveSearch(event.target.value)} placeholder="Search tower"/>{applicability.effective.filter(row=>(towers.find(tower=>tower.id===row.towerId)?.tower_identifier??"").toLowerCase().includes(effectiveSearch.toLowerCase())).slice(0,30).map(row=><div key={row.towerId}>{towers.find(tower=>tower.id===row.towerId)?.tower_identifier}: {row.common} common + {row.conditional} conditional = {row.total}</div>)}</details>
        {groupImportErrors(fatalErrors).map(group=><details key={group.message}><summary>{group.message === "bundle_reference is required." ? "Missing bundle reference" : group.message} - {new Set(group.rows.map(error=>error.row)).size} rows require fixing</summary><input className="tt-input" value={errorSearch} onChange={event=>setErrorSearch(event.target.value)} placeholder="Search CSV row number or error"/><p className={tt.help}>Up to 50 matching details shown. Search to inspect any source row.</p>{group.rows.filter(error=>`${error.row} ${error.message}`.toLowerCase().includes(errorSearch.toLowerCase())).slice(0,50).map((error,index)=><div key={index}>CSV row {error.row}: {error.message}</div>)}</details>)}
      </Card> : null}
      {message ? <div className={`${tt.notice} ${tt.noticeInfo}`} role="status">{message}</div> : null}
      {rows.length || manualMode ? <div style={{position:"sticky",bottom:0,zIndex:10,padding:12,background:"var(--tt-surface, #0f172a)",border:"1px solid rgba(148,163,184,.3)",borderRadius:10,display:"flex",gap:12,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
        <div>{rows.length} source rows | {targetSummary.towers.length} target towers | {fatalRows+missingRequired.length} fatal errors</div>
        {["all","selected"].includes(importScope)&&targetSummary.towers.length>1 ? <label><input type="checkbox" checked={confirmTypes} onChange={event=>setConfirmTypes(event.target.checked)}/> Confirm {targetSummary.towers.length} towers / {targetSummary.types.length} tower types for applicability evaluation</label> : null}
        <button className={`${tt.button} ${tt.buttonPrimary}`} disabled={busy || (!manualMode && (fatalRows>0 || missingRequired.length>0)) || (importScope!=="csv"&&!targetSummary.towers.length) || (["all","selected"].includes(importScope)&&targetSummary.towers.length>1&&!confirmTypes)} onClick={()=>void(manualMode?commitManual():commit())}>{busy ? "Importing..." : `Import ${categoryMeta[category].label}`} <ArrowRight size={14}/></button>
      </div> : null}
    </div>
  );
}
