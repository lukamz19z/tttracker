"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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

export default function TowersClient({
  organisationId,
  projectId,
  towerTypes,
}: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

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

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setBusy(true);
    setMessage(null);

    const response = await fetch(
      `/api/projects/${encodeURIComponent(
        projectId,
      )}/towers`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        }),
      },
    );

    const payload = await response.json();

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
    <div style={{ marginBottom: 18 }}>
      <button
        type="button"
        className="tt-button tt-button-primary"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close" : "Add tower"}
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
              Tower identifier *
            </div>

            <input
              className="tt-input"
              required
              value={towerIdentifier}
              onChange={(event) =>
                setTowerIdentifier(
                  event.target.value,
                )
              }
            />
          </label>

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
              Tower type
            </div>

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
                Create / enter new type
              </option>

              {towerTypes.map((type) => (
                <option
                  key={type.id}
                  value={type.id}
                >
                  {type.name}
                  {type.typeCode
                    ? ` (${type.typeCode})`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          {!towerTypeId ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "2fr 1fr",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <input
                className="tt-input"
                placeholder="New tower type name"
                value={newTowerTypeName}
                onChange={(event) =>
                  setNewTowerTypeName(
                    event.target.value,
                  )
                }
              />

              <input
                className="tt-input"
                placeholder="Type code"
                value={newTowerTypeCode}
                onChange={(event) =>
                  setNewTowerTypeCode(
                    event.target.value,
                  )
                }
              />
            </div>
          ) : null}

          <label>
            <div
              style={{
                marginBottom: 6,
                fontSize: 13,
              }}
            >
              Sequence
            </div>

            <input
              className="tt-input"
              type="number"
              value={sequenceNumber}
              onChange={(event) =>
                setSequenceNumber(
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
            {busy ? "Creating..." : "Add tower"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
