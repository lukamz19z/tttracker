"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { ProjectIdentifierConfig } from "@/lib/projects/types";

type Props = {
  organisationId: string;
  identifier: ProjectIdentifierConfig;
};

export default function ProjectsClient({
  organisationId,
  identifier,
}: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

  const [name, setName] = useState("");
  const [projectNumber, setProjectNumber] =
    useState("");
  const [description, setDescription] =
    useState("");

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
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organisationId,
          name,
          projectNumber:
            identifier.mode === "automatic"
              ? null
              : projectNumber,
          description,
        }),
      },
    );

    const payload = await response.json();

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
    <div style={{ marginBottom: 18 }}>
      <button
        type="button"
        className="tt-button tt-button-primary"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close" : "Create project"}
      </button>

      {open ? (
        <form
          onSubmit={submit}
          className="tt-card"
          style={{
            marginTop: 14,
            padding: 18,
            maxWidth: 650,
          }}
        >
          {message ? (
            <div
              style={{
                color: "#fecaca",
                marginBottom: 12,
              }}
            >
              {message}
            </div>
          ) : null}

          <label
            style={{
              display: "block",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                marginBottom: 6,
                fontSize: 13,
              }}
            >
              Project name *
            </div>

            <input
              className="tt-input"
              required
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
            />
          </label>

          {identifier.mode !== "automatic" ? (
            <label
              style={{
                display: "block",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                {identifier.label}
                {identifier.required ? " *" : ""}
              </div>

              <input
                className="tt-input"
                required={identifier.required}
                value={projectNumber}
                onChange={(event) =>
                  setProjectNumber(
                    event.target.value,
                  )
                }
              />

              {identifier.helpText ? (
                <div
                  style={{
                    marginTop: 5,
                    color: "#64748b",
                    fontSize: 11,
                  }}
                >
                  {identifier.helpText}
                </div>
              ) : null}
            </label>
          ) : (
            <div
              style={{
                color: "#94a3b8",
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              {identifier.label} will be generated
              automatically.
            </div>
          )}

          <label style={{ display: "block" }}>
            <div
              style={{
                marginBottom: 6,
                fontSize: 13,
              }}
            >
              Description
            </div>

            <textarea
              className="tt-input"
              rows={3}
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value,
                )
              }
            />
          </label>

          <button
            type="submit"
            className="tt-button tt-button-primary"
            disabled={busy}
            style={{ marginTop: 14 }}
          >
            {busy ? "Creating..." : "Create"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
