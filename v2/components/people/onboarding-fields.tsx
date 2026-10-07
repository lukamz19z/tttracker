"use client";
import { PeopleDateInput } from "./people-ui";
import { useState } from "react";
import { CheckCircle2, LockKeyhole, Upload } from "lucide-react";
import {
  fieldApplies,
  type OnboardingDefinition,
  type OnboardingField,
} from "@/lib/people/onboarding-types";
import styles from "./people.module.css";
export function OnboardingFields({
  definition,
  answers,
  onChange,
  onUpload,
  onDocuments,
  readOnly = false,
  permissions,
  training = {},
}: {
  definition: OnboardingDefinition;
  answers: Record<string, unknown>;
  onChange?: (key: string, value: unknown) => void;
  onUpload?: (key: string, side: string, file: File) => Promise<void>;
  onDocuments?: (key: string) => void;
  readOnly?: boolean;
  permissions?: Record<string, boolean>;
  training?: Record<string, Record<string, unknown>>;
}) {
  const [section, setSection] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const current = definition?.sections?.[section];
  function render(field: OnboardingField) {
    const answer = answers[field.key];
    const blocked = field.classification === "confidential";
    const privateDenied =
      readOnly &&
      field.classification === "private" &&
      !permissions?.[`people.private.${field.domain}.view`];
    if (blocked)
      return (
        <p className={styles.notice}>
          <LockKeyhole size={16} /> Confidential collection unavailable. Secure
          key infrastructure must be configured and verified.
        </p>
      );
    if (privateDenied)
      return <p className={styles.muted}>Restricted private information.</p>;
    const change = (v: unknown) => onChange?.(field.key, v);
    const upload = (side: string) => (
      <label className={styles.field} key={side}>
        <Upload size={16} />
        {side === "single" ? "Evidence" : `${side} document`} · max 10 MB
        <input
          disabled={readOnly || !!busy}
          type="file"
          multiple={side === "single"}
          accept="application/pdf,image/jpeg,image/png"
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length || !onUpload) return;
            setBusy(field.key);
            setError("");
            try {
              for (const file of files) await onUpload(field.key, side, file);
            } catch {
              setError("Upload failed. Check the file and retry.");
            } finally {
              setBusy("");
            }
          }}
        />
        <small>Choose a file or take a photo using your device.</small>
      </label>
    );
    if (field.type === "document_upload")
      return (
        <>
          {!readOnly && upload("single")}
          <button
            type="button"
            className="tt-button"
            onClick={() => onDocuments?.(field.key)}
          >
            View uploaded evidence
          </button>
        </>
      );
    if (field.type === "training_request") {
      const config = training[field.training_type_id ?? ""] ?? {};
      const detail = (answer ?? {}) as Record<string, unknown>;
      const set = (key: string, val: unknown) =>
        change({ ...detail, [key]: val });
      const configurations = [
        config,
        ...((config.linked_types ?? []) as Record<string, unknown>[]).filter(
          (c) =>
            ((detail.linked_type_ids ?? []) as string[]).includes(String(c.id)),
        ),
      ];
      const sides = [
        ...new Set(
          configurations.flatMap((c) =>
            c.document_requirement === "none"
              ? []
              : c.document_requirement === "front_back"
                ? ["front", "back"]
                : ["single"],
          ),
        ),
      ];
      return (
        <>
          <div className={styles.fields}>
            <label className={styles.field}>
              Issue date
              <PeopleDateInput
                disabled={readOnly}
                value={String(detail.issue_date ?? "")}
                onChange={(next) => set("issue_date", next)}
              />
            </label>
            {configurations.some((c) => c.validity_mode === "manual") && (
              <label className={styles.field}>
                Expiry date
                <PeopleDateInput
                  disabled={readOnly}
                  value={String(detail.expiry_date ?? "")}
                  onChange={(next) => set("expiry_date", next)}
                />
              </label>
            )}
            <label className={styles.field}>
              Licence / certificate number
              <input
                className="tt-input"
                disabled={readOnly}
                value={String(detail.certificate_number ?? "")}
                onChange={(e) => set("certificate_number", e.target.value)}
              />
            </label>
          </div>
          {config.validity_mode === "automatic" && (
            <small>
              Expiry calculated from issue date using configured validity.
            </small>
          )}
          {((config.linked_types ?? []) as { id: string; name: string }[]).map(
            (link) => (
              <label key={link.id}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={(
                    (detail.linked_type_ids ?? []) as string[]
                  ).includes(link.id)}
                  onChange={(e) =>
                    set(
                      "linked_type_ids",
                      e.target.checked
                        ? [
                            ...((detail.linked_type_ids ?? []) as string[]),
                            link.id,
                          ]
                        : ((detail.linked_type_ids ?? []) as string[]).filter(
                            (id) => id !== link.id,
                          ),
                    )
                  }
                />{" "}
                Also completed {link.name}
              </label>
            ),
          )}
          {!readOnly && (
            <div className={styles.fields}>{sides.map(upload)}</div>
          )}
          <button
            type="button"
            className="tt-button"
            onClick={() => onDocuments?.(field.key)}
          >
            View uploaded evidence
          </button>
        </>
      );
    }
    if (field.type === "boolean" || field.type === "acknowledgement")
      return (
        <label>
          <input
            type="checkbox"
            checked={answer === true}
            disabled={readOnly}
            onChange={(e) => change(e.target.checked)}
          />
          {field.type === "acknowledgement" ? "I acknowledge" : "Yes"}
        </label>
      );
    if (field.type === "single_select")
      return (
        <select
          className="tt-input"
          value={String(answer ?? "")}
          disabled={readOnly}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">Choose...</option>
          {field.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    if (field.type === "multi_select")
      return (
        <div className={styles.actions}>
          {field.options?.map((o) => (
            <label key={o}>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={Array.isArray(answer) && answer.includes(o)}
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? [...(Array.isArray(answer) ? answer : []), o]
                      : (Array.isArray(answer) ? answer : []).filter(
                          (x) => x !== o,
                        ),
                  )
                }
              />
              {o}
            </label>
          ))}
        </div>
      );
    if (field.type === "long_text" || field.type === "address")
      return (
        <textarea
          className="tt-input"
          rows={3}
          value={String(answer ?? "")}
          disabled={readOnly}
          onChange={(e) => change(e.target.value)}
        />
      );
    if (field.type === "date")
      return (
        <PeopleDateInput
          value={String(answer ?? "")}
          disabled={readOnly}
          onChange={change}
        />
      );
    return (
      <input
        className="tt-input"
        disabled={readOnly}
        value={String(answer ?? "")}
        type={
          field.type === "phone"
            ? "tel"
            : ["email", "date", "number"].includes(field.type)
              ? field.type
              : "text"
        }
        onChange={(e) =>
          change(
            field.type === "number"
              ? e.target.value === ""
                ? ""
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    );
  }
  return (
    <div className={styles.panel}>
      <nav className={styles.nav} aria-label="Onboarding sections">
        {definition?.sections?.map((s, i) => (
          <button
            type="button"
            key={i}
            className="tt-button"
            aria-current={section === i ? "step" : undefined}
            onClick={() => setSection(i)}
          >
            {i + 1}. {s.name}
            {s.fields
              .filter((f) => f.required)
              .every(
                (f) => answers[f.key] != null && answers[f.key] !== "",
              ) && <CheckCircle2 size={14} />}
          </button>
        ))}
      </nav>
      <h3>{current?.name}</h3>
      <div className={styles.panel}>
        {current?.fields
          .filter((f) => fieldApplies(f, answers))
          .map((f) => (
            <div key={f.key} className={styles.field}>
              <strong>
                {f.label}
                {f.required ? " *" : ""}
              </strong>
              {f.help && <small>{f.help}</small>}
              {f.classification === "private" && (
                <small>
                  Private information · only authorised organisation personnel
                  can view this.
                </small>
              )}
              {render(f)}
            </div>
          ))}
      </div>
      {busy && <p role="status">Uploading evidence...</p>}
      {error && <p role="alert">{error}</p>}
      <div className={styles.toolbar}>
        <button
          type="button"
          className="tt-button"
          disabled={section === 0}
          onClick={() => setSection(section - 1)}
        >
          Previous section
        </button>
        <button
          type="button"
          className="tt-button"
          disabled={section >= definition.sections.length - 1}
          onClick={() => setSection(section + 1)}
        >
          Next section
        </button>
      </div>
    </div>
  );
}
