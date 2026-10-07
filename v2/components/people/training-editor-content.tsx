"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Editor,
  PeoplePicker,
  responseData,
  type Row,
} from "./people-controls";
import { FilenamePreview } from "./people-operations";
import styles from "./people.module.css";
export function TrainingClassSelection({
  organisation,
  category,
  selected,
  onChange,
}: {
  organisation: string;
  category: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/people?${new URLSearchParams({ organisation, area: "training_options", category_id: category })}`,
      { signal: controller.signal },
    )
      .then(responseData)
      .then((data) => {
        setRows(data.rows ?? []);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Unable to load options. Try reopening the editor.");
      });
    return () => controller.abort();
  }, [organisation, category]);
  return (
    <div className={styles.panel}>
      {error && <p role="alert">{error}</p>}
      {loaded && !rows.length ? (
        <div>
          <p>No options configured for this category.</p>
          <button
            type="button"
            className="tt-button"
            onClick={() => setAdding(true)}
          >
            Add Option
          </button>
        </div>
      ) : (
        <PeoplePicker
          organisation={organisation}
          area="training_options"
          filters={{ category_id: category }}
          label="Add Option / Class"
          selected=""
          onChange={(id) => {
            if (id && !selected.includes(id)) onChange([...selected, id]);
          }}
        />
      )}
      {selected.map((id) => (
        <div key={id} className={styles.toolbar}>
          <span>
            {String(
              rows.find((row) => row.id === id)?.name ?? "Configured class",
            )}
          </span>
          <button
            type="button"
            className="tt-button"
            onClick={() => onChange(selected.filter((item) => item !== id))}
          >
            Remove
          </button>
        </div>
      ))}
      <small>Leave the selection empty when no class is required.</small>
      {adding && (
        <Editor
          surface="small"
          heading="Add Option / Class"
          description="Add an option to the selected training category."
          saveLabel="Add Option"
          organisation={organisation}
          initial={{ is_active: true, sort_order: 0 }}
          fields={[
            { key: "name", label: "Option / Class", required: true },
            { key: "code", label: "Code" },
            { key: "description", label: "Description", type: "textarea" },
            { key: "is_active", label: "Active", type: "checkbox" },
          ]}
          onCancel={() => setAdding(false)}
          onSave={async (data) => {
            const result = await responseData(
              await fetch("/api/people", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  organisation,
                  action: "training_option",
                  data: { ...data, category_id: category },
                }),
              }),
            );
            const row = { ...data, id: result.id };
            setRows([...rows, row]);
            onChange([...selected, String(result.id)]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
export function TrainingFileRules({ organisation }: { organisation: string }) {
  const [selected, setSelected] = useState<Row | null>(null);
  return (
    <div className={styles.field}>
      <PeoplePicker
        organisation={organisation}
        area="document_rules"
        label="Preview configured rule"
        selected={String(selected?.id ?? "")}
        selectedLabel={String(selected?.name ?? "")}
        emptyLabel="Use organisation default"
        onChange={(id) => {
          if (!id) setSelected(null);
        }}
        onSelect={setSelected}
      />
      <p className={styles.muted}>
        Uploads use the organisation rule matching the document category and
        worker type. This selection previews a rule without changing its
        assignment.
      </p>
      {selected && (
        <FilenamePreview
          template={String(selected.filename_template)}
          folder={String(selected.folder_template)}
          dateFormat={String(selected.date_format ?? "DD-MM-YYYY")}
        />
      )}
      <Link
        href={`/workspace/people/training/configuration?organisation=${organisation}&section=document_rules`}
      >
        Edit Document Rules
      </Link>
    </div>
  );
}
