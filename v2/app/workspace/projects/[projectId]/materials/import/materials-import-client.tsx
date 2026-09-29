"use client";

import { useMemo, useState } from "react";
import { ArrowRight, FileSpreadsheet } from "lucide-react";

import { Card, EmptyState, tt } from "@/components/ui/tt-ui";
import { parseCsv, type CsvRow } from "@/lib/towers/csv";

type Props = {
  organisationId: string;
  projectId: string;
};

const fields = [
  ["item_reference", "Item Reference", true],
  ["description", "Description", false],
  ["material_kind", "Material Type", false],
  ["tower_identifier", "Tower", false],
  ["bundle_reference", "Bundle", false],
  ["segment", "Segment", false],
  ["drawing_reference", "Drawing", false],
  ["required_quantity", "Required Qty", false],
  ["received_quantity", "Received Qty", false],
  ["unit", "Unit", false],
] as const;

function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function MaterialsImportClient({
  organisationId,
  projectId,
}: Props) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const missingRequired = useMemo(
    () =>
      fields.filter(
        ([key, , required]) => required && !mapping[key],
      ),
    [mapping],
  );

  async function loadFile(file: File) {
    const parsed = parseCsv(await file.text());

    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMessage(null);

    const next: Record<string, string> = {};

    for (const [key, label] of fields) {
      const candidates = [key, label].map(normalise);
      const match = parsed.headers.find((header) =>
        candidates.includes(normalise(header)),
      );

      if (match) next[key] = match;
    }

    setMapping(next);
  }

  async function commit() {
    if (missingRequired.length > 0) {
      setMessage("Map Item Reference before importing.");
      return;
    }

    setBusy(true);
    setMessage(null);

    const response = await fetch(
      `/api/projects/${projectId}/materials/import`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          rows,
          mapping,
          sourceFileName: fileName,
        }),
      },
    );

    const payload = await response.json();

    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Import failed.");
      return;
    }

    setMessage(
      `${payload.imported} material rows imported${
        payload.errorRows
          ? ` · ${payload.errorRows} rows need review`
          : ""
      }.`,
    );
  }

  return (
    <div className={tt.stack}>
      <Card>
        <label className={tt.dropzone}>
          <div>
            <FileSpreadsheet
              size={28}
              style={{
                margin: "0 auto 10px",
                color: "#7dd3fc",
              }}
            />

            <div style={{ color: "#f8fafc", fontWeight: 800 }}>
              {fileName || "Choose materials CSV"}
            </div>

            <div className={tt.help} style={{ marginTop: 6 }}>
              One material record per row. Tower is optional for project-wide items.
            </div>
          </div>

          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }}
          />
        </label>
      </Card>

      {headers.length > 0 ? (
        <Card>
          <h2 className={tt.cardTitle}>Match columns</h2>

          <div className={tt.mappingList} style={{ marginTop: 16 }}>
            {fields.map(([key, label, required]) => (
              <div key={key} className={tt.mappingRow}>
                <div>
                  <div className={tt.mappingLabel}>
                    {label}
                    {required ? " *" : ""}
                  </div>
                </div>

                <select
                  className="tt-select"
                  value={mapping[key] ?? ""}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <Card padded={false}>
          <div className={tt.cardHeader}>
            <div>
              <h2 className={tt.cardTitle}>Preview</h2>
              <p className={tt.cardDescription}>
                {rows.length} rows found.
              </p>
            </div>
          </div>

          <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
            <table className={tt.table}>
              <thead>
                <tr>
                  {headers.slice(0, 8).map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((row, index) => (
                  <tr key={index}>
                    {headers.slice(0, 8).map((header) => (
                      <td key={header}>{row[header] || "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState title="No material file loaded">
          Select a CSV to begin mapping the project register.
        </EmptyState>
      )}

      {message ? (
        <div className={`${tt.notice} ${tt.noticeInfo}`}>{message}</div>
      ) : null}

      {rows.length > 0 ? (
        <div className={tt.formActions}>
          <button
            type="button"
            className={`${tt.button} ${tt.buttonPrimary}`}
            disabled={busy || missingRequired.length > 0}
            onClick={() => void commit()}
          >
            {busy ? "Importing..." : `Import ${rows.length} rows`}
            <ArrowRight size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
