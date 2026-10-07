"use client";
import { peopleLabel } from "@/lib/people/display";
import { PeopleDateInput } from "./people-ui";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ConfigurationSurface } from "./configuration-surface";
import { TokenInput, validateTemplate } from "./token-input";
import { MaterialsSearch } from "@/components/materials/workflow-controls";
import styles from "./people.module.css";
export type Row = Record<string, unknown>;
export type Result = {
  rows?: Row[];
  total?: number;
  page?: number;
  [key: string]: unknown;
};
export type Field = {
  key: string;
  label: string;
  group?: string;
  type?: string;
  required?: boolean;
  area?: string;
  filters?: Record<string, string>;
  when?: { key: string; value: string };
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  emptyLabel?: string;
  help?: string;
  visible?: (data: Row) => boolean;
};
export const value = (row: Row, key: string) =>
  row[key] == null ? "" : String(row[key]);
export const title = peopleLabel;
export const labels: Record<string, string> = {
  PEOPLE_CONFIGURATION_DUPLICATE:
    "This category or class already exists. Edit the existing record.",
  PEOPLE_REVIEW_REQUIRED_FOR_SENSITIVE_TEMPLATE:
    "Private and training requests require review. No-review completion supports Operational fields only.",
  PEOPLE_SECTIONS_REVIEW_REQUIRED:
    "Approve each section before completing this onboarding.",
  PEOPLE_CONFIDENTIAL_COLLECTION_DISABLED:
    "Confidential collection unavailable. Secure key infrastructure must be configured and verified.",
  PEOPLE_CLASSIFICATION_INVALID:
    "This field type requires a more restrictive classification.",
  PEOPLE_TEMPLATE_INVALID:
    "Check section names, field types, options and supported conditions.",
  PEOPLE_INVALID_PATH: "Use supported folder tokens and a safe folder name.",
  PEOPLE_DOCUMENT_RULE_AMBIGUOUS:
    "More than one document rule matches. Configure one rule for this category and relationship.",
  TRAINING_STORAGE_NOT_CONNECTED:
    "The configured SharePoint storage is not connected. Change the rule to Internal or connect the integration.",
  PEOPLE_ONBOARDING_SEND_FAILED:
    "Onboarding was saved, but the email could not be sent. Use Resend to retry.",
  PEOPLE_RATE_LIMITED: "Wait 30 seconds before resending this onboarding link.",
  PEOPLE_PERMISSION_DENIED:
    "You do not have permission for this People action.",
  PEOPLE_RECORD_NOT_FOUND: "This record is unavailable.",
  PEOPLE_POSSIBLE_DUPLICATE:
    "A person with this work email already exists. Check the register before continuing.",
  PEOPLE_IDENTIFIER_EXISTS: "This person identifier is already in use.",
  TRAINING_DOCUMENTS_REQUIRED:
    "Upload the configured evidence before approving.",
  TRAINING_CERTIFICATE_REQUIRED:
    "Enter the required certificate or licence number.",
  TRAINING_ISSUE_DATE_REQUIRED: "This qualification requires an issue date.",
  TRAINING_EXPIRY_REQUIRED:
    "Enter an expiry date, or configure automatic validity.",
  TRAINING_REVIEW_COMMENT_REQUIRED:
    "Enter a reason for rejection or requested changes.",
  TRAINING_INVALID_TRANSITION:
    "This submission has already been reviewed. Refresh to see its current state.",
  PEOPLE_RELATIONSHIP_INVALID:
    "The selected record is not available in this organisation.",
};
export async function responseData(response: Response): Promise<Result> {
  const result: Result & { error?: string } = await response.json();
  if (!response.ok)
    throw new Error(
      labels[result.error ?? ""] ??
        "Unable to complete this action. Check the details and try again.",
    );
  return result;
}

export function PeoplePicker({
  organisation,
  area,
  label,
  selected,
  onChange,
  filters,
  selectedLabel,
  emptyLabel,
  onSelect,
}: {
  organisation: string;
  area: string;
  label: string;
  selected: string;
  onChange: (id: string) => void;
  filters?: Record<string, string>;
  selectedLabel?: string;
  emptyLabel?: string;
  onSelect?: (row: Row) => void;
}) {
  const filterKey = JSON.stringify(filters ?? {});
  const id = useId();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        organisation,
        area,
        q: query,
        ...JSON.parse(filterKey),
      });
      fetch(`/api/people?${params}`, { signal: controller.signal })
        .then(responseData)
        .then((data) => setRows(data.rows ?? []))
        .catch(() => {
          if (!controller.signal.aborted) setRows([]);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [organisation, area, query, open, filterKey]);
  return (
    <div className={styles.picker}>
      <label htmlFor={id}>{label}</label>
      <MaterialsSearch
        id={id}
        value={
          open
            ? query
            : selected
              ? caption || selectedLabel || "Selected record"
              : (emptyLabel ?? "")
        }
        placeholder={`Search ${label.toLowerCase()}...`}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
        }}
        onClear={() => {
          onChange("");
          setCaption("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            document
              .getElementById(`${id}-options`)
              ?.querySelector<HTMLButtonElement>("button")
              ?.focus();
          }
        }}
      />
      {open && (
        <div role="listbox" id={`${id}-options`} className={styles.options}>
          {emptyLabel && (
            <button
              type="button"
              role="option"
              aria-selected={!selected}
              onClick={() => {
                onChange("");
                setCaption("");
                setOpen(false);
              }}
            >
              {emptyLabel}
            </button>
          )}
          {rows.map((row) => (
            <button
              type="button"
              role="option"
              aria-selected={selected === value(row, "id")}
              key={value(row, "id")}
              onClick={() => {
                onChange(value(row, "id"));
                onSelect?.(row);
                setCaption(
                  value(row, "display_name") ||
                    value(row, "name") ||
                    value(row, "email"),
                );
                setOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (
                  event.key === "ArrowDown" &&
                  event.currentTarget.nextElementSibling instanceof HTMLElement
                )
                  event.currentTarget.nextElementSibling.focus();
                if (
                  event.key === "ArrowUp" &&
                  event.currentTarget.previousElementSibling instanceof
                    HTMLElement
                )
                  event.currentTarget.previousElementSibling.focus();
              }}
            >
              {value(row, "display_name") ||
                value(row, "name") ||
                value(row, "email")}
            </button>
          ))}
          {!rows.length && (
            <small>No matching records. Search another name.</small>
          )}
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export function Editor({
  organisation,
  heading,
  fields,
  initial = {},
  onSave,
  onCancel,
  derive,
  fieldPreview,
  groupContent,
  surface,
  description,
  saveLabel = "Save",
  sectionContent,
}: {
  organisation: string;
  heading: string;
  fields: Field[];
  initial?: Row;
  onSave: (data: Row) => Promise<void>;
  onCancel: () => void;
  surface?: "small" | "medium" | "large";
  description?: string;
  saveLabel?: string;
  sectionContent?: (
    group: string,
    data: Row,
    update: (next: Row) => void,
  ) => ReactNode;
  groupContent?: Record<string, ReactNode>;
  fieldPreview?: (field: Field, data: Row) => ReactNode;
  derive?: (key: string, id: string) => Promise<Row>;
}) {
  const [data, setData] = useState<Row>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const groups = [
    ...new Set(fields.map((f) => f.group).filter((g): g is string => !!g)),
    ...Object.keys(groupContent ?? {}).filter(
      (g) => !fields.some((f) => f.group === g),
    ),
  ].sort((a, b) => {
    const order = [
      "Basic",
      "Category",
      "Validity",
      "Evidence",
      "Review",
      "File Rules",
    ];
    return order.includes(a) && order.includes(b)
      ? order.indexOf(a) - order.indexOf(b)
      : 0;
  });
  const [selectedGroup, setSelectedGroup] = useState(groups[0] ?? "");
  const lock = useRef(false);
  const formId = useId();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const visible = (field: Field) =>
    (!field.when || value(data, field.when.key) === field.when.value) &&
    (!field.visible || field.visible(data));
  async function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (lock.current) return;
    const invalid = fields.filter(
      (field) =>
        visible(field) && field.required && !value(data, field.key).trim(),
    );
    const problems: Record<string, string> = Object.fromEntries(
      invalid.map((field) => [field.key, `${field.label} is required.`]),
    );
    for (const field of fields.filter(visible)) {
      if (field.type === "token") {
        try {
          validateTemplate(
            value(data, field.key),
            field.key === "folder_template",
          );
        } catch {
          problems[field.key] =
            `${field.label} contains an unsupported token or unsafe path.`;
        }
      }
    }
    for (const field of fields.filter(visible)) {
      const entered = value(data, field.key).trim();
      if (
        field.type === "email" &&
        entered &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entered)
      )
        problems[field.key] = "Enter a valid email address.";
    }
    setFieldErrors(problems);
    if (Object.keys(problems).length) {
      const target = fields.find((field) => problems[field.key]);
      setSelectedGroup(target?.group ?? groups[0] ?? "");
      return;
    }
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      const payload = { ...data };
      for (const field of fields) {
        if (field.type === "datetime-local" && value(data, field.key)) {
          const date = new Date(value(data, field.key));
          if (!Number.isFinite(date.getTime()))
            throw new Error("Enter a valid date and time.");
          payload[field.key] = date.toISOString();
        }
      }
      await onSave(payload);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const form = (
    <form id={formId} className={styles.form} onSubmit={submit} noValidate>
      {!surface && (
        <div className={styles.toolbar}>
          <strong>{heading}</strong>
          <button type="button" className="tt-button" onClick={onCancel}>
            Close
          </button>
        </div>
      )}
      {!!groups.length && (
        <nav className={styles.editorTabs} aria-label="Editor sections">
          {groups.map((group) => (
            <button
              type="button"
              key={group}
              aria-current={group === selectedGroup ? "page" : undefined}
              onClick={() => setSelectedGroup(group)}
            >
              {group}
            </button>
          ))}
        </nav>
      )}
      {groupContent?.[selectedGroup]}
      <div className={styles.fields}>
        {fields
          .filter(
            (field) =>
              (!field.group || field.group === selectedGroup) && visible(field),
          )
          .map((field) => (
            <div key={field.key} className={styles.field}>
              {field.area ? (
                <PeoplePicker
                  organisation={organisation}
                  area={field.area}
                  emptyLabel={field.emptyLabel}
                  filters={field.filters}
                  label={field.label + (field.required ? " *" : "")}
                  selected={value(data, field.key)}
                  selectedLabel={
                    field.key === "category_id"
                      ? value(data, "category")
                      : field.key === "relationship_type_id"
                        ? value(data, "type_name")
                        : undefined
                  }
                  onChange={(id) => {
                    setData((prev) => ({
                      ...prev,
                      [field.key]: id,
                      ...(field.key === "category_id"
                        ? { option_ids: [] }
                        : {}),
                    }));
                    if (derive && id)
                      void derive(field.key, id)
                        .then((extra) =>
                          setData((prev) =>
                            prev[field.key] === id
                              ? { ...prev, ...extra }
                              : prev,
                          ),
                        )
                        .catch(() =>
                          setError("Unable to load the selected record."),
                        );
                  }}
                />
              ) : field.type === "training-validity" ||
                field.type === "training-evidence" ? (
                <TrainingRequirementControl
                  kind={field.type}
                  value={value(data, field.key)}
                  onChange={(next) => setData({ ...data, [field.key]: next })}
                />
              ) : (
                <label className={styles.field}>
                  {field.label}
                  {field.required && " *"}
                  {field.options ? (
                    <select
                      className="tt-input"
                      value={value(data, field.key)}
                      onChange={(event) =>
                        setData({ ...data, [field.key]: event.target.value })
                      }
                    >
                      <option value="">
                        {field.emptyLabel ?? "Choose..."}
                      </option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {field.optionLabels?.[option] ?? title(option)}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "token" ? (
                    <TokenInput
                      value={value(data, field.key)}
                      onChange={(next) =>
                        setData({ ...data, [field.key]: next })
                      }
                    />
                  ) : field.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={data[field.key] === true}
                      onChange={(event) =>
                        setData({ ...data, [field.key]: event.target.checked })
                      }
                    />
                  ) : field.type === "textarea" ? (
                    <textarea
                      className="tt-input"
                      rows={2}
                      value={value(data, field.key)}
                      onChange={(event) =>
                        setData({ ...data, [field.key]: event.target.value })
                      }
                    />
                  ) : field.type === "date" ||
                    field.type === "datetime-local" ? (
                    <PeopleDateInput
                      value={value(data, field.key)}
                      withTime={field.type === "datetime-local"}
                      required={field.required}
                      onChange={(next) =>
                        setData({ ...data, [field.key]: next })
                      }
                    />
                  ) : (
                    <input
                      className="tt-input"
                      type={field.type ?? "text"}
                      required={field.required}
                      value={value(data, field.key)}
                      onChange={(event) =>
                        setData({ ...data, [field.key]: event.target.value })
                      }
                    />
                  )}
                </label>
              )}
              {field.help && (
                <small className={styles.muted}>{field.help}</small>
              )}
              {fieldErrors[field.key] && (
                <small className={styles.fieldError} role="alert">
                  {fieldErrors[field.key]}
                </small>
              )}
              {fieldPreview?.(field, data)}
            </div>
          ))}
      </div>
      {sectionContent?.(selectedGroup, data, (next) =>
        setData({ ...data, ...next }),
      )}
      {error && <p role="alert">{error}</p>}
      {!surface && (
        <div className={styles.editorFooter}>
          <button type="button" className="tt-button" onClick={onCancel}>
            Cancel
          </button>
          <button className="tt-button-primary" disabled={saving}>
            {saving ? "Saving..." : saveLabel}
          </button>
        </div>
      )}
    </form>
  );
  return surface ? (
    <ConfigurationSurface
      title={heading}
      description={description}
      size={surface}
      dirty={editorHasChanges(initial, data, fields)}
      busy={saving}
      onClose={onCancel}
      footer={
        <button
          type="submit"
          form={formId}
          className="tt-button-primary"
          disabled={saving}
        >
          {saving ? "Saving..." : saveLabel}
        </button>
      }
    >
      {form}
    </ConfigurationSurface>
  ) : (
    form
  );
}

function TrainingRequirementControl({
  kind,
  value,
  onChange,
}: {
  kind: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const validity = kind === "training-validity";
  const disabledValue = validity ? "never" : "none";
  const enabled = value !== disabledValue;
  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        {validity ? "Does this training expire?" : "Require evidence?"}
        <select
          className="tt-input"
          value={enabled ? "yes" : "no"}
          onChange={(e) =>
            onChange(
              e.target.value === "no"
                ? disabledValue
                : validity
                  ? "manual"
                  : "single",
            )
          }
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      {enabled && (
        <label className={styles.field}>
          {validity ? "Expiry method" : "Evidence format"}
          <select
            className="tt-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            {(validity
              ? ["automatic", "manual"]
              : ["single", "front_back", "single_or_front_back"]
            ).map((option) => (
              <option key={option} value={option}>
                {title(option)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function editorHasChanges(before: Row, after: Row, fields: Field[]) {
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort();
  function comparable(row: Row) {
    return keys.map((key) => {
      const field = fields.find((field) => field.key === key);
      const item = row[key];
      if (key === "option_ids")
        return [key, [...((item ?? []) as string[])].sort()];
      if (field?.type === "checkbox") return [key, item === true];
      if (field?.type === "number" && item != null && item !== "")
        return [key, Number(item)];
      return [key, item ?? ""];
    });
  }
  return (
    JSON.stringify(comparable(before)) !== JSON.stringify(comparable(after))
  );
}
