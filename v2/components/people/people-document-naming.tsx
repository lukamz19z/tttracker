"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DocumentTemplateBuilder, tokenLabel } from "@/components/integrations/document-template-builder";
import { ConfigurationSurface } from "@/components/people/configuration-surface";
import { contextTokens, ensureTrainingDocumentSideFilename, renderPath } from "@/lib/integrations/resolver";
import { responseData, type Row } from "./people-controls";
import styles from "./people.module.css";

type WorkspaceRule = Row & { id: string; context: string; filename_template?: string; relationship_type_id?: string | null; is_active?: boolean; priority?: number };
type EditTarget = { kind: "default" } | { kind: "category"; row: Row } | { kind: "type"; row: Row };
const filenameTokens = [...contextTokens.training, "year", "month", "document_category", "document_type"];
const previewDefaults: Record<string, string> = {
  person_id: "person-example", employee_number: "1600", person_display_name: "Alex Smith", first_name: "Alex", last_name: "Smith",
  employment_type: "Employee", training_category: "Example Category", training_type: "Example Training", training_option: "Example Class", document_side: "Front",
  issue_date: "2026-10-10", expiry_date: "2027-10-10", year: "2026", month: "10", document_category: "Training", document_type: "Evidence",
};

function preview(template: string, context: Partial<Record<string, string>> = {}, side?: "Front" | "Back") {
  const values = { ...previewDefaults, ...context, document_side: side ?? "Single" };
  const rendered = ensureTrainingDocumentSideFilename(renderPath(template, "training", values, true), template, values);
  return `${rendered.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")}.pdf`;
}

function needsDocumentSide(row: Row, effective: string) {
  const twoSided = ["front_back", "single_or_front_back"].includes(String(row.document_requirement ?? ""));
  return twoSided && !/\{document_side\}/i.test(effective);
}

function templateError(template: string) {
  if (!template.trim()) return "Enter a file name structure.";
  if (template.length > 240 || /[<>:"/\\|?*\x00-\x1f]/.test(template)) return "Remove unsupported filename characters.";
  if (/[{}]/.test(template.replace(/\{[^{}]+\}/g, ""))) return "Check the filename fields and text.";
  try { renderPath(template, "training", Object.fromEntries([...template.matchAll(/\{([^{}]+)\}/g)].map((match) => [match[1], "Example"])), true); }
  catch { return "This file name contains a field that Training documents cannot use."; }
  return "";
}

export function PeopleDocumentNaming({ organisation, permissions }: { organisation: string; permissions: Record<string, boolean> }) {
  const [categories, setCategories] = useState<Row[]>([]);
  const [types, setTypes] = useState<Row[]>([]);
  const [rules, setRules] = useState<WorkspaceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageWarning, setStorageWarning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [template, setTemplate] = useState("");
  const [custom, setCustom] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const canManage = permissions["training.configure"] === true;
  const canManageStorage = permissions["integrations.sharepoint.view"] === true || permissions["integrations.sharepoint.manage"] === true;
  const storageHref = `/workspace/settings/integrations/sharepoint?organisation=${encodeURIComponent(organisation)}&context=training`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [categoryResult, typeResult] = await Promise.all([
        fetch(`/api/people?organisation=${encodeURIComponent(organisation)}&area=training_categories`, { cache: "no-store" }).then(responseData),
        fetch(`/api/people?organisation=${encodeURIComponent(organisation)}&area=training_types`, { cache: "no-store" }).then(responseData),
      ]);
      setCategories(categoryResult.rows ?? []);
      setTypes(typeResult.rows ?? []);
      try {
        const workspace = await fetch(`/api/integrations/sharepoint/workspace?organisation=${encodeURIComponent(organisation)}`, { cache: "no-store" }).then(responseData);
        setRules((workspace.rules ?? []) as WorkspaceRule[]);
        setStorageWarning(false);
      } catch {
        setRules([]);
        setStorageWarning(true);
      }
    } catch {
      setError("Training file naming could not be loaded.");
    } finally { setLoading(false); }
  }, [organisation]);

  useEffect(() => { setError(""); setNotice(""); setSearch(""); void load(); }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const trainingRules = useMemo(() => rules.filter((rule) => rule.context === "training" && rule.is_active !== false), [rules]);
  const organizationRule = useMemo(() => [...trainingRules].filter((rule) => !rule.relationship_type_id).sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0))[0], [trainingRules]);
  const organizationTemplate = String(organizationRule?.filename_template ?? "{training_type}_{year}");
  const categoryTemplate = (row: Row) => String(row.filename_template ?? "").trim();
  const categoryName = (row: Row) => String(row.name ?? "Uncategorised");
  const typeCategory = (row: Row) => categories.find((category) => String(category.id) === String(row.category_id)) ?? categories.find((category) => categoryName(category) === String(row.category ?? ""));
  const inheritedForType = (row: Row) => categoryTemplate(typeCategory(row) ?? {}) || organizationTemplate;
  const inheritedSource = (row: Row) => categoryTemplate(typeCategory(row) ?? {}) ? `${categoryName(typeCategory(row)!)} Category` : "Organisation Default";
  const effectiveForType = (row: Row) => String(row.filename_template ?? "").trim() || inheritedForType(row);
  const typePreviewContext = (row: Row) => ({ training_type: String(row.name ?? "Training Type"), training_category: categoryName(typeCategory(row) ?? {}) });
  const categoryPreviewContext = (row: Row) => {
    const representativeType = types.find((type) => String(type.category_id ?? "") === String(row.id) || String(type.category ?? "") === categoryName(row));
    return { training_type: String(representativeType?.name ?? "Example Training"), training_category: categoryName(row) };
  };
  const organizationPreviewContext = () => {
    const representativeType = types[0];
    return representativeType ? typePreviewContext(representativeType) : { training_type: "Example Training", training_category: "Example Category" };
  };
  const filteredTypes = types.filter((row) => String(row.name ?? "").toLowerCase().includes(search.trim().toLowerCase()) || String(typeCategory(row)?.name ?? "").toLowerCase().includes(search.trim().toLowerCase()));

  function openEditor(target: EditTarget) {
    setEditing(target);
    if (target.kind === "default") {
      setTemplate(organizationTemplate);
      setCustom(true);
    } else if (target.kind === "category") {
      const value = categoryTemplate(target.row);
      setTemplate(value || organizationTemplate);
      setCustom(!!value);
    } else {
      const value = String(target.row.filename_template ?? "").trim();
      setTemplate(value || inheritedForType(target.row));
      setCustom(!!value);
    }
    setError("");
    setBaseline(JSON.stringify({ template: target.kind === "default" ? organizationTemplate : target.kind === "category" ? categoryTemplate(target.row) || organizationTemplate : String(target.row.filename_template ?? "").trim() || inheritedForType(target.row), custom: target.kind === "default" || !!(target.kind === "category" ? categoryTemplate(target.row) : target.kind === "type" ? String(target.row.filename_template ?? "").trim() : "") }));
  }

  function addDocumentSide(target: Extract<EditTarget, { kind: "type" }>) {
    openEditor(target);
    const current = String(target.row.filename_template ?? "").trim() || inheritedForType(target.row);
    setTemplate(current.match(/\{document_side\}/i) ? current : `${current} - {document_side}`);
    setCustom(true);
  }

  function inheritedTemplate(target: EditTarget) {
    if (target.kind === "default") return organizationTemplate;
    if (target.kind === "category") return organizationTemplate;
    return inheritedForType(target.row);
  }

  async function save() {
    if (!editing || !canManage) return;
    const validation = custom ? templateError(template) : "";
    if (validation) { setError(validation); return; }
    setSaving(true); setError("");
    try {
      if (editing.kind === "default") {
        const response = await fetch("/api/people/training-filename-default", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisation, filename_template: template }) });
        await responseData(response);
      } else {
        const action = editing.kind === "category" ? "training_category" : "training_type";
        const data = { filename_template: custom ? template : null };
        await responseData(await fetch("/api/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisation, action, id: String(editing.row.id), data }) }));
      }
      setEditing(null);
      setNotice("Training file naming saved.");
      await load();
    } catch (caught) {
      const fallback = editing.kind === "default" ? "Training default file naming could not be saved." : editing.kind === "category" ? "Category file naming could not be saved." : "Training Type file naming could not be saved.";
      const message = caught instanceof Error ? caught.message : "";
      const safeMessages = new Set(["Training default file naming could not be loaded.", "Configure Training Document Storage before saving its default file name.", "Training default file naming could not be saved.", "Category file naming could not be saved.", "Training Type file naming could not be saved."]);
      setError(safeMessages.has(message) ? message : fallback);
    } finally { setSaving(false); }
  }

  const targetTitle = editing?.kind === "default" ? "Training Default File Name" : editing?.kind === "category" ? `${categoryName(editing.row)} File Naming` : `${String(editing?.row.name ?? "Training Type")} File Naming`;
  const targetDescription = editing?.kind === "default" ? "Build the file name using fields and text." : editing?.kind === "category" ? "Use the Training Default or create a name for this Category." : "Use inherited naming or create a name for this Training Type.";
  const dirty = baseline !== JSON.stringify({ template, custom });

  return <section className={styles.namingPage}>
    <div className={styles.namingHeader}><div><h2>File Naming</h2><p className={styles.muted}>Configure how Training evidence files are named when TTTracker saves them to SharePoint.</p></div></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    {storageWarning && <p className={styles.namingWarning} role="status">Document storage status could not be loaded. File naming remains available.</p>}
    {loading ? <p className={styles.muted}>Loading Training file naming…</p> : <>
      <section className={styles.namingPanel} aria-labelledby="training-default-title">
        <div className={styles.namingPanelHeading}><div><h3 id="training-default-title">Training Default</h3><p className={styles.muted}>Used by all Training Types unless a Category or Training Type has its own naming rule.</p></div>{canManage && <button className="tt-button" type="button" onClick={() => openEditor({ kind: "default" })}>Edit Default</button>}</div>
        <div className={styles.namingParts} aria-label="Training Default builder preview">{(organizationTemplate.match(/\{[^{}]+\}|[^{}]+/g) ?? []).map((part, index) => part.startsWith("{") && part.endsWith("}") ? <span className={styles.namingToken} key={`${part}-${index}`}>{tokenLabel(part.slice(1, -1))}</span> : <span className={styles.namingLiteral} key={`${part}-${index}`}>{part}</span>)}</div>
        <div className={styles.namingPreview}><span>Preview</span><code title={preview(organizationTemplate, organizationPreviewContext())}>{preview(organizationTemplate, organizationPreviewContext())}</code></div>
        <p className={styles.muted}>File extension is added automatically. Filename dates use DD-MM-YYYY.</p>
      </section>

      <section className={styles.namingSection} aria-labelledby="category-overrides-title">
        <div className={styles.namingPanelHeading}><div><h3 id="category-overrides-title">Category Overrides</h3><p className={styles.muted}>Optional Category rules are used when a Training Type has no custom name.</p></div></div>
        {categories.length ? <div className={styles.tableWrap}><table className={`${styles.table} ${styles.configurationTable} ${styles.namingTable} ${styles.namingCategoryTable}`}><thead><tr><th>Category</th><th>Naming</th><th>Training Types</th><th>Source</th><th>Preview</th><th>Action</th></tr></thead><tbody>
          {categories.map((row) => { const count = types.filter((type) => String(type.category_id ?? "") === String(row.id) || String(type.category ?? "") === categoryName(row)).length; const own = categoryTemplate(row); const effective = own || organizationTemplate; const example = preview(effective, categoryPreviewContext(row)); return <tr key={String(row.id)}><td data-label="Category">{categoryName(row)}</td><td data-label="Naming">{own ? "Custom" : "Organisation Default"}</td><td data-label="Training Types">{count}</td><td data-label="Source">{own ? "Category Override" : "Inherited"}</td><td data-label="Preview"><span className={styles.namingPreviewValue} title={example}>{example}</span></td><td data-label="Action">{canManage ? <button className={styles.configurationRowAction} type="button" onClick={() => openEditor({ kind: "category", row })}>{own ? "Edit" : "Configure"}</button> : "View only"}</td></tr>; })}
        </tbody></table></div> : <p className={styles.muted}>No Training Categories have been configured.</p>}
      </section>

      <section className={styles.namingSection} aria-labelledby="training-type-overrides-title">
        <div className={styles.namingPanelHeading}><div><h3 id="training-type-overrides-title">Training Type Overrides</h3><p className={styles.muted}>Training Type naming takes priority over its Category and the Training Default.</p></div><label className={styles.namingSearch}>Search Training Types<input className="tt-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Training Types…" /></label></div>
        {filteredTypes.length ? <div className={styles.tableWrap}><table className={`${styles.table} ${styles.configurationTable} ${styles.namingTable} ${styles.namingTypeTable}`}><thead><tr><th>Training Type</th><th>Naming Source</th><th>Preview</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {filteredTypes.map((row) => { const category = typeCategory(row); const own = String(row.filename_template ?? "").trim(); const effective = effectiveForType(row); const sideWarning = needsDocumentSide(row, effective); const twoSided = ["front_back", "single_or_front_back"].includes(String(row.document_requirement ?? "")); const context = typePreviewContext(row); const front = preview(effective, context, "Front"); const back = preview(effective, context, "Back"); const single = preview(effective, context); const source = own ? "Training Type Override" : categoryTemplate(category ?? {}) ? `Inherited from ${categoryName(category!)}` : "Inherited from Organisation Default"; return <tr key={String(row.id)}><td data-label="Training Type"><strong>{String(row.name ?? "Training Type")}</strong><small>{category ? categoryName(category) : "No category"}</small></td><td data-label="Naming Source">{source}</td><td data-label="Preview">{twoSided ? <div className={styles.namingPreviewLines}><div><span>Front</span><code title={front}>{front}</code></div><div><span>Back</span><code title={back}>{back}</code></div></div> : <span className={styles.namingPreviewValue} title={single}>{single}</span>}</td><td data-label="Status"><div className={styles.namingStatusCell}><span className={`${styles.namingStatusBadge} ${sideWarning ? styles.namingStatusAttention : own ? styles.namingStatusConfigured : styles.namingStatusInherited}`}>{sideWarning ? "Needs Attention" : own ? "Configured" : "Inherited"}</span>{sideWarning && <small title="Front + Back evidence requires the file name to distinguish each side.">Front / Back sides are not named</small>}</div></td><td data-label="Actions"><div className={styles.namingRowActions}>{canManage ? <><button className={styles.configurationRowAction} type="button" onClick={() => openEditor({ kind: "type", row })}>{own ? "Edit Override" : "Override"}</button>{sideWarning && <button className={`${styles.configurationRowAction} ${styles.namingQuickFix}`} type="button" onClick={() => addDocumentSide({ kind: "type", row })}>Add Document Side</button>}</> : <span className={styles.muted}>View only</span>}</div></td></tr>; })}
        </tbody></table></div> : <p className={styles.muted}>{search ? "No Training Types match this search." : "No Training Types have been configured."}</p>}
      </section>

      <section className={styles.storageAction} aria-labelledby="document-storage-title"><div><h3 id="document-storage-title">Document Storage</h3><p><strong>Training Documents</strong><span className={styles.inlineSeparator} aria-hidden="true">·</span>SharePoint</p><small>Manage where Training evidence is stored. File Naming controls what each file is called.</small></div>{canManageStorage ? <Link className="tt-button-secondary" href={storageHref}>Manage Storage</Link> : <span className={styles.muted}>SharePoint storage is managed in Organisation Settings.</span>}</section>
    </>}

    {editing && <ConfigurationSurface title={targetTitle} description={targetDescription} size="small" dirty={dirty} busy={saving} onClose={() => setEditing(null)} footer={<><button className="tt-button-secondary" type="button" onClick={() => setEditing(null)} disabled={saving}>Cancel</button><button className="tt-button-primary" type="button" onClick={() => void save()} disabled={saving || !canManage}>{saving ? "Saving…" : "Save"}</button></>}>
      {editing.kind !== "default" && <fieldset className={styles.namingChoice}><legend>Naming rule</legend><label><input type="radio" checked={!custom} onChange={() => setCustom(false)} /> {editing.kind === "category" ? "Use Training Default" : "Use Inherited Naming"}</label><label><input type="radio" checked={custom} onChange={() => setCustom(true)} /> Custom for this {editing.kind === "category" ? "Category" : "Training Type"}</label><p className={styles.muted}>Currently inherited from: {editing.kind === "category" ? "Organisation Default" : inheritedSource(editing.row)}</p></fieldset>}
      {custom && <><p>Build the file name using fields and text.</p><DocumentTemplateBuilder value={template} onChange={setTemplate} tokens={filenameTokens} filename /><div className={styles.namingPreview}><span>Preview</span>{editing.kind === "type" && ["front_back", "single_or_front_back"].includes(String(editing.row.document_requirement ?? "")) ? <div className={styles.namingPreviewLines}><div><span>Front</span><code>{preview(template, typePreviewContext(editing.row), "Front")}</code></div><div><span>Back</span><code>{preview(template, typePreviewContext(editing.row), "Back")}</code></div></div> : <code>{preview(template, editing.kind === "type" ? typePreviewContext(editing.row) : editing.kind === "category" ? categoryPreviewContext(editing.row) : organizationPreviewContext())}</code>}</div><p className={styles.muted}>File extension is added automatically. Actual records must contain every selected field.</p></>}
      {editing.kind !== "default" && <div className={styles.namingDrawerActions}><button className="tt-button-subtle" type="button" onClick={() => { setTemplate(inheritedTemplate(editing)); setCustom(true); }}>{editing.kind === "category" ? "Start From Training Default" : "Start From Inherited"}</button>{(editing.kind === "category" ? categoryTemplate(editing.row) : String(editing.row.filename_template ?? "").trim()) && <button className="tt-button-subtle" type="button" onClick={() => { setCustom(false); setTemplate(inheritedTemplate(editing)); }}>{editing.kind === "category" ? "Reset to Training Default" : "Reset to Inherited"}</button>}</div>}
      {custom && /\{employee_number\}/.test(template) && <p className={styles.namingWarning}>Employee Number may be blank on a Person record. Files cannot use this value when it is missing.</p>}
      {custom && /\{training_option\}/.test(template) && <p className={styles.namingWarning}>Option / Class is not used by every Training Type. Files cannot use this value when it is blank.</p>}
      {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    </ConfigurationSurface>}
  </section>;
}
