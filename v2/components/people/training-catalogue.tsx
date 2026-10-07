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
  const [category, setCategory] = useState("");
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
        category_id: category,
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
  }, [organisation, area, query, page, category]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  const fields: Field[] = [
    ...(area === "training_options"
      ? [
          {
            key: "category_id",
            label: "Category",
            area: "training_categories",
            required: true,
          },
        ]
      : []),
    {
      key: "name",
      label:
        area === "training_categories" ? "Category name" : "Option / Class",
      required: true,
    },
    { key: "code", label: "Code" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "sort_order", label: "Display order", type: "number" },
    { key: "is_active", label: "Active", type: "checkbox" },
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
            Organisation-configured groupings and classes used by your Training
            records.
          </p>
        </div>
        <button
          className="tt-button-primary"
          onClick={() =>
            setEditor({ is_active: true, sort_order: 0, category_id: category })
          }
        >
          <Plus size={16} />
          {area === "training_categories" ? "Add Category" : "Add Option"}
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
            area="training_categories"
            label="Category"
            emptyLabel="All categories"
            selected={category}
            onChange={(id) => {
              setCategory(id);
              setPage(1);
            }}
          />
        )}
      </div>
      {area === "training_options" && !category && (
        <p className={styles.muted}>
          Showing All categories. Select a category to manage its options.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {editor && (
        <>
          <Editor
            surface="small"
            saveLabel={
              area === "training_categories" ? "Save Category" : "Save Option"
            }
            heading={`${editor.id ? "Edit" : "Add"} ${area === "training_categories" ? "Category" : "Option / Class"}`}
            organisation={organisation}
            fields={fields}
            initial={editor}
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
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              {area === "training_options" && <th>Category</th>}
              <th>Description</th>
              {area === "training_categories" && (
                <>
                  <th>Training Types</th>
                  <th>Options</th>
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
                  <td>{String(row.category ?? "Not assigned")}</td>
                )}
                <td>{String(row.description ?? "Not provided")}</td>
                {area === "training_categories" && (
                  <>
                    <td>{String(row.training_type_count ?? 0)}</td>
                    <td>{String(row.option_count ?? 0)}</td>
                  </>
                )}
                <td>{String(row.code ?? "Not assigned")}</td>
                <td>{String(row.sort_order)}</td>
                <td>{row.is_active ? "Active" : "Inactive"}</td>
                <td>
                  <button onClick={() => setEditor(row)}>Edit</button>
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
