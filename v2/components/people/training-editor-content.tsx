"use client";
import { useState } from "react";
import Link from "next/link";
import {
  PeoplePicker,
  type Row,
} from "./people-controls";
import { FilenamePreview } from "./people-operations";
import styles from "./people.module.css";
import { MaterialsSearch } from "@/components/materials/workflow-controls";
export function TrainingClassSelection({
  definitions,
  onChange,
}: {
  definitions: Row[];
  onChange: (next: Row[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState("");
  const visible = definitions.filter((row) => `${row.code ?? ""} ${row.name ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const addBulk = () => {
    const parsed = bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const parts = line.split(/\s*[|,]\s*/, 2);
      return { code: parts[0]?.trim() ?? "", name: parts[1]?.trim() ?? "", is_active: true, sort_order: definitions.length + index };
    });
    const existing = new Set(definitions.map((row) => String(row.code ?? "").trim().toLowerCase()).filter(Boolean));
    const seen = new Set<string>();
    let invalid = -1;
    for (const [index, row] of parsed.entries()) {
      const normalized = row.code.toLowerCase();
      if (!row.code || !row.name || existing.has(normalized) || seen.has(normalized)) { invalid = index; break; }
      seen.add(normalized);
    }
    if (!parsed.length || invalid >= 0) {
      setBulkError(invalid >= 0 ? `Line ${invalid + 1}: add a code and name, and avoid duplicate codes.` : "Enter one Option / Class per line.");
      return;
    }
    onChange([...definitions, ...parsed]);
    setBulkText(""); setBulkError(""); setBulkOpen(false);
  };
  return (
    <div className={styles.panel}>
      <p className={styles.muted}>Options / Classes belong to this Training Type. Existing records keep their Option IDs; removing a used option deactivates it.</p>
      <div className={styles.toolbar}>
        <MaterialsSearch value={search} placeholder="Search options / classes..." onChange={(event) => setSearch(event.target.value)} />
        <div className={styles.actions}>
          <button type="button" className="tt-button" onClick={() => onChange([...definitions, { name: "", code: "", is_active: true, sort_order: definitions.length }])}>+ Add Option</button>
          <button type="button" className="tt-button" onClick={() => setBulkOpen(true)}>Add Multiple</button>
        </div>
      </div>
      <div className={styles.tableWrap}><table className={`${styles.table} ${styles.configurationTable}`}>
        <thead><tr><th>Code</th><th>Name</th><th>Active</th><th aria-label="Actions" /></tr></thead>
        <tbody>{visible.map((option) => {
          const index = definitions.indexOf(option);
          return <tr key={String(option.id ?? `new-${index}`)}>
            <td><input className="tt-input" aria-label={`Option ${index + 1} code`} value={String(option.code ?? "")} onChange={(event) => onChange(definitions.map((row, i) => i === index ? { ...row, code: event.target.value } : row))} /></td>
            <td><input className="tt-input" aria-label={`Option ${index + 1} name`} value={String(option.name ?? "")} onChange={(event) => onChange(definitions.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} /></td>
            <td><label><input type="checkbox" checked={option.is_active !== false} onChange={(event) => onChange(definitions.map((row, i) => i === index ? { ...row, is_active: event.target.checked } : row))} /> Active</label></td>
            <td><button type="button" className={styles.configurationRowAction} onClick={() => onChange(definitions.filter((_, i) => i !== index))}>Remove</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      {!definitions.length && <p>No Options / Classes configured for this Training Type.</p>}
      {bulkOpen && <div className={styles.panel} role="group" aria-label="Add multiple options">
        <label className={styles.field}>Paste one code and name per line<textarea className="tt-input" rows={8} placeholder={'DG | Dogging\nLF | Forklift Truck'} value={bulkText} onChange={(event) => setBulkText(event.target.value)} /></label>
        <p className={styles.muted}>Use CODE | Name or CODE, Name. All lines are validated before they are added.</p>
        {bulkError && <p role="alert">{bulkError}</p>}
        <div className={styles.actions}><button type="button" className="tt-button-primary" onClick={addBulk}>Add Options</button><button type="button" className="tt-button" onClick={() => { setBulkOpen(false); setBulkError(""); }}>Cancel</button></div>
      </div>}
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
