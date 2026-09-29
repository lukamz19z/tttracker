"use client";

import {
  FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  Card,
  tt,
} from "@/components/ui/tt-ui";

type TowerType = {
  id: string;
  name: string;
  typeCode: string | null;
};

type Props = {
  organisationId: string;
  projectId: string;
  towerTypes: TowerType[];
};

export default function NewTowerClient({
  organisationId,
  projectId,
  towerTypes,
}: Props) {
  const router = useRouter();

  const [towerIdentifier, setTowerIdentifier] =
    useState("");
  const [towerTypeId, setTowerTypeId] =
    useState("");
  const [newTowerTypeName, setNewTowerTypeName] =
    useState("");
  const [newTowerTypeCode, setNewTowerTypeCode] =
    useState("");
  const [sequenceNumber, setSequenceNumber] =
    useState("");
  const [line, setLine] = useState("");
  const [towerWeight, setTowerWeight] =
    useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setBusy(true);
    setMessage(null);

    const response = await fetch(
      `/api/projects/${projectId}/towers`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          organisationId,
          towerIdentifier,
          towerTypeId:
            towerTypeId || null,
          newTowerTypeName:
            towerTypeId
              ? null
              : newTowerTypeName,
          newTowerTypeCode:
            towerTypeId
              ? null
              : newTowerTypeCode,
          sequenceNumber:
            sequenceNumber || null,
          line,
          towerWeight:
            towerWeight || null,
        }),
      },
    );

    const payload =
      await response.json();

    if (!response.ok) {
      setMessage(
        payload.error ??
          "Could not create tower.",
      );
      setBusy(false);
      return;
    }

    router.push(
      `/workspace/projects/${projectId}/towers/${payload.towerId}?organisation=${encodeURIComponent(
        organisationId,
      )}`,
    );
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <div className={tt.formGrid}>
          <Field
            label="Tower identifier"
            required
          >
            <input
              className="tt-input"
              required
              value={towerIdentifier}
              onChange={(event) =>
                setTowerIdentifier(
                  event.target.value,
                )
              }
              placeholder="e.g. T18"
            />
          </Field>

          <Field label="Line / circuit">
            <input
              className="tt-input"
              value={line}
              onChange={(event) =>
                setLine(event.target.value)
              }
            />
          </Field>

          <Field label="Tower type">
            <select
              className="tt-select"
              value={towerTypeId}
              onChange={(event) =>
                setTowerTypeId(
                  event.target.value,
                )
              }
            >
              <option value="">
                New tower type
              </option>

              {towerTypes.map((type) => (
                <option
                  key={type.id}
                  value={type.id}
                >
                  {type.typeCode ||
                    type.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Sequence">
            <input
              className="tt-input"
              type="number"
              min={1}
              value={sequenceNumber}
              onChange={(event) =>
                setSequenceNumber(
                  event.target.value,
                )
              }
            />
          </Field>

          {!towerTypeId ? (
            <>
              <Field label="New type name">
                <input
                  className="tt-input"
                  value={newTowerTypeName}
                  onChange={(event) =>
                    setNewTowerTypeName(
                      event.target.value,
                    )
                  }
                />
              </Field>

              <Field label="Type code">
                <input
                  className="tt-input"
                  value={newTowerTypeCode}
                  onChange={(event) =>
                    setNewTowerTypeCode(
                      event.target.value,
                    )
                  }
                />
              </Field>
            </>
          ) : null}

          <Field label="Tower weight (t)">
            <input
              className="tt-input"
              type="number"
              step="0.001"
              min={0}
              value={towerWeight}
              onChange={(event) =>
                setTowerWeight(
                  event.target.value,
                )
              }
            />
          </Field>
        </div>

        {message ? (
          <div
            className={`${tt.notice} ${tt.noticeError}`}
            style={{ marginTop: 16 }}
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
              : "Add tower"}
          </button>
        </div>
      </Card>
    </form>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={tt.field}>
      <span className={tt.label}>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
