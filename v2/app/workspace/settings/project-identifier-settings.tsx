"use client";

import {
  FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Hash } from "lucide-react";

import {
  Card,
  tt,
} from "@/components/ui/tt-ui";
import type { ProjectNumberConfig } from "@/lib/projects/numbering";

type Props = {
  organisationId: string;
  initial: ProjectNumberConfig;
};

const presets = [
  {
    label:
      "Standard project number",
    value:
      "PRJ-{YY}-{SEQ:3}",
    example: "PRJ-26-001",
  },
  {
    label:
      "Client + year + sequence",
    value: "{CLIENT}-{YY}-{SEQ:3}",
    example: "CLT-26-001",
  },
  {
    label:
      "Year + sequence",
    value: "{YYYY}-{SEQ:4}",
    example: "2026-0001",
  },
];

export default function ProjectIdentifierSettings({
  organisationId,
  initial,
}: Props) {
  const router = useRouter();

  const [mode, setMode] =
    useState(initial.mode);
  const [template, setTemplate] =
    useState(initial.template);
  const [busy, setBusy] =
    useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

  async function save(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setBusy(true);
    setMessage(null);

    const response = await fetch(
      "/api/settings/project-identifier",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          organisationId,
          mode,
          template,
          required:
            mode !== "optional",
          requireUnique: true,
          label: "Project number",
        }),
      },
    );

    const payload =
      await response.json();

    if (!response.ok) {
      setMessage(
        payload.error ??
          "Could not save project numbering.",
      );
      setBusy(false);
      return;
    }

    setMessage("Project numbering saved.");
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={save}>
      <Card>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div className={tt.projectIcon}>
            <Hash size={18} />
          </div>

          <div>
            <h2 className={tt.cardTitle}>
              Project numbering
            </h2>
            <p className={tt.cardDescription}>
              Project users should not need to understand numbering logic. Choose the behaviour here once for the organisation.
            </p>
          </div>
        </div>

        <div
          className={tt.segmented}
          style={{ marginTop: 20 }}
        >
          {[
            {
              key: "automatic",
              label: "Automatic",
              detail:
                "TTTracker generates the project number from the configured format.",
            },
            {
              key: "manual",
              label: "Manual",
              detail:
                "The person creating the project enters the project number.",
            },
            {
              key: "optional",
              label: "Optional",
              detail:
                "A project number can be entered when it is useful.",
            },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() =>
                setMode(
                  option.key as
                    | "automatic"
                    | "manual"
                    | "optional",
                )
              }
              className={`${tt.segmentButton} ${
                mode === option.key
                  ? tt.segmentActive
                  : ""
              }`}
            >
              <div className={tt.segmentTitle}>
                {option.label}
              </div>
              <div className={tt.segmentDetail}>
                {option.detail}
              </div>
            </button>
          ))}
        </div>

        {mode === "automatic" ? (
          <div style={{ marginTop: 24 }}>
            <div className={tt.label}>
              Number format
            </div>

            <div
              className={tt.mappingList}
              style={{ marginTop: 10 }}
            >
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() =>
                    setTemplate(
                      preset.value,
                    )
                  }
                  className={`${tt.segmentButton} ${
                    template === preset.value
                      ? tt.segmentActive
                      : ""
                  }`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                      "space-between",
                    gap: 18,
                  }}
                >
                  <span>
                    <span
                      className={tt.segmentTitle}
                      style={{ display: "block" }}
                    >
                      {preset.label}
                    </span>
                    <span
                      className={tt.segmentDetail}
                      style={{ display: "block" }}
                    >
                      Example: {preset.example}
                    </span>
                  </span>

                  <span
                    style={{
                      color: "#64748b",
                      fontSize: 11,
                      fontFamily: "monospace",
                    }}
                  >
                    {preset.value}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {message ? (
          <div
            className={`${tt.notice} ${
              message.includes("saved")
                ? tt.noticeInfo
                : tt.noticeError
            }`}
            style={{ marginTop: 18 }}
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
              ? "Saving..."
              : "Save numbering"}
          </button>
        </div>
      </Card>
    </form>
  );
}
