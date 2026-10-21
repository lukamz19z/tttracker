"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { MaterialsSearch } from "@/components/materials/workflow-controls";
import {
  Editor,
  PeoplePicker,
  responseData,
  type Row,
  type Field,
} from "./people-controls";
import styles from "./people.module.css";
import { DocumentTemplateBuilder } from "@/components/integrations/document-template-builder";
import { contextTokens } from "@/lib/integrations/resolver";
export function TrainingCatalogue({
  organisation,
  area,
}: {
  organisation: string;
  area: "training_categories" | "training_options";
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [trainingType, setTrainingType] = useState("");
  const [editor, setEditor] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        organisation,
        area,
        q: query,
        page: String(page),
        training_type_id: trainingType,
        include_inactive: area === "training_options" ? "true" : "false",
      });
      const result = await responseData(await fetch(`/api/people?${params}`));
      setRows(result.rows ?? []);
      setTotal(Number(result.total ?? 0));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load configuration.",
      );
    } finally {
      setLoading(false);
    }
  }, [organisation, area, query, page, trainingType]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  const fields: Field[] = [
    ...(area === "training_options"
      ? [
          {
            key: "training_type_id",
            label: "Training Type",
            area: "training_types",
            required: true,
            group: "Basic Details",
          },
        ]
      : []),
    {
      key: "name",
      label:
        area === "training_categories" ? "Category name" : "Option / Class",
      required: true,
      group: "Basic Details",
    },
    { key: "code", label: "Code", group: "Basic Details" },
    { key: "description", label: "Description", type: "textarea", group: "Basic Details" },
    { key: "sort_order", label: "Display order", type: "number", group: "Basic Details" },
    { key: "is_active", label: "Active", type: "checkbox", group: "Basic Details" },
    ...(area === "training_categories" ? [{ key: "filename_template", label: "Category file name override", type: "custom", group: "File Naming" }] : []),
  ];
  const [notice, setNotice] = useState("");
  return (
    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <div>
          <h2>
            {area === "training_categories"
              ? "Training Categories"
              : "Options / Classes"}
          </h2>
          <p className={styles.muted}>
            {area === "training_categories" ? "Categories group related Training Types." : "Each Option / Class belongs to a Training Type."}
          </p>
        </div>
        <button
          className={`tt-button-primary ${styles.configurationAddButton}`}
            onClick={() =>
            setEditor({ is_active: true, sort_order: 0, training_type_id: trainingType })
          }
        >
          <Plus size={16} />
          {area === "training_categories" ? "Add Category" : "Add Option / Class"}
        </button>
      </div>
      <div className={styles.fields}>
        <MaterialsSearch
          value={query}
          placeholder={
            area === "training_categories"
              ? "Search categories..."
              : "Search options..."
          }
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
          {area === "training_options" && (
          <PeoplePicker
            organisation={organisation}
              area="training_types"
              label="Training Type"
              emptyLabel="All Training Types"
              selected={trainingType}
            onChange={(id) => {
              setTrainingType(id);
              setPage(1);
            }}
          />
        )}
      </div>
      {area === "training_options" && !trainingType && (
        <p className={styles.muted}>
          Options / Classes are owned by a Training Type. Select a Training Type to filter.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {editor && (
        <>
          <Editor
            key={String(editor.id ?? "new-training-catalogue-item")}
            surface="small"
            saveLabel={
              area === "training_categories" ? "Save Category" : "Save Option"
            }
            heading={`${editor.id ? "Edit" : "Add"} ${area === "training_categories" ? "Category" : "Option / Class"}`}
            organisation={organisation}
            fields={fields}
            initial={editor}
            groupContent={area === "training_categories" ? { "File Naming": <p className={styles.muted}>Optional Category name used after a Ticket-specific name and before the organisation Training default.</p> } : undefined}
            sectionContent={area === "training_categories" ? (group, data, update) => group === "File Naming" ? <CategoryFilenameEditor value={String(data.filename_template ?? "")} onChange={(filename_template) => update({ filename_template })} /> : null : undefined}
            onCancel={() => setEditor(null)}
            onSave={async (data) => {
              await responseData(
                await fetch("/api/people", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    organisation,
                    action:
                      area === "training_categories"
                        ? "training_category"
                        : "training_option",
                    id: editor.id,
                    data,
                  }),
                }),
              );
              setEditor(null);
              setNotice(
                area === "training_categories"
                  ? "Category saved."
                  : "Option saved.",
              );
              await load();
            }}
          />
        </>
      )}
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.configurationTable}`}>
          <thead>
            <tr>
              <th>Name</th>
              {area === "training_options" && <><th>Training Type</th><th>Category</th></>}
              <th>Description</th>
              {area === "training_categories" && (
                <>
                  <th>Training Types</th>
                </>
              )}
              <th>Code</th>
              <th>Order</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  <strong>{String(row.name)}</strong>
                </td>
                {area === "training_options" && (
                  <><td>{String(row.training_type ?? "Needs Assignment")}</td><td>{String(row.category ?? "—")}</td></>
                )}
                <td>{String(row.description ?? "Not provided")}</td>
                {area === "training_categories" && (
                  <>
                    <td>{String(row.training_type_count ?? 0)}</td>
                  </>
                )}
                <td>{String(row.code ?? "Not assigned")}</td>
                <td>{String(row.sort_order)}</td>
                <td>{row.is_active ? "Active" : "Inactive"}</td>
                <td>
                  <button className={styles.configurationRowAction} onClick={() => setEditor(row)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !rows.length && <p>No matching configuration.</p>}
      <div className={styles.toolbar}>
        <small>
          {total} records | Page {page}
        </small>
        <div className={styles.actions}>
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            disabled={page * 20 >= total || loading}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function CategoryFilenameEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [mode, setMode] = useState(value ? "custom" : "default");
  const tokens = contextTokens.training.filter((token) => ["employee_number", "person_display_name", "training_type", "training_category", "training_option", "document_side", "issue_date", "expiry_date"].includes(token));
  return <div className={styles.panel}>
    <label className={styles.field}>Category file name<select className="tt-input" value={mode} onChange={(event) => { setMode(event.target.value); if (event.target.value === "default") onChange(""); }}>
      <option value="default">Use organisation Training default</option><option value="custom">Custom for this Category</option>
    </select></label>
    {mode === "custom" ? <><DocumentTemplateBuilder value={value} onChange={onChange} tokens={tokens} filename /><button className="tt-button-subtle" type="button" onClick={() => { onChange(""); setMode("default"); }}>Reset to Default</button></> : <p className={styles.muted}>This Category inherits the organisation Training file name unless a Ticket has its own override.</p>}
  </div>;
}
