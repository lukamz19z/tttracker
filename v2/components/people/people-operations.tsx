"use client";
import { formatPeopleDate } from "@/lib/people/dates";
import { BackLink, PeopleDateInput } from "./people-ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";
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
function State({ state }: { state: string }) {
  const Icon =
    state === "current"
      ? CheckCircle2
      : state === "not_required"
        ? MinusCircle
        : state === "pending_review"
          ? Clock
          : state === "expired" || state === "missing"
            ? XCircle
            : AlertTriangle;
  return (
    <span className={styles.state} data-state={state}>
      <Icon size={15} aria-hidden />
      {title(state)}
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
  const fields: Field[] =
    area === "requirements"
      ? [
          {
            key: "project_id",
            label: "Project",
            area: "projects",
            required: true,
          },
          {
            key: "training_type_id",
            label: "Training type",
            area: "training_types",
            required: true,
          },
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
          },
          {
            key: "relationship_type_id",
            label: "Employment / Engagement Type",
            area: "types",
            required: true,
            when: { key: "applies_to", value: "relationship" },
          },
          {
            key: "position",
            label: "Position",
            required: true,
            when: { key: "applies_to", value: "position" },
          },
          {
            key: "person_id",
            label: "Person",
            area: "people_choices",
            required: true,
            when: { key: "applies_to", value: "person" },
          },
          { key: "is_active", label: "Active", type: "checkbox" },
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
            help: "Use your organisation?s document category name.",
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
              internal: "Internal",
              sharepoint: sharepoint.connected ? "SharePoint" : "SharePoint ? Not connected",
            },
            options: ["internal", "sharepoint"],
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
  return (
    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <h2>
          {area === "matrix"
            ? "Training Matrix"
            : area === "requirements"
              ? "Training Requirements"
              : "Document Structure"}
        </h2>
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
                  provider: "internal",
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
      <MaterialsSearch
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
        <div className={styles.fields}>
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
                <input
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
            sectionContent={
              area === "document_rules"
                ? (group, current) =>
                    group === "Storage" && current.provider === "sharepoint" ? (
                      <div className={styles.previewCard}>
                        <strong>{sharepoint.connected ? "SharePoint is connected. Select a configured training destination." : "SharePoint is not connected."}</strong>
                        <Link
                          href={`/workspace/settings/integrations/sharepoint?organisation=${organisation}`}
                        >
                          Manage SharePoint Integration
                        </Link>
                        <small>
                          You can save this design; uploads require a connected
                          provider.
                        </small>
                      </div>
                    ) : group === "Folder" ? (
                      <FilenamePreview
                        template={value(current, "filename_template")}
                        folder={value(current, "folder_template")}
                        dateFormat={value(current, "date_format")}
                      />
                    ) : null
                : undefined
            }
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
            {sharepoint.connected ? "SharePoint: Connected. Select a training destination in each SharePoint rule. Evidence is staged internally pending review/sync." : "SharePoint: Not connected. Rules can be designed here; external folder creation and sync require a connected integration."}{" "}
            <Link
              href={`/workspace/settings/integrations/sharepoint?organisation=${organisation}`}
            >
              Integrations
            </Link>
          </p>
        </>
      )}
      <div className={area === "matrix" ? styles.matrix : styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {area === "matrix" ? (
                <>
                  <th>Person</th>
                  {firstCells.map((c) => (
                    <th key={String(c.type_id)}>{String(c.type_name)}</th>
                  ))}
                </>
              ) : area === "requirements" ? (
                <>
                  <th>Project</th>
                  <th>Training</th>
                  <th>Applies to</th>
                  <th>Required</th>
                  <th>Current</th>
                  <th>Expiring</th>
                  <th>Gaps</th>
                  <th />
                </>
              ) : (
                <>
                  <th>Folder rule</th>
                  <th>Category</th>
                  <th>Provider</th>
                  <th>Folder</th>
                  <th>Filename</th>
                  <th />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                {area === "matrix" ? (
                  <>
                    <td>
                      <Link
                        href={`/workspace/people/${row.id}?organisation=${organisation}&section=training`}
                      >
                        {String(row.display_name)}
                      </Link>
                    </td>
                    {((row.cells ?? []) as Row[]).map((c) => (
                      <td key={String(c.type_id)}>
                        <Link
                          title={`${String(c.type_name)}: ${String(c.state)}`}
                          href={`/workspace/people/${row.id}?organisation=${organisation}&section=training&record=${c.record_id ?? ""}`}
                        >
                          <span className={styles.mobileType}>
                            {String(c.type_name)}
                          </span>
                          <State state={String(c.state)} />
                        </Link>
                      </td>
                    ))}
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
      {!loading && !rows.length && <p>No matching records.</p>}
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
              {Number(detail.people_total ?? 0)} people ? Page {detailPage}
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
      <div className={styles.toolbar}>
        <span>
          {Number(data.total ?? 0)} records · Page {page}
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
  onClose,
  onSaved,
}: {
  organisation: string;
  personId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [person, setPerson] = useState(personId ?? "");
  const [type, setType] = useState("");
  const [option, setOption] = useState("");
  const [config, setConfig] = useState<Row>({});
  const [linked, setLinked] = useState<string[]>([]);
  const [linkedConfigs, setLinkedConfigs] = useState<Row[]>([]);
  const [singleOrFront, setSingleOrFront] = useState("single");
  const [files, setFiles] = useState<Record<string, File>>({});
  const [record, setRecord] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [uploaded, setUploaded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!type) return;
    void fetch(
      `/api/people?organisation=${organisation}&area=training_types&id=${type}`,
    )
      .then(responseData)
      .then((d) => {
        setConfig(d.rows?.find((r) => r.id === type) ?? {});
        setLinked([]);
        setOption("");
      })
      .catch(() => setError("Unable to load training configuration."));
  }, [organisation, type]);
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
    try {
      const form = new FormData(e.currentTarget);
      if (!person || !type || !config.id)
        throw new Error("Choose a person and training type.");
      if (sides.some((s) => !files[s] && !uploaded.has(s)))
        throw new Error("Choose the configured evidence files.");
      let current = record;
      if (!current) {
        setProgress("Saving training details...");
        const result = await write(organisation, "training", {
          person_id: person,
          training_type_id: type,
          option_id: option,
          issue_date: form.get("issue_date"),
          expiry_date: form.get("expiry_date"),
          certificate_number: form.get("certificate_number"),
          linked_type_ids: linked,
        });
        current = String(result.id);
        setRecord(current);
      }
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
        await responseData(
          await fetch("/api/people/documents", { method: "POST", body }),
        );
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
      await write(
        organisation,
        "finalize_training",
        { source_channel: "internal", evidence_group_id: gid },
        current,
      );
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to upload. Retry without creating another record.",
      );
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <BackLink
        href={`/workspace/people?organisation=${organisation}&section=training`}
        label="Back to Training"
        onNavigate={onClose}
      />
      <div className={styles.toolbar}>
        <h2>Add training</h2>
        <button
          type="button"
          className="tt-button-subtle"
          onClick={onClose}
          disabled={busy}
        >
          Close
        </button>
      </div>
      <fieldset disabled={busy || !!record} className={styles.fields}>
        {!personId && (
          <PeoplePicker
            organisation={organisation}
            area="people_choices"
            label="Person"
            selected={person}
            onChange={setPerson}
          />
        )}
        <PeoplePicker
          organisation={organisation}
          area="training_types"
          label="Training type"
          selected={type}
          onChange={setType}
        />
        {!!config.id && (
          <>
            {((config.option_ids ?? []) as string[]).length > 0 && (
              <PeoplePicker
                organisation={organisation}
                area="training_options"
                label="Option / Class"
                selected={option}
                filters={{ training_type_id: type }}
                onChange={setOption}
              />
            )}
            <label className={styles.field}>
              Issue date
              {[config, ...linkedConfigs].some((c) => c.requires_issue_date)
                ? " *"
                : ""}
              <PeopleDateInput
                name="issue_date"
                required={[config, ...linkedConfigs].some(
                  (c) => c.requires_issue_date === true,
                )}
              />
            </label>
            {[config, ...linkedConfigs].some(
              (c) => c.validity_mode === "manual",
            ) && (
              <label className={styles.field}>
                Expiry date *
                <PeopleDateInput name="expiry_date" required />
              </label>
            )}
            <label className={styles.field}>
              Certificate / licence number
              <input
                className="tt-input"
                name="certificate_number"
                required={[config, ...linkedConfigs].some(
                  (c) => c.requires_certificate_number === true,
                )}
              />
            </label>
          </>
        )}
      </fieldset>
      {!!config.id && (
        <p className={styles.muted}>
          {config.validity_mode === "automatic"
            ? `Expiry calculated from issue date: ${config.validity_months} months.`
            : config.validity_mode === "never"
              ? "No expiry configured."
              : "Enter the expiry shown on the evidence."}{" "}
          Review: {String(config.review_policy ?? "required")}.
        </p>
      )}
      {((config.linked_types ?? []) as string[]).map((id) => (
        <label key={id}>
          <input
            type="checkbox"
            disabled={busy || !!record}
            checked={linked.includes(id)}
            onChange={(e) =>
              setLinked(
                e.target.checked
                  ? [...linked, id]
                  : linked.filter((x) => x !== id),
              )
            }
          />{" "}
          Also record linked qualification{" "}
          <LinkedCaption organisation={organisation} id={id} />
        </label>
      ))}
      {requirement === "single_or_front_back" && (
        <label className={styles.field}>
          Evidence format
          <select
            className="tt-input"
            value={singleOrFront}
            disabled={busy || !!record}
            onChange={(e) => setSingleOrFront(e.target.value)}
          >
            <option value="single">Single file</option>
            <option value="front_back">Front and back</option>
          </select>
        </label>
      )}
      <div className={styles.fields}>
        {sides.map((side) => (
          <label className={styles.field} key={side}>
            {side === "single" ? "Evidence" : `${side} of licence`} · PDF, JPG,
            PNG · max 10 MB
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              multiple={side === "single"}
              disabled={busy || uploaded.has(side)}
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                if (selected.length)
                  setFiles((previous) => ({
                    ...Object.fromEntries(
                      Object.entries(previous).filter(
                        ([key]) =>
                          side !== "single" || !key.startsWith("single"),
                      ),
                    ),
                    ...Object.fromEntries(
                      selected.map((file, index) => [
                        index === 0 ? side : `${side}_${index}`,
                        file,
                      ]),
                    ),
                  }));
              }}
            />
            {uploaded.has(side) && <small>Uploaded</small>}
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className={styles.toolbar}>
        <small role="status">
          {progress ||
            "Evidence is shared only with selected linked qualifications; expiry remains independent."}
        </small>
        <button
          className="tt-button-primary"
          disabled={
            busy || !person || !type || linkedConfigs.length !== linked.length
          }
        >
          {busy
            ? "Submitting..."
            : record
              ? "Retry submission"
              : "Submit training"}
        </button>
      </div>
    </form>
  );
}
function LinkedCaption({
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
