"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  OrganisationSetupStep,
} from "@/lib/setup/types";

type Props = {
  organisationId: string;
  organisationName: string;
  initialStepKey: string | null;
  steps: OrganisationSetupStep[];
  completedRequired: number;
  totalRequired: number;
};

function getInitialValues(
  step: OrganisationSetupStep,
) {
  return { ...step.values };
}

export default function SetupClient({
  organisationId,
  organisationName,
  initialStepKey,
  steps,
  completedRequired,
  totalRequired,
}: Props) {
  const router = useRouter();

  const firstOpen =
    steps.find(
      (step) =>
        step.stepKey === initialStepKey,
    ) ??
    steps.find(
      (step) =>
        step.status !== "completed" &&
        step.status !== "skipped",
    ) ??
    steps[0];

  const [selectedKey, setSelectedKey] =
    useState<string | null>(
      firstOpen?.stepKey ?? null,
    );

  const selected = useMemo(
    () =>
      steps.find(
        (step) =>
          step.stepKey === selectedKey,
      ) ?? null,
    [selectedKey, steps],
  );

  const [valuesByStep, setValuesByStep] = useState<
    Record<string, Record<string, unknown>>
  >(() =>
    Object.fromEntries(
      steps.map((step) => [
        step.stepKey,
        getInitialValues(step),
      ]),
    ),
  );

  const [busy, setBusy] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string>
  >({});

  function updateValue(
    stepKey: string,
    fieldKey: string,
    value: unknown,
  ) {
    setValuesByStep((current) => ({
      ...current,
      [stepKey]: {
        ...(current[stepKey] ?? {}),
        [fieldKey]: value,
      },
    }));
  }

  function chooseNext(currentKey: string) {
    const currentIndex = steps.findIndex(
      (step) => step.stepKey === currentKey,
    );

    const next =
      steps
        .slice(currentIndex + 1)
        .find(
          (step) =>
            step.status !== "completed" &&
            step.status !== "skipped",
        ) ??
      steps
        .slice(0, currentIndex)
        .find(
          (step) =>
            step.status !== "completed" &&
            step.status !== "skipped",
        );

    return next?.stepKey ?? null;
  }

  async function save(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selected) return;

    setBusy(true);
    setMessage(null);
    setFieldErrors({});

    const response = await fetch(
      "/api/setup/step",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organisationId,
          stepKey: selected.stepKey,
          values:
            valuesByStep[selected.stepKey] ?? {},
        }),
      },
    );

    const payload = await response.json();

    if (!response.ok) {
      setMessage(
        payload.error ?? "Could not save this step.",
      );
      setFieldErrors(payload.fields ?? {});
      setBusy(false);
      return;
    }

    if (payload.status === "completed") {
      router.replace(
        `/workspace?organisation=${encodeURIComponent(
          organisationId,
        )}`,
      );
      router.refresh();
      return;
    }

    setMessage("Saved.");
    setBusy(false);

    const nextKey =
      payload.nextStepKey ??
      chooseNext(selected.stepKey);

    if (nextKey) {
      setSelectedKey(nextKey);
    }

    router.refresh();
  }

  async function skip() {
    if (!selected || selected.isRequired) return;

    setBusy(true);
    setMessage(null);

    const response = await fetch(
      "/api/setup/skip",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organisationId,
          stepKey: selected.stepKey,
        }),
      },
    );

    const payload = await response.json();

    if (!response.ok) {
      setMessage(
        payload.error ?? "Could not skip this step.",
      );
      setBusy(false);
      return;
    }

    if (payload.status === "completed") {
      router.replace(
        `/workspace?organisation=${encodeURIComponent(
          organisationId,
        )}`,
      );
      router.refresh();
      return;
    }

    const nextKey =
      payload.nextStepKey ??
      chooseNext(selected.stepKey);

    setBusy(false);

    if (nextKey) {
      setSelectedKey(nextKey);
    }

    router.refresh();
  }

  if (!selected) {
    return (
      <div className="tt-card" style={{ padding: 24 }}>
        No setup steps are currently required.
      </div>
    );
  }

  const values =
    valuesByStep[selected.stepKey] ?? {};

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px minmax(0, 1fr)",
        gap: 20,
      }}
    >
      <aside
        className="tt-card"
        style={{
          padding: 16,
          alignSelf: "start",
        }}
      >
        <div
          style={{
            color: "#64748b",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {organisationName}
        </div>

        <div
          style={{
            marginTop: 8,
            marginBottom: 18,
            fontWeight: 800,
          }}
        >
          Setup
        </div>

        <div
          style={{
            color: "#94a3b8",
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          {completedRequired} of {totalRequired} required steps complete
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {steps.map((step, index) => {
            const active =
              step.stepKey === selected.stepKey;

            const done =
              step.status === "completed" ||
              step.status === "skipped";

            return (
              <button
                key={step.stepKey}
                type="button"
                onClick={() => {
                  setSelectedKey(step.stepKey);
                  setMessage(null);
                  setFieldErrors({});
                }}
                style={{
                  border: active
                    ? "1px solid #38bdf8"
                    : "1px solid #1e293b",
                  borderRadius: 9,
                  background: active
                    ? "rgba(14, 165, 233, 0.08)"
                    : "transparent",
                  color: "#e2e8f0",
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      color: done
                        ? "#86efac"
                        : "#64748b",
                      fontSize: 12,
                    }}
                  >
                    {done ? "✓" : index + 1}
                  </span>

                  <span>{step.name}</span>
                </div>

                {step.isRequired ? (
                  <div
                    style={{
                      marginTop: 4,
                      marginLeft: 20,
                      fontSize: 10,
                      color: "#64748b",
                    }}
                  >
                    Required
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>

      <section
        className="tt-card"
        style={{
          padding: 24,
          minHeight: 420,
        }}
      >
        <h1 style={{ marginTop: 0 }}>
          {selected.name}
        </h1>

        {selected.description ? (
          <p
            style={{
              color: "#94a3b8",
              lineHeight: 1.6,
              marginBottom: 24,
            }}
          >
            {selected.description}
          </p>
        ) : null}

        {message ? (
          <div
            style={{
              marginBottom: 16,
              color: "#cbd5e1",
              fontSize: 13,
            }}
          >
            {message}
          </div>
        ) : null}

        <form onSubmit={save}>
          <div style={{ display: "grid", gap: 16 }}>
            {selected.formSchema.fields.map((field) => {
              const value = values[field.key];

              return (
                <label key={field.key}>
                  {field.type !== "checkbox" ? (
                    <div
                      style={{
                        marginBottom: 6,
                        fontSize: 13,
                      }}
                    >
                      {field.label}
                      {field.required ? " *" : ""}
                    </div>
                  ) : null}

                  {field.type === "textarea" ? (
                    <textarea
                      className="tt-input"
                      rows={4}
                      placeholder={field.placeholder}
                      value={String(value ?? "")}
                      onChange={(event) =>
                        updateValue(
                          selected.stepKey,
                          field.key,
                          event.target.value,
                        )
                      }
                    />
                  ) : field.type === "select" ? (
                    <select
                      className="tt-select"
                      required={field.required}
                      value={String(value ?? "")}
                      onChange={(event) =>
                        updateValue(
                          selected.stepKey,
                          field.key,
                          event.target.value,
                        )
                      }
                    >
                      <option value="">
                        Select...
                      </option>

                      {(field.options ?? []).map(
                        (option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) =>
                          updateValue(
                            selected.stepKey,
                            field.key,
                            event.target.checked,
                          )
                        }
                      />

                      <span
                        style={{
                          fontSize: 13,
                        }}
                      >
                        {field.label}
                      </span>
                    </div>
                  ) : (
                    <input
                      className="tt-input"
                      type={
                        field.type === "number"
                          ? "number"
                          : "text"
                      }
                      required={field.required}
                      placeholder={field.placeholder}
                      value={String(value ?? "")}
                      onChange={(event) =>
                        updateValue(
                          selected.stepKey,
                          field.key,
                          event.target.value,
                        )
                      }
                    />
                  )}

                  {field.helpText ? (
                    <div
                      style={{
                        marginTop: 5,
                        color: "#64748b",
                        fontSize: 11,
                      }}
                    >
                      {field.helpText}
                    </div>
                  ) : null}

                  {fieldErrors[field.key] ? (
                    <div
                      style={{
                        marginTop: 5,
                        color: "#fecaca",
                        fontSize: 11,
                      }}
                    >
                      {fieldErrors[field.key]}
                    </div>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 26,
            }}
          >
            <button
              type="submit"
              className="tt-button tt-button-primary"
              disabled={busy}
            >
              {busy ? "Saving..." : "Save & continue"}
            </button>

            {!selected.isRequired ? (
              <button
                type="button"
                className="tt-button"
                disabled={busy}
                onClick={() => void skip()}
              >
                Skip for now
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
