"use client";
import { formatPeopleDate } from "@/lib/people/dates";
import { BackLink, PeopleDateInput } from "./people-ui";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { MaterialsSearch } from "@/components/materials/workflow-controls";
import {
  Editor,
  PeoplePicker,
  responseData,
  title,
  value,
  type Field,
  type Result,
  type Row,
} from "./people-controls";
import { resolveTokens } from "@/lib/people/document-rules";
import styles from "./people.module.css";

async function write(
  organisation: string,
  action: string,
  data: Row,
  id?: string,
) {
  return responseData(
    await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organisation, action, data, id }),
    }),
  );
}
function State({ state, compact = false }: { state: string; compact?: boolean }) {
  const Icon =
    state === "current"
      ? CheckCircle2
      : state === "not_required"
        ? MinusCircle
        : state === "pending_review"
          ? Clock
        : state === "expired"
            ? XCircle
          : state === "expiring"
            ? Clock
            : AlertTriangle;
  return (
    <span className={`${styles.state} ${compact ? styles.matrixCompactState : ""}`} data-state={state} aria-label={title(state)} title={title(state)}>
      <Icon size={15} aria-hidden />
      {compact ? <span className={styles.srOnly}>{title(state)}</span> : title(state)}
    </span>
  );
}
export function PeopleOperationsPanel({
  organisation,
  area,
  permissions,
}: {
  organisation: string;
  area: string;
  permissions: Record<string, boolean>;
}) {
  const [data, setData] = useState<Result>({});
  const [sharepoint, setSharepoint] = useState<{connected:boolean;destinations:{id:string;name:string}[]}>({connected:false,destinations:[]});
  useEffect(()=>{if(area!=="document_rules")return;const controller=new AbortController();fetch(`/api/people/storage-status?organisation=${organisation}`,{signal:controller.signal}).then(r=>r.ok?r.json():null).then(value=>{if(value)setSharepoint(value);}).catch(()=>{});return()=>controller.abort();},[organisation,area]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [project, setProject] = useState("");
  const [crew, setCrew] = useState("");
  const [relationship, setRelationship] = useState("");
  const [trainingType, setTrainingType] = useState("");
  const [category, setCategory] = useState("");
  const [gaps, setGaps] = useState(false);
  const [matrixView, setMatrixView] = useState<"status" | "detailed">("status");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  async function detailLoad(row: Row, page: number) {
    try {
      const r = await responseData(
        await fetch(
          `/api/people?organisation=${organisation}&area=requirements&id=${row.id}&detail_page=${page}`,
        ),
      );
      setDetail(r.rows?.[0] ?? null);
      setDetailPage(page);
    } catch {
      setError("Unable to open requirement people.");
    }
  }
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        organisation,
        area,
        q: query,
        page: String(page),
        project_id: project,
        crew_id: crew,
        relationship_type_id: relationship,
        training_type_id: trainingType,
        gaps: String(gaps),
        category_id: category,
      });
      setData(
        await responseData(
          await fetch(`/api/people?${p}`, { cache: "no-store" }),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, [
    organisation,
    area,
    query,
    page,
    project,
    crew,
    relationship,
    trainingType,
    gaps,
    category,
  ]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (area !== "matrix") return;
    try {
      const saved = window.localStorage.getItem("tttracker.people.matrix-view");
      if (saved === "status" || saved === "detailed") setMatrixView(saved);
    } catch { /* Storage can be disabled by the browser. */ }
  }, [area]);
  function chooseMatrixView(view: "status" | "detailed") {
    setMatrixView(view);
    try { window.localStorage.setItem("tttracker.people.matrix-view", view); } catch { /* Keep the current session usable. */ }
  }
  const fields: Field[] =
    area === "requirements"
      ? [
          {
            key: "project_id",
            label: "Project",
            area: "projects",
            required: true,
            group: "Requirement",
          },
          {
            key: "training_type_id",
            label: "Training type",
            area: "training_types",
            required: true,
            group: "Requirement",
          },
          { key: "option_id", label: "Required Option / Class", type: "custom", group: "Option / Class", help: "Leave empty when any Option / Class under this Training Type satisfies the requirement." },
          {
            key: "applies_to",
            label: "Applies to",
            options: [
              "everyone",
              "relationship",
              "position",
              "crew_leader",
              "person",
            ],
            required: true,
            group: "Requirement",
          },
          {
            key: "relationship_type_id",
            label: "Employment / Engagement Type",
            area: "types",
            required: true,
            when: { key: "applies_to", value: "relationship" },
            group: "Requirement",
          },
          {
            key: "position",
            label: "Position",
            required: true,
            when: { key: "applies_to", value: "position" },
            group: "Requirement",
          },
          {
            key: "person_id",
            label: "Person",
            area: "people_choices",
            required: true,
            when: { key: "applies_to", value: "person" },
            group: "Requirement",
          },
          { key: "is_active", label: "Active", type: "checkbox", group: "Requirement" },
        ]
      : [
          { key: "name", label: "Rule name", required: true },
          {
            key: "parent_id",
            label: "Parent Folder",
            emptyLabel: "Root",
            area: "document_rules",
          },
          {
            key: "category",
            label: "Document Category",
            required: true,
            optionLabels: { __new__: "Define a document category?" },
            options: [
              ...new Set([
                "training",
                "__new__",
                ...(data.rows ?? [])
                  .map((row) => value(row, "category"))
                  .filter(Boolean),
              ]),
            ],
          },
          {
            key: "new_category",
            label: "New Document Category",
            required: true,
            when: { key: "category", value: "__new__" },
            help: "Use your organisation's document category name.",
          },
          {
            key: "training_category_id",
            label: "Training Category",
            emptyLabel: "All training categories",
            area: "training_categories",
          },
          {
            key: "relationship_type_id",
            label: "Employment / Engagement Type",
            emptyLabel: "All employment / engagement types",
            area: "types",
          },
          {
            key: "provider",
            label: "Provider",
            optionLabels: {
              internal: "Historical internal configuration",
              sharepoint: sharepoint.connected ? "SharePoint" : "SharePoint: Not connected",
            },
            options: ["sharepoint"],
            required: true,
          },
          {
            key: "folder_template",
            label: "Folder Name",
            type: "token",
            required: true,
          },
          {
            key: "filename_template",
            label: "Filename Template",
            type: "token",
            required: true,
          },
          {
            key: "date_format",
            label: "Date format",
            options: ["DD-MM-YYYY", "YYYY-MM-DD"],
          },
          {
            key: "collision_policy",
            label: "File Conflict Behaviour",
            optionLabels: { version: "Create New Version" },
            options: ["version"],
          },
          {
            key: "creation_trigger",
            label: "Create Folder",
            optionLabels: {
              first_upload: "On first document upload",
              person_created: "When person is created",
              onboarding_started: "When onboarding starts",
              onboarding_completed: "When onboarding is approved",
              manual: "Manual only",
            },
            options: [
              "first_upload",
              "person_created",
              "onboarding_started",
              "onboarding_completed",
              "manual",
            ],
          },
          {
            key: "library_reference",
            label: "SharePoint Destination",
            options: sharepoint.destinations.map(d=>d.id),
            optionLabels: Object.fromEntries(sharepoint.destinations.map(d=>[d.id,d.name])),
            visible: current=>sharepoint.connected && current.provider === "sharepoint",
          },
          { key: "is_active", label: "Active", type: "checkbox" },
        ];
  async function save(input: Row) {
    const payload = { ...input };
    if (payload.category === "__new__")
      payload.category = String(payload.new_category ?? "").trim();
    delete payload.new_category;
    await write(
      organisation,
      area === "requirements" ? "requirement" : "document_rule",
      payload,
      editor?.id ? String(editor.id) : undefined,
    );
    setEditor(null);
    setNotice(
      area === "requirements" ? "Requirement saved." : "Document rule saved.",
    );
    await load();
  }
  if (area === "review_rules")
    return <ReviewRules organisation={organisation} />;
  const rows = data.rows ?? [];
  const firstCells = (rows[0]?.cells ?? []) as Row[];
  const matrixGroups = firstCells.map((cell) => {
    const fields: { key: "class" | "number" | "expiry" | "status"; label: string }[] = [];
    if (cell.option_selection_mode && cell.option_selection_mode !== "none") fields.push({ key: "class", label: "Class / Ticket" });
    if (cell.requires_certificate_number) fields.push({ key: "number", label: "Number" });
    if (cell.validity_mode !== "never") fields.push({ key: "expiry", label: "Expiry" });
    fields.push({ key: "status", label: "Status" });
    const id = String(cell.type_id);
    return { id, label: String(cell.type_name), code: String(cell.code ?? ""), required: rows.some((row) => (Array.isArray(row.cells) ? row.cells as Row[] : []).some((item) => String(item.type_id) === id && Boolean(item.required))), fields };
  });
  const matrixStats = rows.reduce<{ requirements: number; gaps: number }>((stats, row) => {
    for (const cell of (Array.isArray(row.cells) ? row.cells as Row[] : [])) {
      if (!cell.required) continue;
      stats.requirements += 1;
      if (["missing", "expired", "expiring"].includes(String(cell.state))) stats.gaps += 1;
    }
    return stats;
  }, { requirements: 0, gaps: 0 });
  const matrixSummary = [
    { label: "Employees Shown", value: rows.length },
    { label: "Training Types Shown", value: matrixGroups.length },
    { label: "Required Competencies Shown", value: matrixStats.requirements },
    { label: "Current Required Gaps", value: matrixStats.gaps },
  ];
  return (
    <section className={styles.panel}>
      <div className={styles.toolbar}>
        {area !== "matrix" && area !== "requirements" && <h2>Document Structure</h2>}
        {permissions[
          area === "requirements"
            ? "training.requirements.manage"
            : "people.configure"
        ] &&
          area !== "matrix" && (
            <button
              className="tt-button-primary"
              onClick={() =>
                setEditor({
                  applies_to: "everyone",
                  provider: "sharepoint",
                  category: "training",
                  folder_template: "{person_display_name}",
                  filename_template: "{person_id}_{training_type}_{year}",
                  is_active: true,
                  date_format: "DD-MM-YYYY",
                  collision_policy: "version",
                  creation_trigger: "first_upload",
                })
              }
            >
              {area === "requirements"
                ? "Add requirement"
                : "New Document Rule"}
            </button>
          )}
      </div>
      {area === "matrix" && <div className={styles.matrixControls}>
        <div className={styles.matrixViewToggle} role="group" aria-label="Training Matrix view">
          <button type="button" aria-pressed={matrixView === "status"} onClick={() => chooseMatrixView("status")}>Status View</button>
          <button type="button" aria-pressed={matrixView === "detailed"} onClick={() => chooseMatrixView("detailed")}>Detailed View</button>
        </div>
        <div className={styles.matrixLegend} aria-label="Matrix status legend">
          <State state="current" /><State state="expiring" /><State state="expired" /><State state="missing" /><State state="not_required" /><State state="pending_review" /><State state="changes_required" />
        </div>
      </div>}
      {area === "matrix" && <div className={styles.matrixSummary} aria-label="Training Matrix summary">{matrixSummary.map((item) => <div key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}</div>}
      <MaterialsSearch
        style={area === "matrix" ? { width: "min(100%, 420px)" } : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder={
          area === "matrix" ? "Search people..." : "Search register..."
        }
        onClear={() => {
          setQuery("");
          setPage(1);
        }}
      />
      {area !== "document_rules" && (
        <div className={area === "matrix" ? styles.matrixFilters : styles.fields}>
          <PeoplePicker
            organisation={organisation}
            area="projects"
            label="Project"
            selected={project}
            onChange={(id) => {
              setProject(id);
              setPage(1);
            }}
          />
          {area === "matrix" && (
            <>
              <PeoplePicker
                organisation={organisation}
                area="crews"
                label="Crew"
                selected={crew}
                onChange={(id) => {
                  setCrew(id);
                  setPage(1);
                }}
              />
              <PeoplePicker
                organisation={organisation}
                area="types"
                label="Worker type"
                selected={relationship}
                onChange={(id) => {
                  setRelationship(id);
                  setPage(1);
                }}
              />
              <PeoplePicker
                organisation={organisation}
                area="training_types"
                label="Training type"
                selected={trainingType}
                onChange={(id) => {
                  setTrainingType(id);
                  setPage(1);
                }}
              />
              <PeoplePicker
                organisation={organisation}
                area="training_categories"
                label="Category"
                selected={category}
                onChange={(id) => {
                  setCategory(id);
                  setPage(1);
                }}
              />
              <label>
                <input className={styles.matrixGapToggle}
                  type="checkbox"
                  checked={gaps}
                  onChange={(e) => {
                    setGaps(e.target.checked);
                    setPage(1);
                  }}
                />{" "}
                Only required gaps
              </label>
            </>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading...</p>}
      {notice && <p role="status">{notice}</p>}
      {editor && (
        <>
          <Editor
            surface="medium"
            saveLabel={
              area === "requirements" ? "Save Requirement" : "Save Rule"
            }
            description={
              area === "requirements"
                ? undefined
                : "Control where documents are stored and how folders/files are named."
            }
            organisation={organisation}
            heading={
              area === "requirements"
                ? "Training requirement"
                : editor.id
                  ? "Edit Document Rule"
                  : "New Document Rule"
            }
            fields={
              area === "requirements"
                ? fields
                : fields.map((field) => ({
                    ...field,
                    group: ["name", "is_active"].includes(field.key)
                      ? "Details"
                      : [
                            "category",
                            "new_category",
                            "training_category_id",
                            "relationship_type_id",
                          ].includes(field.key)
                        ? "Applies To"
                        : ["provider", "library_reference"].includes(field.key)
                          ? "Storage"
                          : [
                                "parent_id",
                                "folder_template",
                                "creation_trigger",
                              ].includes(field.key)
                            ? "Folder"
                            : "Filename",
                  }))
            }
            sectionContent={(group, current, update) => {
              if (area === "requirements" && group === "Option / Class" && current.training_type_id) {
                return <PeoplePicker organisation={organisation} area="training_options" label="Required Option / Class" selected={String(current.option_id ?? "")} emptyLabel="Any Option / Class" filters={{ training_type_id: String(current.training_type_id) }} onChange={(option_id) => update({ option_id })} />;
              }
              if (area !== "document_rules") return null;
              if (group === "Storage" && current.provider === "sharepoint") {
                return <div className={styles.previewCard}>
                  <strong>{sharepoint.connected ? "SharePoint is connected. Select a configured training destination." : "SharePoint is not connected."}</strong>
                  <Link href={`/workspace/settings/integrations/sharepoint?organisation=${organisation}`}>Manage SharePoint Integration</Link>
                  <small>You can save this design; uploads require a connected provider.</small>
                </div>;
              }
              if (group === "Folder") return <FilenamePreview template={value(current, "filename_template")} folder={value(current, "folder_template")} dateFormat={value(current, "date_format")} />;
              return null;
            }}
            fieldPreview={(field, data) =>
              field.key === "filename_template" ? (
                <FilenamePreview
                  template={value(data, "filename_template")}
                  folder={value(data, "folder_template")}
                  dateFormat={value(data, "date_format")}
                />
              ) : null
            }
            initial={editor}
            onSave={save}
            onCancel={() => setEditor(null)}
          />
        </>
      )}
      {area === "document_rules" && (
        <>
          <p className={styles.muted}>
            {sharepoint.connected ? "SharePoint: Connected. New evidence goes directly to SharePoint using Organisation Document Setup; review stays in TTTracker." : "SharePoint: Not connected. Document Setup can be configured now; uploads require the connection to be restored."}{" "}
            <Link
              href={`/workspace/settings/integrations/sharepoint?organisation=${organisation}`}
            >
              Integrations
            </Link>
          </p>
        </>
      )}
      <div className={area === "matrix" ? styles.matrix : styles.tableWrap}>
        <table className={`${styles.table} ${area === "matrix" ? `${styles.matrixTable} ${matrixView === "detailed" ? styles.matrixTableDetailed : ""}` : ""}`}>
          {area === "matrix" && <colgroup>
            <col className={styles.matrixPersonColumn} />
            {matrixGroups.flatMap((group) => (matrixView === "status" ? [<col key={group.id} className={styles.matrixStatusColumn} />] : group.fields.map((field) => <col key={`${group.id}-${field.key}`} className={`${styles.matrixTrainingColumn} ${styles[`matrixColumn${field.key[0].toUpperCase()}${field.key.slice(1)}`]}`} />)))}
          </colgroup>}
          <thead>
            {area === "matrix" ? matrixView === "status" ? <tr className={styles.matrixHeaderRow}>
              <th scope="col">Person</th>
              {matrixGroups.map((group) => <th scope="col" key={group.id} title={`${group.label}${group.required ? " · Required for this project" : ""}`} aria-label={`${group.label}${group.required ? ", required for this project" : ""}`}><span className={styles.matrixHeaderCode}>{group.code || group.label}</span><span className={styles.matrixHeaderLabel}>{group.code ? group.label : ""}</span>{group.required && <small className={styles.matrixRequired}>Required</small>}</th>)}
            </tr> : <>
              <tr className={styles.matrixHeaderRow}>
                <th scope="col" rowSpan={2}>Person</th>
                {matrixGroups.map((group) => <th scope="colgroup" key={group.id} colSpan={group.fields.length} title={group.label}><span className={styles.matrixHeaderLabel}>{group.label}</span>{group.required && <small className={styles.matrixRequired}>Required</small>}</th>)}
              </tr>
              <tr className={styles.matrixSubheaderRow}>{matrixGroups.flatMap((group) => group.fields.map((field) => <th scope="col" key={`${group.id}-${field.key}`}>{field.label}</th>))}</tr>
            </> : area === "requirements" ? (
              <tr>
                <th>Project</th>
                <th>Training</th>
                <th>Option / Class</th>
                <th>Applies to</th>
                <th>Required</th>
                <th>Current</th>
                <th>Expiring</th>
                <th>Gaps</th>
                <th />
              </tr>
            ) : (
              <tr>
                <th>Folder rule</th>
                <th>Category</th>
                <th>Provider</th>
                <th>Folder</th>
                <th>Filename</th>
                <th />
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className={area === "matrix" ? styles.matrixPersonRow : undefined}>
                {area === "matrix" ? (
                  <>
                    <th scope="row" className={styles.matrixPersonCell}>
                      <Link
                        href={`/workspace/people/${row.id}?organisation=${organisation}&section=training`}
                      >
                        {String(row.display_name)}
                      </Link>
                    </th>
                    {matrixGroups.flatMap((group) => {
                      const cells = (Array.isArray(row.cells) ? row.cells as Row[] : []);
                      const c = cells.find((cell) => String(cell.type_id) === group.id) ?? {};
                      const href = `/workspace/people/${row.id}?organisation=${organisation}&section=training&record=${c.record_id ?? ""}`;
                      const status = String(c.state ?? "missing");
                      const options = Array.isArray(c.options) ? c.options as Row[] : [];
                      const expiry = c.expiry_date ? formatPeopleDate(String(c.expiry_date)) : "";
                      const optionSummary = options.map((item) => `${String(item.option_name)} ${title(String(item.state))}`).join(", ");
                      const accessible = `${String(row.display_name)}, ${group.label}, ${optionSummary || title(status)}${expiry ? `, expires ${expiry}` : ""}. Open Training details.`;
                      if (matrixView === "status") return [<td className={styles.matrixCell} key={group.id}><Link aria-label={accessible} title={accessible} href={href}>{status === "not_required" ? <span className={styles.matrixNotApplicable} aria-label="Not required">N/A</span> : c.option_display === "separate" && options.length ? <span className={styles.matrixStatusOptions}>{options.map((item) => <State key={String(item.option_id)} state={String(item.state)} compact />)}</span> : <State state={status} compact />}</Link></td>];
                      return group.fields.map((field) => {
                        let display: ReactNode = "—";
                        if (field.key === "class") display = options.length ? <span className={styles.matrixValueList}>{options.map((option) => <span key={String(option.option_id)}>{String(option.option_name)}</span>)}</span> : String(c.option_name ?? "—");
                        if (field.key === "number") display = options.length ? <span className={styles.matrixValueList}>{options.map((option) => <span key={String(option.option_id)}>{String(option.certificate_number || "—")}</span>)}</span> : String(c.certificate_number ?? "—");
                        if (field.key === "expiry") display = options.length ? <span className={styles.matrixValueList}>{options.map((option) => <span key={String(option.option_id)}>{option.expiry_date ? formatPeopleDate(String(option.expiry_date)) : "—"}</span>)}</span> : expiry || "—";
                        if (field.key === "status") display = options.length ? <span className={styles.matrixValueList}>{options.map((option) => <span key={String(option.option_id)}><strong>{String(option.option_name)}</strong> <State state={String(option.state)} /></span>)}</span> : <State state={status} />;
                        const fieldClass = `matrixColumn${field.key[0].toUpperCase()}${field.key.slice(1)}` as keyof typeof styles;
                        return <td className={`${styles.matrixCell} ${styles[fieldClass]}`} key={`${group.id}-${field.key}`}><Link aria-label={`${accessible}, ${field.label}`} title={`${group.label} · ${field.label}: ${typeof display === "string" ? display : title(status)}`} href={href}>{display}</Link></td>;
                      });
                    })}
                  </>
                ) : area === "requirements" ? (
                  (() => {
                    const people = (row.people ?? []) as Row[];
                    const compliant = Number(row.compliant ?? 0);
                    const peopleTotal = Number(
                      row.people_total ?? people.length,
                    );
                    return (
                      <>
                        <td>{String(row.project)}</td>
                        <td>{String(row.training_type)}</td>
                        <td>{String(row.option_name ?? "Any Option / Class")}</td>
                        <td>{String(row.applies_to)}</td>
                        <td>{peopleTotal}</td>
                        <td>{Number(row.current ?? 0)}</td>
                        <td>{Number(row.expiring ?? 0)}</td>
                        <td>{peopleTotal - compliant}</td>
                        <td>
                          <button
                            className="tt-button"
                            onClick={() => {
                              setDetailPage(1);
                              setDetail(row);
                            }}
                          >
                            View people
                          </button>
                          {permissions["training.requirements.manage"] && (
                            <button
                              className="tt-button"
                              onClick={() => setEditor(row)}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <td>{String(row.name)}</td>
                    <td>{String(row.category)}</td>
                    <td>{String(row.provider)}</td>
                    <td>{String(row.folder_template)}</td>
                    <td>{String(row.filename_template)}</td>
                    <td>
                      <button
                        className="tt-button"
                        onClick={() => setEditor(row)}
                      >
                        Edit
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !rows.length && <p className={area === "matrix" ? styles.matrixEmpty : undefined}>{area === "matrix" ? "No Training records match these filters." : "No matching records."}</p>}
      {detail && (
        <section className={`${styles.detail} ${styles.drawer}`}>
          <BackLink
            href={`/workspace/people?organisation=${organisation}&section=requirements`}
            label="Back to Project Requirements"
            onNavigate={() => setDetail(null)}
          />
          <div className={styles.toolbar}>
            <strong>{String(detail.training_type)}</strong>
            <button
              className="tt-button-subtle"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
          <div className={styles.toolbar}>
            <span>
              {Number(detail.people_total ?? 0)} people / Page {detailPage}
            </span>
            <div>
              <button
                className="tt-button"
                disabled={detailPage === 1}
                onClick={() => void detailLoad(detail, detailPage - 1)}
              >
                Previous
              </button>
              <button
                className="tt-button"
                disabled={detailPage * 20 >= Number(detail.people_total ?? 0)}
                onClick={() => void detailLoad(detail, detailPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
          {((detail.people ?? []) as Row[]).map((p) => (
            <div key={String(p.person_id)} className={styles.toolbar}>
              <Link
                href={`/workspace/people/${p.person_id}?organisation=${organisation}&section=training`}
              >
                {String(p.display_name)}
              </Link>
              <State state={String(p.state)} />
            </div>
          ))}
        </section>
      )}
      <div className={`${styles.toolbar} ${area === "matrix" ? styles.matrixPagination : ""}`}>
        <span>
          {area === "matrix" ? `${Number(data.total ?? 0) === 0 ? 0 : (page - 1) * 20 + 1}–${Math.min(page * 20, Number(data.total ?? 0))} of ${Number(data.total ?? 0)}` : `${Number(data.total ?? 0)} records · Page ${page}`}
        </span>
        <div>
          <button
            className="tt-button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            className="tt-button"
            disabled={page * 20 >= Number(data.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
export function FilenamePreview({
  template: configured,
  folder,
  dateFormat = "DD-MM-YYYY",
}: {
  template?: string;
  folder?: string;
  dateFormat?: string;
}) {
  const [template, setTemplate] = useState(
    "{employee_number}_{training_type}_{expiry_date}",
  );
  const issue = dateFormat === "YYYY-MM-DD" ? "2026-10-04" : "04-10-2026";
  const expiry = dateFormat === "YYYY-MM-DD" ? "2027-10-04" : "04-10-2027";
  const sample = {
    person_id: "synthetic-person",
    person_display_name: "Alex Smith",
    first_name: "Alex",
    last_name: "Smith",
    employee_number: "EMP-0042",
    relationship_type: "Configured Worker",
    training_type: "Configured Ticket",
    training_option: "Class A",
    category: "Licences",
    document_category: "Training",
    document_type: "Certificate",
    project_code: "PROJ-001",
    year: "2027",
    issue_date: issue,
    expiry_date: expiry,
  };
  let filename = "Use supported filename tokens.";
  let path = "Use supported folder tokens.";
  try {
    filename = resolveTokens(configured ?? template, sample) + ".pdf";
  } catch {}
  try {
    path = folder
      ? resolveTokens(folder, sample, true)
      : "Organisation default";
  } catch {}
  return (
    <div className={styles.previewCard}>
      <strong>Preview</strong>
      {configured === undefined && (
        <label className={styles.field}>
          Filename template
          <input
            className="tt-input"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />
        </label>
      )}
      <small>Folder</small>
      <strong>{path}</strong>
      <small>Filename</small>
      <strong>{filename}</strong>
      <small>Display date: 04/10/2027</small>
      <small>Filename date: {expiry}</small>
    </div>
  );
}
function ReviewRules({ organisation }: { organisation: string }) {
  const [policies, setPolicies] = useState<Record<string, string>>({});
  const [source, setSource] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch(`/api/people?organisation=${organisation}&area=review_rules`)
      .then(responseData)
      .then((data) =>
        setPolicies((data.policies ?? {}) as Record<string, string>),
      )
      .catch(() => setMessage("Unable to load review rules."));
  }, [organisation]);
  const labels: Record<string, string> = {
    internal: "Internal user",
    person_web: "Person web upload",
    mobile: "Mobile upload",
    external_onboarding: "External onboarding",
    import: "Imported record",
    integration: "Integration",
  };
  const policyLabels = {
    required: "Review Required",
    none: "No Review Required",
    trusted: "Trusted Submitter May Confirm",
  };
  return (
    <section className={styles.panel}>
      <h2>Review Rules</h2>
      <p className={styles.muted}>
        Source defaults apply where a Training Type uses the organisation
        default. Trusted confirmation requires an authorised submitter.
      </p>
      <p role="status">{message}</p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Submission Source</th>
            <th>Default Review Behaviour</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(labels).map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              <td>
                {
                  policyLabels[
                    (policies[key] ?? "required") as keyof typeof policyLabels
                  ]
                }
              </td>
              <td>
                <button className="tt-button" onClick={() => setSource(key)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {source && (
        <Editor
          surface="small"
          heading={`Review Rule: ${labels[source]}`}
          saveLabel="Save Rule"
          organisation={organisation}
          initial={{ policy: policies[source] ?? "required" }}
          fields={[
            {
              key: "policy",
              label: "Default Review Behaviour",
              required: true,
              options: ["required", "none", "trusted"],
              optionLabels: policyLabels,
              help: "Trusted submitters may confirm only where their configured access allows it.",
            },
          ]}
          onCancel={() => setSource(null)}
          onSave={async (data) => {
            const next = { ...policies, [source]: String(data.policy) };
            await write(organisation, "review_rules", next);
            setPolicies(next);
            setSource(null);
            setMessage("Review rule saved.");
          }}
        />
      )}
    </section>
  );
}

export function TrainingUpload({
  organisation,
  personId,
  draft,
  canEditPerson = false,
  canManageDocumentSetup = false,
  onClose,
  onSaved,
}: {
  organisation: string;
  personId?: string;
  draft?: Row;
  canEditPerson?: boolean;
  canManageDocumentSetup?: boolean;
  onClose: () => void;
  onSaved: (message?: string) => void;
}) {
  const draftOptionIds = Array.isArray(draft?.option_ids)
    ? (draft.option_ids as unknown[]).map(String)
    : draft?.option_id ? [String(draft.option_id)] : [];
  const [person, setPerson] = useState(personId ?? String(draft?.person_id ?? ""));
  const [personName, setPersonName] = useState(String(draft?.display_name ?? ""));
  const [personMeta, setPersonMeta] = useState<Row>({});
  const [type, setType] = useState(String(draft?.training_type_id ?? ""));
  const [typeName, setTypeName] = useState(String(draft?.training_type ?? ""));
  const [option, setOption] = useState(String(draft?.option_id ?? ""));
  const [selectedOptions, setSelectedOptions] = useState<string[]>(draftOptionIds);
  const [optionSearch, setOptionSearch] = useState("");
  const [config, setConfig] = useState<Row>({});
  const [linked, setLinked] = useState<string[]>((draft?.linked_type_ids as string[] | undefined) ?? []);
  const [linkedConfigs, setLinkedConfigs] = useState<Row[]>([]);
  const [singleOrFront, setSingleOrFront] = useState(String(draft?.evidence_format ?? "single"));
  const [files, setFiles] = useState<Record<string, File>>({});
  const [record, setRecord] = useState<string | null>(draft ? String(draft.id) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [uploaded, setUploaded] = useState<Set<string>>(new Set());
  const [submissionKey] = useState(() => String(draft?.submission_key ?? crypto.randomUUID()));
  const [documentKeys] = useState<Record<string, string>>({});
  const [project, setProject] = useState(String(draft?.project_id ?? ""));
  const [existingTraining, setExistingTraining] = useState<Row[]>([]);
  const [replacementLookup, setReplacementLookup] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [replacementLookupAttempt, setReplacementLookupAttempt] = useState(0);
  const [replacementChoice, setReplacementChoice] = useState<"replace" | "add">(draft?.replacement_mode === "add" ? "add" : "replace");
  const [issueDate, setIssueDate] = useState(String(draft?.issue_date ?? ""));
  const [expiryDate, setExpiryDate] = useState(String(draft?.expiry_date ?? ""));
  const [certificateNumber, setCertificateNumber] = useState(String(draft?.certificate_number ?? ""));
  useEffect(() => {
    if (!personId) return;
    const controller = new AbortController();
    void fetch(`/api/people?organisation=${encodeURIComponent(organisation)}&area=profile&person=${encodeURIComponent(personId)}`, { signal: controller.signal, cache: "no-store" })
      .then(responseData)
      .then((result) => {
        const row = (result.rows?.[0] ?? {}) as Row;
        setPersonMeta(row);
        setPersonName(String(row.display_name ?? row.name ?? ""));
      })
      .catch(() => { /* The selected person ID and name remain usable if optional summary metadata is unavailable. */ });
    return () => controller.abort();
  }, [organisation, personId]);
  useEffect(() => {
    setExistingTraining([]);
    if (!person || !type) { setReplacementLookup("idle"); return; }
    const controller = new AbortController();
    setReplacementLookup("loading");
    void fetch(`/api/people?organisation=${organisation}&area=training_replacement&person=${person}&training_type_id=${type}`, { signal: controller.signal, cache: "no-store" })
      .then(responseData).then(d => { if (!controller.signal.aborted) { setExistingTraining((d.rows ?? []) as Row[]); setReplacementLookup("loaded"); } }).catch(() => { if (!controller.signal.aborted) setReplacementLookup("error"); });
    return () => controller.abort();
  }, [organisation, person, type, replacementLookupAttempt]);
  useEffect(() => {
    if (!type) return;
    void fetch(
      `/api/people?organisation=${organisation}&area=training_types&id=${type}`,
    )
      .then(responseData)
      .then((d) => {
        setConfig(d.rows?.find((r) => r.id === type) ?? {});
        setTypeName(String(d.rows?.find((r) => r.id === type)?.name ?? draft?.training_type ?? ""));
        setLinked((draft?.linked_type_ids as string[] | undefined) ?? []);
        setOption(String(draft?.option_id ?? ""));
        setSelectedOptions(Array.isArray(draft?.option_ids) ? (draft.option_ids as unknown[]).map(String) : draft?.option_id ? [String(draft.option_id)] : []);
      })
      .catch(() => setError("Unable to load training configuration."));
  }, [organisation, type, draft]);
  useEffect(() => {
    if (!linked.length) {
      setLinkedConfigs([]);
      return;
    }
    const controller = new AbortController();
    void Promise.all(
      linked.map((id) =>
        fetch(
          `/api/people?organisation=${organisation}&area=training_types&id=${id}`,
          { signal: controller.signal },
        )
          .then(responseData)
          .then((d) => d.rows?.[0] ?? {}),
      ),
    )
      .then(setLinkedConfigs)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Unable to load linked qualification requirements.");
      });
    return () => controller.abort();
  }, [organisation, linked]);
  const requirement = String(config.document_requirement ?? "single");
  const sides = [
    ...new Set(
      [config, ...linkedConfigs].flatMap((c) =>
        c.document_requirement === "none"
          ? []
          : c.document_requirement === "front_back"
            ? ["front", "back"]
            : c.document_requirement === "single_or_front_back" &&
                singleOrFront === "front_back"
              ? ["front", "back"]
              : ["single"],
      ),
    ),
  ];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    let evidenceUploadFailed = false;
    try {
      const form = new FormData(e.currentTarget);
      const retrying = Boolean(record);
      if (!person || !type || !config.id)
        throw new Error("Choose a person and training type.");
      if (replacementLookup !== "loaded")
        throw new Error("Existing Training could not be checked yet. Retry the current-record check before submitting.");
      if (sides.some((s) => !files[s] && !uploaded.has(s)))
        throw new Error("Choose the configured evidence files.");
      let current = record;
      if (!current) {
        setProgress("Saving training details...");
        const result = await write(organisation, "training", {
          person_id: person,
          training_type_id: type,
          option_id: option,
          option_ids: config.option_selection_mode === "multiple" ? selectedOptions : option ? [option] : [],
          issue_date: form.get("issue_date"),
          expiry_date: form.get("expiry_date"),
          certificate_number: form.get("certificate_number"),
          linked_type_ids: linked,
          evidence_format: singleOrFront,
          submission_key: submissionKey,
          project_id: project,
          replacement_mode: replacementMode,
        });
        current = String(result.id);
        setRecord(current);
      }
      if (retrying) await write(organisation, "training_upload_retry_started", {}, current);
      for (const side of [
        ...sides,
        ...Object.keys(files).filter((key) => key.startsWith("single_")),
      ]) {
        if (uploaded.has(side)) continue;
        setProgress(`Uploading ${side} evidence...`);
        const body = new FormData();
        body.set("organisation", organisation);
        body.set("person_id", person);
        body.set("record_id", current);
        body.set("side", side.startsWith("single_") ? "single" : side);
        body.set("file", files[side]);
        documentKeys[side] ??= await stableTrainingDocumentId(current, side);
        body.set("document_id", documentKeys[side]);
        try {
          await responseData(
            await fetch("/api/people/documents", { method: "POST", body }),
          );
        } catch (uploadError) {
          evidenceUploadFailed = true;
          throw uploadError;
        }
        setUploaded((prior) => new Set([...prior, side]));
      }
      setProgress("Submitting training...");
      const group = await responseData(
        await fetch(
          `/api/people?organisation=${organisation}&area=training&person=${person}&id=${current}`,
        ),
      );
      const gid = String(group.rows?.[0]?.evidence_group_id ?? "");
      // Finalisation is atomic across the shared evidence group.
      const outcome = await write(
        organisation,
        "finalize_training",
        { source_channel: "internal", evidence_group_id: gid },
        current,
      );
      onSaved(outcome.review_status === "approved"
        ? `${String(config.name)} updated.${outcome.replacement ? " The previous record has been moved to Training history." : ""}`
        : `${String(config.name)} submitted for review.${outcome.replacement ? " The existing current record will remain active until the replacement is approved." : ""}`);
    } catch (e) {
      const safeMessage = e instanceof Error ? e.message : "Try again.";
      if (safeMessage.includes("TRAINING_MULTIPLE_CURRENT_NOT_ALLOWED")) {
        const latest = await fetch(`/api/people?organisation=${encodeURIComponent(organisation)}&area=training_replacement&person=${encodeURIComponent(person)}&training_type_id=${encodeURIComponent(type)}`, { cache: "no-store" }).then(responseData).catch(() => null);
        if (latest?.rows) setExistingTraining(latest.rows as Row[]);
        setError("A matching current Training record changed while you were preparing this submission. The outcome has been refreshed; review it before submitting again.");
      } else setError(evidenceUploadFailed
        ? `Your ${String(config.name ?? "Training")} document could not be uploaded to SharePoint. The existing ${String(config.name ?? "Training")} record has not been changed. ${safeMessage}`
        : safeMessage);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  const optionDefinitions = ((config.option_definitions ?? []) as Row[]).filter((item) => item.is_active !== false);
  const selectedOptionLabels = optionDefinitions.filter((item) => selectedOptions.includes(String(item.id))).map((item) => String(item.code ?? item.name));
  const selectedTargets = config.option_selection_mode === "none"
    ? [{ id: "", label: typeName || String(config.name ?? "Training") }]
    : optionDefinitions.filter((item) => selectedOptions.includes(String(item.id))).map((item) => ({ id: String(item.id), label: String(item.code ?? item.name) }));
  const supersedeScope = String(config.supersede_scope ?? "type");
  const allowsMultipleCurrent = config.allows_multiple_current === true;
  const scopeMatches = (row: Row, optionId: string) =>
    supersedeScope !== "never" &&
    (supersedeScope === "type" || String(row.option_id ?? "") === optionId) &&
    (supersedeScope !== "type_option_and_project" || String(row.project_id ?? "") === project);
  const typeScopeOrder = [...selectedTargets].sort((left, right) => left.id.localeCompare(right.id));
  const outcomeRows = selectedTargets.map((target) => ({
    ...target,
    existing: supersedeScope === "type"
      ? existingTraining.filter((row) => scopeMatches(row, target.id))[typeScopeOrder.findIndex((item) => item.id === target.id)]
      : existingTraining.find((row) => scopeMatches(row, target.id)),
  }));
  const resolverCandidates = [...new Map(outcomeRows.flatMap((row) => row.existing ? [[String(row.existing.id), row.existing] as const] : []))].map(([, row]) => row);
  const replacementCandidates = supersedeScope === "type" && allowsMultipleCurrent && resolverCandidates.length > 0
    ? existingTraining
    : resolverCandidates;
  const replacementMode = replacementCandidates.length
    ? allowsMultipleCurrent ? replacementChoice : "replace"
    : "add";
  const replacedRecords = replacementMode === "replace" ? replacementCandidates : [];
  const replacedIds = new Set(replacedRecords.map((row) => String(row.id)));
  const keptRecords = existingTraining.filter((row) => !replacedIds.has(String(row.id)));
  const addedLabels = outcomeRows.filter((row) => replacementMode === "add" || !row.existing).map((row) => row.label);
  const replacementLabels = supersedeScope === "type" && allowsMultipleCurrent && replacementMode === "replace" && replacementCandidates.length
    ? [`the current ${typeName || String(config.name ?? "Training")} set`]
    : outcomeRows.filter((row) => row.existing && replacementMode === "replace").map((row) => {
    const existingLabel = String(row.existing?.option_code ?? row.existing?.option_name ?? row.existing?.training_type ?? typeName);
    const change = existingLabel === row.label ? existingLabel : `${existingLabel} with ${row.label}`;
    return `${change}${row.existing?.expiry_date ? ` · current expiry ${formatPeopleDate(String(row.existing.expiry_date))}` : ""}`;
  });
  const keepLabels = keptRecords.map((row) => String(row.option_code ?? row.option_name ?? row.training_type ?? typeName));
  const replacementOutcome = replacementLookup === "loading"
    ? "Checking existing current Training records..."
    : replacementLookup === "error"
      ? "Outcome unavailable until the current-record check succeeds."
      : [
    replacementLabels.length ? `Replace ${replacementLabels.join(", ")}` : "",
    addedLabels.length ? `Add ${addedLabels.join(", ")}` : "",
    keepLabels.length ? `Keep ${keepLabels.join(", ")}` : "",
  ].filter(Boolean).join(". ") || (supersedeScope === "never" ? "Add new record; automatic replacement is disabled." : "Add a new current record.");
  useEffect(() => {
    if (replacementCandidates.length && !allowsMultipleCurrent) setReplacementChoice("replace");
  }, [replacementCandidates.length, allowsMultipleCurrent]);
  const visibleOptions = optionDefinitions.filter((item) => `${item.code ?? ""} ${item.name ?? ""}`.toLowerCase().includes(optionSearch.trim().toLowerCase()));
  const requiresIssueDate = [config, ...linkedConfigs].some((item) => item.requires_issue_date === true || item.validity_mode === "automatic");
  const requiresCertificateNumber = [config, ...linkedConfigs].some((item) => item.requires_certificate_number === true);
  const hasManualExpiry = [config, ...linkedConfigs].some((item) => item.validity_mode === "manual");
  const calculatedExpiry = config.validity_mode === "automatic" && issueDate
    ? calculateTrainingExpiry(issueDate, Number(config.validity_months))
    : "";
  const linkedLabels = ((config.linked_types ?? []) as string[]).map((id) => ({ id, label: linkedConfigs.find((item) => String(item.id) === id)?.name ?? "" }));
  const evidenceNames = sides.flatMap((side) => files[side] ? [files[side].name] : uploaded.has(side) ? ["Uploaded"] : []);
  const reviewLabel = config.review_policy === "none" || config.review_policy === "approved"
    ? "No reviewer approval"
    : config.review_policy === "trusted"
      ? "Trusted submitter may confirm"
      : "Reviewer approval required";
  const selectedPersonLabel = personName || String(draft?.display_name ?? (personId ? "Selected Person" : ""));
  return (
    <form className={styles.trainingSubmissionForm} onSubmit={submit}>
      <div className={styles.trainingSubmissionHeader}>
        <div><span className={styles.muted}>Training record</span><h2>{record ? "Retry Training upload" : "Add Training Record"}</h2></div>
        <button type="button" className="tt-button-subtle" onClick={onClose} disabled={busy}>Close</button>
      </div>
      <div className={styles.trainingSubmissionLayout}>
        <div className={styles.trainingSubmissionMain}>
          <fieldset disabled={busy || !!record} className={styles.trainingSubmissionSteps}>
            <section className={styles.trainingStep}>
              <header><strong>1. Person</strong><span>Select who this record belongs to.</span></header>
              {!personId && !record && <PeoplePicker organisation={organisation} area="people_choices" label="Person" selected={person} onChange={(id) => { setPerson(id); setPersonName(""); setPersonMeta({}); setExistingTraining([]); setReplacementChoice("replace"); setReplacementLookup(id && type ? "loading" : "idle"); }} onSelect={(row) => { setPersonName(String(row.display_name ?? row.name ?? "")); setPersonMeta(row); }} />}
              {selectedPersonLabel ? <div className={styles.trainingSelectedPerson}><small>Selected Person</small><strong>{selectedPersonLabel}</strong><span>{[personMeta.employee_number, personMeta.type_name ?? personMeta.relationship_type, personMeta.position].filter(Boolean).join(" · ") || "Person selected"}</span></div> : <p className={styles.trainingSelectionHint}>Search for and select a Person.</p>}
            </section>

            <section className={styles.trainingStep}>
              <header><strong>2. Training Type</strong><span>The Type controls fields, expiry, evidence and review.</span></header>
              {!record && <PeoplePicker organisation={organisation} area="training_types" label="Training Type" selected={type} onChange={(id) => { setType(id); setTypeName(""); setConfig({}); setOption(""); setSelectedOptions([]); setOptionSearch(""); setLinked([]); setLinkedConfigs([]); setExistingTraining([]); setReplacementChoice("replace"); setReplacementLookup(id && person ? "loading" : "idle"); }} onSelect={(row) => setTypeName(String(row.name ?? ""))} />}
              {record && <div className={styles.trainingSelectedPerson}><small>Training Type</small><strong>{typeName || String(draft?.training_type ?? "Training")}</strong></div>}
              {!!config.id && <div className={styles.trainingTypeSummary}><span><small>Validity</small>{config.validity_mode === "never" ? "Does not expire" : config.validity_mode === "automatic" ? `${String(config.validity_months ?? "")} months` : "Manual expiry"}</span><span><small>Evidence</small>{requirement === "none" ? "No document required" : requirement === "front_back" ? "Front + Back" : requirement === "single_or_front_back" ? "Single or Front + Back" : "Single document"}</span><span><small>Review</small>{reviewLabel}</span></div>}
              {config.option_selection_mode === "single" || config.option_selection_mode === "multiple" ? <div className={styles.field}>
                <div className={styles.trainingOptionHeading}><strong>Options / Classes</strong>{config.option_evidence_mode === "shared" && config.option_selection_mode === "multiple" && <small>One evidence item can support selected classes.</small>}</div>
                {optionDefinitions.length > 12 && <MaterialsSearch id="training-option-search" value={optionSearch} placeholder="Search classes..." onChange={(event) => setOptionSearch(event.target.value)} />}
                {optionDefinitions.length ? <div className={styles.trainingOptionChips} role="group" aria-label="Options / Classes">
                  {visibleOptions.map((item) => {
                    const id = String(item.id);
                    const active = selectedOptions.includes(id);
                    const multi = config.option_selection_mode === "multiple" && config.option_evidence_mode !== "separate";
                    return <button key={id} type="button" className={active ? styles.trainingOptionChipSelected : styles.trainingOptionChip} aria-pressed={active} disabled={busy || !!record} onClick={() => {
                      const next = multi ? (active ? selectedOptions.filter((value) => value !== id) : [...selectedOptions, id]) : active ? [] : [id];
                      setSelectedOptions(next); setOption(next[0] ?? ""); setReplacementChoice("replace");
                    }} title={String(item.name ?? item.code ?? "")}>{String(item.code ?? item.name)}{Boolean(item.code && item.name) && <small>{String(item.name)}</small>}</button>;
                  })}
                  {!visibleOptions.length && <small>No Options / Classes match this search.</small>}
                </div> : <p className={styles.muted}>No active Options / Classes are configured for this Training Type.</p>}
                {config.option_selection_mode === "multiple" && <small>{config.option_evidence_mode === "shared" ? `${selectedOptions.length} selected. One certificate will be linked to each class record.` : "Evidence is separate per class. Submit one class at a time."}</small>}
              </div> : null}
              {config.supersede_scope === "type_option_and_project" && <PeoplePicker organisation={organisation} area="projects" label="Project (optional)" selected={project} onChange={setProject} />}
              {!!linkedLabels.length && <div className={styles.trainingLinkedSection}><strong>Also record from this evidence</strong>{linkedLabels.filter((item) => item.label).map((item) => <label key={String(item.id)}><input type="checkbox" disabled={busy || !!record} checked={linked.includes(String(item.id))} onChange={(event) => setLinked(event.target.checked ? [...linked, String(item.id)] : linked.filter((value) => value !== String(item.id)))} /><span>{String(item.label)}</span></label>)}<small>The same evidence is reused. Each linked Training Type applies its own validity and review settings.</small></div>}
            </section>

            {!!config.id && <section className={styles.trainingStep}>
              <header><strong>3. Record Details</strong><span>Only relevant fields are shown.</span></header>
              <div className={styles.trainingRecordFields}>
                {requiresIssueDate && <label className={styles.field}>Issue Date *<PeopleDateInput name="issue_date" value={issueDate} onChange={setIssueDate} required /></label>}
                {!requiresIssueDate && <label className={styles.field}>Issue Date<PeopleDateInput name="issue_date" value={issueDate} onChange={setIssueDate} /></label>}
                {config.validity_mode === "never" && <div className={styles.trainingCalculatedExpiry}><small>Expiry</small><strong>Does not expire</strong></div>}
                {config.validity_mode === "automatic" && <div className={styles.trainingCalculatedExpiry}><small>Calculated Expiry</small><strong>{calculatedExpiry ? formatPeopleDate(calculatedExpiry) : "Enter an issue date to calculate"}</strong><span>Automatically calculated from this Training Type&apos;s configured validity. TTTracker saves the server-calculated date.</span></div>}
                {hasManualExpiry && <label className={styles.field}>{config.validity_mode === "manual" ? "Expiry Date *" : "Expiry Date for linked Training"}<PeopleDateInput name="expiry_date" value={expiryDate} onChange={setExpiryDate} required={config.validity_mode === "manual"} /></label>}
                {requiresCertificateNumber && <label className={styles.field}>Certificate / Licence Number *<input className="tt-input" name="certificate_number" value={certificateNumber} onChange={(event) => setCertificateNumber(event.target.value)} required /></label>}
              </div>
            </section>}
          </fieldset>

          {!!config.id && sides.length > 0 && <section className={styles.trainingStep}>
            <header><strong>4. Evidence</strong><span>Files are saved to SharePoint through the canonical document service.</span></header>
            {requirement === "single_or_front_back" && <label className={styles.field}>Evidence format<select className="tt-input" value={singleOrFront} disabled={busy || !!record} onChange={(event) => setSingleOrFront(event.target.value)}><option value="single">Single file</option><option value="front_back">Front + Back</option></select></label>}
            <div className={styles.trainingEvidenceGrid}>{sides.map((side) => <label className={styles.trainingEvidenceField} key={side}><strong>{side === "single" ? "Certificate / Licence / Evidence" : side === "front" ? "Front of Licence" : side === "back" ? "Back of Licence" : title(side)}</strong><small>PDF, JPG or PNG · max 10 MB</small><input type="file" accept="application/pdf,image/jpeg,image/png" multiple={side === "single"} disabled={busy || uploaded.has(side)} onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              if (selected.length) {
                for (const key of Object.keys(documentKeys)) if (key === side || (side === "single" && key.startsWith("single_"))) delete documentKeys[key];
                setFiles((previous) => ({ ...Object.fromEntries(Object.entries(previous).filter(([key]) => side !== "single" || !key.startsWith("single"))), ...Object.fromEntries(selected.map((file, index) => [index === 0 ? side : `${side}_${index}`, file])) }));
              }
            }} />{files[side] && <span>{files[side].name}</span>}{uploaded.has(side) && <span>Uploaded</span>}</label>)}</div>
            <small className={styles.muted}>File extension and naming are applied by the organisation&apos;s Training document setup.</small>
          </section>}
          {existingTraining.length > 0 && selectedTargets.length > 0 && <section className={styles.trainingReplacement} aria-label="Existing Training">
            <strong>Existing Training</strong>
            {existingTraining.map((row) => {
              const selectedForReplacement = replacementCandidates.some((candidate) => candidate.id === row.id);
              const willReplace = selectedForReplacement && replacementMode === "replace";
              const optionLabel = String(row.option_code ?? row.option_name ?? "");
              return <div className={styles.trainingOutcomeRecord} key={String(row.id)}>
                <span><b>{optionLabel || String(row.training_type)}</b><small>Current{row.issue_date ? ` · Issued ${formatPeopleDate(String(row.issue_date))}` : ""}{row.expiry_date ? ` · Expires ${formatPeopleDate(String(row.expiry_date))}` : ""}</small></span>
                <strong className={willReplace ? styles.trainingOutcomeReplace : styles.trainingOutcomeKeep}>{willReplace ? "Replace" : "Keep"}</strong>
              </div>;
            })}
          </section>}
          {Boolean(config.id) && selectedTargets.length > 0 && <section className={styles.trainingReplacement} aria-label="What will happen">
            <strong>What will happen</strong>
            {replacementCandidates.length > 0 && allowsMultipleCurrent && <div className={styles.trainingReplacementChoices} role="group" aria-label="Record outcome">
              <label><input type="radio" name="replacement-choice" checked={replacementChoice === "replace"} disabled={busy || !!record} onChange={() => setReplacementChoice("replace")} />Replace matching current record</label>
              <label><input type="radio" name="replacement-choice" checked={replacementChoice === "add"} disabled={busy || !!record} onChange={() => setReplacementChoice("add")} />Add alongside current record</label>
            </div>}
            <div className={styles.trainingOutcomeRecord}><span><b>{replacementOutcome}</b><small>New: {selectedOptionLabels.join(" · ") || typeName}{issueDate ? ` · Issue ${formatPeopleDate(issueDate)}` : ""}{(calculatedExpiry || expiryDate) ? ` · Expires ${formatPeopleDate(calculatedExpiry || expiryDate)}` : ""}</small></span></div>
            <small>{record ? "Upload failed or is being retried: the existing current record remains unchanged until this submission finalises." : reviewLabel === "Reviewer approval required" ? "The current record remains active until the replacement is approved. Upload failure, rejection or changes required leave it current." : "Replacement occurs only after evidence upload and successful finalisation."}</small>
          </section>}
        </div>

        <aside className={styles.trainingSubmissionSummary} aria-label="Submission Summary">
          <h3>Submission Summary</h3>
          <SubmissionSummaryRow label="Person" value={selectedPersonLabel || "Not selected"} />
          <SubmissionSummaryRow label="Training" value={typeName || String(config.name ?? "Not selected")} />
          <SubmissionSummaryRow label="Options / Classes" value={selectedOptionLabels.join(" · ") || "None"} />
          <SubmissionSummaryRow label="Issue" value={issueDate ? formatPeopleDate(issueDate) : "Not set"} />
          <SubmissionSummaryRow label="Expiry" value={config.validity_mode === "never" ? "Does not expire" : calculatedExpiry ? formatPeopleDate(calculatedExpiry) : expiryDate ? formatPeopleDate(expiryDate) : config.validity_mode === "automatic" ? "Set issue date to calculate" : "Not set"} />
          <SubmissionSummaryRow label="Review" value={config.id ? reviewLabel : "Not configured"} />
          <SubmissionSummaryRow label="Evidence" value={requirement === "none" ? "No document required" : evidenceNames.length ? evidenceNames.join(", ") : sides.length ? `${sides.length === 2 ? "Front + Back" : "Required evidence not selected"}` : "Not required"} />
          <SubmissionSummaryRow label="Record Outcome" value={config.id ? `${replacementOutcome}${record ? ". Pending successful upload and finalisation." : ""}` : "Select Training Type and Options / Classes"} />
          {linked.length > 0 && <SubmissionSummaryRow label="Also records" value={linkedLabels.filter((item) => linked.includes(item.id)).map((item) => item.label).filter(Boolean).join(", ") || "Loading linked Training"} />}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {error.includes("does not have an Employee Number") && <div className={styles.toolbar}>{canEditPerson && person && <Link className="tt-button-secondary" href={`/workspace/people/${encodeURIComponent(person)}?organisation=${encodeURIComponent(organisation)}&section=profile`}>Edit Person</Link>}{canManageDocumentSetup && <Link className="tt-button-secondary" href={`/workspace/settings/integrations/sharepoint?organisation=${encodeURIComponent(organisation)}&context=training`}>Manage Document Setup</Link>}</div>}
          <small className={styles.trainingSummaryNote} role="status">{progress || (replacementLookup === "loading" ? "Checking current Training records..." : replacementLookup === "error" ? "Current Training records could not be checked. Retry the check before submitting." : config.id ? `${reviewLabel}. Existing current records are checked before submission.` : "Select a Person and Training Type to begin.")}</small>
          {replacementLookup === "error" && person && type && <button type="button" className="tt-button-subtle" disabled={busy} onClick={() => setReplacementLookupAttempt((attempt) => attempt + 1)}>Retry current-record check</button>}
          <button type="submit" className="tt-button-primary" disabled={busy || !person || !type || !config.id || linkedConfigs.length !== linked.length || replacementLookup !== "loaded"}>{busy ? progress || "Submitting..." : record ? "Retry Upload" : "Submit Training Record"}</button>
        </aside>
      </div>
    </form>
  );
}
function SubmissionSummaryRow({ label, value: content }: { label: string; value: string }) {
  return <div className={styles.trainingSummaryRow}><small>{label}</small><strong>{content}</strong></div>;
}
function calculateTrainingExpiry(issueDate: string, months: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issueDate);
  if (!match || !Number.isFinite(months) || months < 0) return "";
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const target = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
}
async function stableTrainingDocumentId(record: string, slot: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tttracker-training-evidence:${record}:${slot}`)));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function LinkedCaption({
  organisation,
  id,
}: {
  organisation: string;
  id: string;
}) {
  const [name, setName] = useState("qualification");
  useEffect(() => {
    void fetch(
      `/api/people?organisation=${organisation}&area=training_types&id=${id}`,
    )
      .then(responseData)
      .then((d) =>
        setName(
          String(d.rows?.find((r) => r.id === id)?.name ?? "qualification"),
        ),
      );
  }, [organisation, id]);
  return <span>{name}</span>;
}

function GeneralPrivateContact({
  organisation,
  person,
  editable,
}: {
  organisation: string;
  person: string;
  editable: boolean;
}) {
  const [data, setData] = useState<Row>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/people/classified?organisation=${organisation}&person=${person}&area=private`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(responseData)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Unable to open private contact.");
      });
    return () => controller.abort();
  }, [organisation, person]);
  return (
    <section className={styles.panel}>
      <h3>General private contact</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await responseData(
              await fetch("/api/people/classified", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organisation, person, data }),
              }),
            );
          } catch {
            setError("Unable to save private contact.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className={styles.fields}>
          {["personal_email", "personal_phone"].map((key) => (
            <label className={styles.field} key={key}>
              {title(key)}
              <input
                className="tt-input"
                value={value(data, key)}
                disabled={!editable || busy}
                onChange={(e) => setData({ ...data, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        {editable && (
          <button className="tt-button-primary" disabled={busy}>
            {busy ? "Saving..." : "Save contact"}
          </button>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function PrivateDomains({
  organisation,
  person,
  permissions,
}: {
  organisation: string;
  person: string;
  permissions: Record<string, boolean>;
}) {
  const domains = [
    "personal_contact",
    "emergency_contact",
    "employment",
    "safety_claims",
  ].filter((d) => permissions[`people.private.${d}.view`]);
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!domain) return;
    const controller = new AbortController();
    void fetch(
      `/api/people/private-domain?organisation=${organisation}&person=${person}&domain=${domain}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(responseData)
      .then((r) => setValues(r as Record<string, string>))
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Unable to open this private domain.");
      });
    return () => controller.abort();
  }, [organisation, person, domain]);
  return (
    <section className={styles.panel}>
      <h2>Private information</h2>
      {permissions["people.private.view"] && (
        <GeneralPrivateContact
          organisation={organisation}
          person={person}
          editable={Boolean(permissions["people.private.edit"])}
        />
      )}
      <nav className={styles.nav}>
        {domains.map((d) => (
          <button
            className="tt-button"
            key={d}
            aria-current={domain === d ? "page" : undefined}
            onClick={() => {
              setValues({});
              setError("");
              setDomain(d);
            }}
          >
            {d.replaceAll("_", " ")}
          </button>
        ))}
      </nav>
      {!domain && (
        <p>
          No private domains are assigned to your account. Existing general
          private permissions remain managed separately in Users & Access.
        </p>
      )}
      {domain && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await responseData(
                await fetch("/api/people/private-domain", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    organisation,
                    person,
                    domain,
                    values,
                  }),
                }),
              );
            } catch {
              setError("Unable to save this private domain.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className={styles.fields}>
            {(domain === "personal_contact"
              ? ["email", "phone"]
              : domain === "emergency_contact"
                ? ["name", "phone"]
                : domain === "employment"
                  ? ["notes", "contact"]
                  : ["notes", "reference"]
            ).map((key) => (
              <label key={key} className={styles.field}>
                {key}
                <input
                  className="tt-input"
                  value={values[key] ?? ""}
                  disabled={!permissions[`people.private.${domain}.edit`]}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          {permissions[`people.private.${domain}.edit`] && (
            <button className="tt-button-primary" disabled={busy}>
              {busy ? "Saving..." : "Save private information"}
            </button>
          )}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      <small>Reads and changes are audited without recording values.</small>
    </section>
  );
}

export function TrainingHistory({
  organisation,
  record,
}: {
  organisation: string;
  record: string;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/people?organisation=${organisation}&area=training_history&id=${record}&page=${page}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(responseData)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Unable to load Training history.");
      });
    return () => controller.abort();
  }, [organisation, record, page]);
  return (
    <div className={styles.panel}>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading history...</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Previous</th>
              <th>Result</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row) => (
              <tr key={String(row.id)}>
                <td>{formatPeopleDate(row.occurred_at, true)}</td>
                <td>{title(String(row.action))}</td>
                <td>{title(String(row.previous_status ?? "Not recorded"))}</td>
                <td>{title(String(row.resulting_status ?? "Not recorded"))}</td>
                <td>{String(row.actor_name ?? row.actor_id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.toolbar}>
        <small>
          {Number(data?.total ?? 0)} events - Page {page}
        </small>
        <div className={styles.actions}>
          <button
            disabled={page === 1 || !data}
            onClick={() => {
              setPage(page - 1);
              setData(null);
              setError("");
            }}
          >
            Previous
          </button>
          <button
            disabled={!data || page * 20 >= Number(data.total ?? 0)}
            onClick={() => {
              setPage(page + 1);
              setData(null);
              setError("");
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
