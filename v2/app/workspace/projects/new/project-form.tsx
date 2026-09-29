"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  Hash,
  MapPin,
  RadioTower,
} from "lucide-react";

import {
  Card,
  tt,
} from "@/components/ui/tt-ui";
import type { ProjectNumberConfig } from "@/lib/projects/numbering";
import { renderProjectNumberTemplate } from "@/lib/projects/numbering-client";

type Props = {
  organisationId: string;
  numberConfig: ProjectNumberConfig;
};

export default function ProjectForm({
  organisationId,
  numberConfig,
}: Props) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [clientName, setClientName] =
    useState("");
  const [clientCode, setClientCode] =
    useState("");
  const [location, setLocation] =
    useState("");
  const [projectYear, setProjectYear] =
    useState(
      String(new Date().getFullYear()),
    );
  const [projectNumber, setProjectNumber] =
    useState("");
  const [
    expectedTowerCount,
    setExpectedTowerCount,
  ] = useState("");
  const [description, setDescription] =
    useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

  const preview = useMemo(() => {
    if (
      numberConfig.mode !==
      "automatic"
    ) {
      return projectNumber.trim();
    }

    return renderProjectNumberTemplate({
      template: numberConfig.template,
      clientCode,
      year: Number(projectYear),
      sequence: numberConfig.nextNumber,
      prefix: numberConfig.prefix,
      padding: numberConfig.padding,
    });
  }, [
    clientCode,
    numberConfig,
    projectNumber,
    projectYear,
  ]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setBusy(true);
    setMessage(null);

    const response = await fetch(
      "/api/projects",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          organisationId,
          name,
          clientName,
          clientCode,
          location,
          projectYear:
            Number(projectYear),
          projectNumber:
            numberConfig.mode ===
            "automatic"
              ? null
              : projectNumber,
          expectedTowerCount:
            expectedTowerCount === ""
              ? null
              : Number(
                  expectedTowerCount,
                ),
          description,
          projectType:
            "transmission",
        }),
      },
    );

    const payload =
      await response.json();

    if (!response.ok) {
      setMessage(
        payload.error ??
          "Could not create project.",
      );
      setBusy(false);
      return;
    }

    router.push(
      `/workspace/projects/${payload.projectId}?organisation=${encodeURIComponent(
        organisationId,
      )}`,
    );
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className={tt.twoCol}
    >
      <div className={tt.stack}>
        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div className={tt.projectIcon}>
              <Building2 size={19} />
            </div>

            <div>
              <h2 className={tt.cardTitle}>
                Project details
              </h2>
              <p className={tt.cardDescription}>
                Only capture what is useful at setup. Everything else can be configured after creation.
              </p>
            </div>
          </div>

          <div className={tt.formGrid}>
            <Field
              label="Project name"
              required
              wide
            >
              <input
                className="tt-input"
                required
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="e.g. Transmission Upgrade Project"
              />
            </Field>

            <Field label="Client">
              <input
                className="tt-input"
                value={clientName}
                onChange={(event) =>
                  setClientName(
                    event.target.value,
                  )
                }
                placeholder="Client name"
              />
            </Field>

            <Field label="Client code">
              <div
                style={{
                  position: "relative",
                }}
              >
                <Hash
                  size={15}
                  style={{
                    position: "absolute",
                    left: 11,
                    top: "50%",
                    transform:
                      "translateY(-50%)",
                    color: "#64748b",
                  }}
                />
                <input
                  className="tt-input"
                  style={{
                    paddingLeft: 34,
                    textTransform:
                      "uppercase",
                  }}
                  value={clientCode}
                  onChange={(event) =>
                    setClientCode(
                      event.target.value.toUpperCase(),
                    )
                  }
                  placeholder="CLT"
                />
              </div>
            </Field>

            <Field label="Location">
              <div
                style={{
                  position: "relative",
                }}
              >
                <MapPin
                  size={15}
                  style={{
                    position: "absolute",
                    left: 11,
                    top: "50%",
                    transform:
                      "translateY(-50%)",
                    color: "#64748b",
                  }}
                />
                <input
                  className="tt-input"
                  style={{
                    paddingLeft: 34,
                  }}
                  value={location}
                  onChange={(event) =>
                    setLocation(
                      event.target.value,
                    )
                  }
                  placeholder="Project location"
                />
              </div>
            </Field>

            <Field label="Project year">
              <div
                style={{
                  position: "relative",
                }}
              >
                <CalendarDays
                  size={15}
                  style={{
                    position: "absolute",
                    left: 11,
                    top: "50%",
                    transform:
                      "translateY(-50%)",
                    color: "#64748b",
                  }}
                />
                <input
                  className="tt-input"
                  style={{
                    paddingLeft: 34,
                  }}
                  type="number"
                  min={2000}
                  max={2100}
                  value={projectYear}
                  onChange={(event) =>
                    setProjectYear(
                      event.target.value,
                    )
                  }
                />
              </div>
            </Field>

            <Field label="Expected towers">
              <div
                style={{
                  position: "relative",
                }}
              >
                <RadioTower
                  size={15}
                  style={{
                    position: "absolute",
                    left: 11,
                    top: "50%",
                    transform:
                      "translateY(-50%)",
                    color: "#64748b",
                  }}
                />
                <input
                  className="tt-input"
                  style={{
                    paddingLeft: 34,
                  }}
                  type="number"
                  min={0}
                  value={
                    expectedTowerCount
                  }
                  onChange={(event) =>
                    setExpectedTowerCount(
                      event.target.value,
                    )
                  }
                  placeholder="30"
                />
              </div>
            </Field>

            {numberConfig.mode !==
            "automatic" ? (
              <Field
                label={numberConfig.label}
                required={
                  numberConfig.required
                }
              >
                <input
                  className="tt-input"
                  required={
                    numberConfig.required
                  }
                  value={projectNumber}
                  onChange={(event) =>
                    setProjectNumber(
                      event.target.value,
                    )
                  }
                  placeholder="Project number"
                />
              </Field>
            ) : null}

            <Field label="Notes" wide>
              <textarea
                className="tt-input"
                rows={4}
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.target.value,
                  )
                }
              />
            </Field>
          </div>
        </Card>

        {message ? (
          <div
            className={`${tt.notice} ${tt.noticeError}`}
          >
            {message}
          </div>
        ) : null}

        <div className={tt.formActions}>
          <button
            className={`${tt.button} ${tt.buttonPrimary}`}
            disabled={busy}
          >
            {busy
              ? "Creating..."
              : "Create project"}
          </button>
        </div>
      </div>

      <div>
        <Card className={tt.preview}>
          <div className={tt.metricLabel}>
            Project preview
          </div>

          <div className={tt.previewNumber}>
            {preview ||
              "Project number pending"}
          </div>

          <h2 className={tt.previewTitle}>
            {name.trim() ||
              "New project"}
          </h2>

          <div className={tt.summaryList}>
            <Summary
              label="Client"
              value={
                clientName ||
                "Not set"
              }
            />
            <Summary
              label="Location"
              value={
                location ||
                "Not set"
              }
            />
            <Summary
              label="Towers"
              value={
                expectedTowerCount
                  ? `${expectedTowerCount} expected`
                  : "Import after creation"
              }
            />
          </div>

          <div
            className={`${tt.notice} ${tt.noticeInfo}`}
            style={{ marginTop: 18 }}
          >
            After creating the project, import the tower schedule directly into the tower register.
          </div>
        </Card>
      </div>
    </form>
  );
}

function Field({
  label,
  required = false,
  wide = false,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`${tt.field} ${
        wide ? tt.fieldWide : ""
      }`}
    >
      <span className={tt.label}>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={tt.summaryRow}>
      <span className={tt.summaryLabel}>
        {label}
      </span>
      <span className={tt.summaryValue}>
        {value}
      </span>
    </div>
  );
}
