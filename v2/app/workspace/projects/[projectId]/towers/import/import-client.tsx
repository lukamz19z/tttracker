"use client";

import {
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  UploadCloud,
} from "lucide-react";

import {
  Card,
  EmptyState,
  tt,
} from "@/components/ui/tt-ui";
import {
  parseCsv,
  type CsvRow,
} from "@/lib/towers/csv";

type ImportField = {
  fieldKey: string;
  label: string;
  targetKind:
    | "core"
    | "extra_data"
    | "ignore";
  targetKey: string;
  aliases: string[];
  required: boolean;
  dataType: string;
  sortOrder: number;
};

type Props = {
  organisationId: string;
  projectId: string;
};

const EXAMPLE_HEADERS = [
  "Tower",
  "Tower Type",
  "Line",
  "Sequence",
  "Tower Weight (t)",
  "Body Extension",
  "Leg A",
  "Leg B",
  "Leg C",
  "Leg D",
];

const EXAMPLE_ROWS = [
  [
    "T001",
    "Suspension Type A",
    "Line 1",
    "1",
    "18.40",
    "0m",
    "0m",
    "0m",
    "0m",
    "0m",
  ],
  [
    "T002",
    "Tension Type B",
    "Line 1",
    "2",
    "22.65",
    "+3m",
    "+3m",
    "+3m",
    "+3m",
    "+3m",
  ],
];

export default function ImportClient({
  organisationId,
  projectId,
}: Props) {
  const router = useRouter();

  const [fileName, setFileName] =
    useState("");
  const [headers, setHeaders] =
    useState<string[]>([]);
  const [rows, setRows] =
    useState<CsvRow[]>([]);
  const [fields, setFields] =
    useState<ImportField[]>([]);
  const [mapping, setMapping] =
    useState<Record<string, string>>(
      {},
    );
  const [
    duplicateMode,
    setDuplicateMode,
  ] = useState("skip");
  const [busy, setBusy] =
    useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

  const requiredMissing =
    useMemo(
      () =>
        fields.filter(
          (field) =>
            field.required &&
            !mapping[
              field.fieldKey
            ],
        ),
      [fields, mapping],
    );

  const mappedCount =
    Object.values(mapping).filter(
      Boolean,
    ).length;

  function downloadExample() {
    const csv = [
      EXAMPLE_HEADERS,
      ...EXAMPLE_ROWS,
    ]
      .map((row) =>
        row
          .map((value) => {
            const escaped =
              String(value).replaceAll(
                '"',
                '""',
              );
            return `"${escaped}"`;
          })
          .join(","),
      )
      .join("\r\n");

    const blob = new Blob(
      [csv],
      {
        type: "text/csv;charset=utf-8",
      },
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download =
      "tttracker-tower-import-example.csv";
    anchor.click();

    URL.revokeObjectURL(url);
  }

  async function loadFile(
    file: File,
  ) {
    setMessage(null);

    const content =
      await file.text();

    const parsed =
      parseCsv(content);

    if (
      parsed.headers.length === 0 ||
      parsed.rows.length === 0
    ) {
      setMessage(
        "The CSV does not contain any tower rows.",
      );
      return;
    }

    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);

    const response =
      await fetch(
        `/api/projects/${projectId}/tower-import/config`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            organisationId,
            headers:
              parsed.headers,
          }),
        },
      );

    const payload =
      await response.json();

    if (!response.ok) {
      setMessage(
        payload.error ??
          "Could not load import mapping.",
      );
      return;
    }

    setFields(payload.fields);
    setMapping(
      payload.suggestedMapping,
    );
  }

  async function commit() {
    if (
      requiredMissing.length > 0
    ) {
      setMessage(
        `Map the required field${
          requiredMissing.length === 1
            ? ""
            : "s"
        }: ${requiredMissing
          .map(
            (field) =>
              field.label,
          )
          .join(", ")}`,
      );
      return;
    }

    setBusy(true);
    setMessage(null);

    const response =
      await fetch(
        `/api/projects/${projectId}/tower-import/commit`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            organisationId,
            sourceFileName:
              fileName,
            headers,
            rows,
            mapping,
            duplicateMode,
          }),
        },
      );

    const payload =
      await response.json();

    if (!response.ok) {
      setMessage(
        payload.error ??
          "Import failed.",
      );
      setBusy(false);
      return;
    }

    if (
      payload.errorRows > 0
    ) {
      setMessage(
        `${payload.imported} imported · ${payload.skipped} skipped · ${payload.errorRows} rows need review.`,
      );
      setBusy(false);
      return;
    }

    router.push(
      `/workspace/projects/${projectId}/towers?organisation=${encodeURIComponent(
        organisationId,
      )}`,
    );
    router.refresh();
  }

  return (
    <div className={tt.stack}>
      <Card>
        <div className={tt.toolbar}>
          <div>
            <h2 className={tt.cardTitle}>
              CSV structure
            </h2>
            <p className={tt.cardDescription}>
              Only the Tower column is required. The other columns below are common project fields and can be mapped to differently named columns in your own CSV.
            </p>
          </div>

          <button
            type="button"
            className={tt.button}
            onClick={downloadExample}
          >
            <Download size={15} />
            Download example CSV
          </button>
        </div>

        <div
          className={`${tt.notice} ${tt.noticeInfo}`}
          style={{ marginTop: 16 }}
        >
          Your source file does not need to use these exact headings. TTTracker suggests mappings automatically and lets you confirm them before anything is imported. Extra unmapped columns are retained with the tower record.
        </div>

        <div
          className={tt.tableWrap}
          style={{ marginTop: 16 }}
        >
          <table className={tt.table}>
            <thead>
              <tr>
                {EXAMPLE_HEADERS.map(
                  (header) => (
                    <th key={header}>
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>

            <tbody>
              {EXAMPLE_ROWS.map(
                (row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map(
                      (
                        value,
                        columnIndex,
                      ) => (
                        <td
                          key={
                            EXAMPLE_HEADERS[
                              columnIndex
                            ]
                          }
                        >
                          {value}
                        </td>
                      ),
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div className={tt.projectIcon}>
            <UploadCloud size={19} />
          </div>

          <div>
            <h2 className={tt.cardTitle}>
              Upload tower schedule
            </h2>
            <p className={tt.cardDescription}>
              Select the CSV, then review TTTracker's suggested field mapping before importing.
            </p>
          </div>
        </div>

        <label className={tt.dropzone}>
          <div>
            <FileSpreadsheet
              size={28}
              style={{
                margin: "0 auto 10px",
                color: "#7dd3fc",
              }}
            />

            <div
              style={{
                color: "#f8fafc",
                fontWeight: 800,
              }}
            >
              {fileName ||
                "Choose tower CSV"}
            </div>

            <div
              className={tt.help}
              style={{ marginTop: 6 }}
            >
              CSV format · one tower per row · headings in the first row
            </div>
          </div>

          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(event) => {
              const file =
                event.target.files?.[0];

              if (file) {
                void loadFile(file);
              }
            }}
          />
        </label>
      </Card>

      {headers.length > 0 ? (
        <Card>
          <div className={tt.toolbar}>
            <div>
              <h2 className={tt.cardTitle}>
                Match columns
              </h2>
              <p className={tt.cardDescription}>
                {mappedCount} of{" "}
                {fields.length} supported fields mapped automatically.
              </p>
            </div>

            <div className={tt.status}>
              {rows.length} rows
            </div>
          </div>

          <div
            className={tt.mappingList}
            style={{ marginTop: 18 }}
          >
            {fields.map(
              (field) => (
                <div
                  key={field.fieldKey}
                  className={tt.mappingRow}
                >
                  <div>
                    <div
                      className={tt.mappingLabel}
                    >
                      {field.label}
                      {field.required
                        ? " *"
                        : ""}
                    </div>

                    <div
                      className={tt.mappingMeta}
                    >
                      {field.targetKind ===
                      "extra_data"
                        ? "Tower detail"
                        : "Core tower field"}
                    </div>
                  </div>

                  <select
                    className="tt-select"
                    value={
                      mapping[
                        field.fieldKey
                      ] ?? ""
                    }
                    onChange={(event) =>
                      setMapping(
                        (current) => ({
                          ...current,
                          [field.fieldKey]:
                            event.target.value,
                        }),
                      )
                    }
                  >
                    <option value="">
                      Not mapped
                    </option>

                    {headers.map(
                      (header) => (
                        <option
                          key={header}
                          value={header}
                        >
                          {header}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              ),
            )}
          </div>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <Card padded={false}>
          <div className={tt.cardHeader}>
            <div>
              <h2 className={tt.cardTitle}>
                Preview
              </h2>
              <p className={tt.cardDescription}>
                Review the first few rows before importing.
              </p>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "#94a3b8",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Existing towers
              <select
                className="tt-select"
                value={duplicateMode}
                onChange={(event) =>
                  setDuplicateMode(
                    event.target.value,
                  )
                }
              >
                <option value="skip">
                  Skip
                </option>
                <option value="update">
                  Update
                </option>
                <option value="error">
                  Flag as error
                </option>
              </select>
            </label>
          </div>

          <div
            className={tt.tableWrap}
            style={{
              border: 0,
              borderRadius: 0,
            }}
          >
            <table className={tt.table}>
              <thead>
                <tr>
                  {headers
                    .slice(0, 8)
                    .map((header) => (
                      <th key={header}>
                        {header}
                      </th>
                    ))}
                </tr>
              </thead>

              <tbody>
                {rows
                  .slice(0, 8)
                  .map(
                    (
                      row,
                      index,
                    ) => (
                      <tr key={index}>
                        {headers
                          .slice(0, 8)
                          .map(
                            (header) => (
                              <td
                                key={header}
                              >
                                {row[
                                  header
                                ] || "-"}
                              </td>
                            ),
                          )}
                      </tr>
                    ),
                  )}
              </tbody>
            </table>
          </div>

          {rows.length > 8 ? (
            <div
              style={{
                padding: "11px 16px",
                borderTop:
                  "1px solid #1e293b",
                color: "#64748b",
                fontSize: 11,
              }}
            >
              Showing 8 of {rows.length} rows.
            </div>
          ) : null}
        </Card>
      ) : null}

      {message ? (
        <div
          className={`${tt.notice} ${
            requiredMissing.length > 0
              ? tt.noticeWarn
              : tt.noticeError
          }`}
        >
          {message}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className={tt.formActions}>
          <button
            type="button"
            disabled={
              busy ||
              requiredMissing.length > 0
            }
            onClick={() =>
              void commit()
            }
            className={`${tt.button} ${tt.buttonPrimary}`}
          >
            {busy
              ? "Importing..."
              : `Import ${rows.length} towers`}
            <ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <EmptyState title="No tower file loaded">
          Use the example above as a guide, then select the project CSV to begin mapping.
        </EmptyState>
      )}
    </div>
  );
}
