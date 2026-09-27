"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RoleOption = {
  code: string;
  name: string;
};

type DeliveryAttempt = {
  id: string;
  status: string;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  attemptedAt: string;
};

type Invitation = {
  id: string;
  email: string;
  status: string;
  roleCode: string;
  lastSentAt: string | null;
  sendCount: number;
  lastError: string | null;
  provider: string | null;
  providerMessageId: string | null;
  attempts: DeliveryAttempt[];
};

type Props = {
  organisationId: string;
  roles: RoleOption[];
  invitations: Invitation[];
};

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function InvitationManager({
  organisationId,
  roles,
  invitations,
}: Props) {
  const router = useRouter();

  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState(
    roles[0]?.code ?? "",
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedEmail, setEditedEmail] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeInvitations = useMemo(
    () =>
      invitations.filter(
        (invitation) => invitation.status !== "cancelled",
      ),
    [invitations],
  );

  async function createInvitation(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setCreating(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/platform/organisations/${encodeURIComponent(
          organisationId,
        )}/invitations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            roleCode,
          }),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not create invitation.",
        );
      }

      setEmail("");
      setShowInvite(false);
      setMessage("Invitation sent.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create invitation.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function resend(invitationId: string) {
    setBusyId(invitationId);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/platform/invitations/${encodeURIComponent(
          invitationId,
        )}/resend`,
        {
          method: "POST",
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not resend invitation.",
        );
      }

      setMessage("Invitation sent.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not resend invitation.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(invitation: Invitation) {
    setEditingId(invitation.id);
    setEditedEmail(invitation.email);
    setMessage(null);
  }

  async function saveEmail(invitationId: string) {
    setBusyId(invitationId);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/platform/invitations/${encodeURIComponent(
          invitationId,
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: editedEmail,
          }),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not change invitation email.",
        );
      }

      setEditingId(null);
      setMessage("Email updated. Resend the invitation when ready.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not change invitation email.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function cancelInvitation(invitationId: string) {
    const confirmed = window.confirm(
      "Cancel this invitation? The invited user will no longer have pending access to this organisation.",
    );

    if (!confirmed) return;

    setBusyId(invitationId);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/platform/invitations/${encodeURIComponent(
          invitationId,
        )}`,
        {
          method: "DELETE",
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not cancel invitation.",
        );
      }

      setMessage("Invitation cancelled.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not cancel invitation.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      className="tt-card"
      style={{
        padding: 20,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0 }}>
          Invitations
        </h2>

        <button
          type="button"
          className="tt-button tt-button-primary"
          onClick={() => {
            setShowInvite((current) => !current);
            setMessage(null);
          }}
        >
          {showInvite ? "Close" : "Invite user"}
        </button>
      </div>

      {message ? (
        <div
          style={{
            marginBottom: 14,
            color:
              message.toLowerCase().includes("could not") ||
              message.toLowerCase().includes("error") ||
              message.toLowerCase().includes("already")
                ? "#fecaca"
                : "#cbd5e1",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      ) : null}

      {showInvite ? (
        <form
          onSubmit={createInvitation}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(180px, 1fr) auto",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <input
            className="tt-input"
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <select
            className="tt-select"
            required
            value={roleCode}
            onChange={(event) => setRoleCode(event.target.value)}
          >
            {roles.map((role) => (
              <option
                key={role.code}
                value={role.code}
              >
                {role.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="tt-button tt-button-primary"
            disabled={creating || !roleCode}
          >
            {creating ? "Sending..." : "Send invite"}
          </button>
        </form>
      ) : null}

      {activeInvitations.length === 0 ? (
        <div style={{ color: "#94a3b8" }}>
          No invitations.
        </div>
      ) : (
        <div>
          {activeInvitations.map((invitation) => {
            const pending = invitation.status === "pending";
            const busy = busyId === invitation.id;
            const editing = editingId === invitation.id;
            const expanded = expandedId === invitation.id;

            return (
              <div
                key={invitation.id}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid #1e293b",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(0, 2fr) 110px 100px minmax(280px, auto)",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <div>
                    {editing ? (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                        }}
                      >
                        <input
                          className="tt-input"
                          type="email"
                          value={editedEmail}
                          onChange={(event) =>
                            setEditedEmail(event.target.value)
                          }
                        />

                        <button
                          type="button"
                          className="tt-button"
                          disabled={busy}
                          onClick={() =>
                            void saveEmail(invitation.id)
                          }
                        >
                          Save
                        </button>

                        <button
                          type="button"
                          className="tt-button"
                          disabled={busy}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 700 }}>
                          {invitation.email}
                        </div>

                        <div
                          style={{
                            color: invitation.lastError
                              ? "#fecaca"
                              : "#64748b",
                            fontSize: 12,
                            marginTop: 4,
                          }}
                        >
                          {invitation.lastError
                            ? invitation.lastError
                            : `Last sent: ${formatDate(
                                invitation.lastSentAt,
                              )}`}
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <SmallLabel>Status</SmallLabel>
                    <div style={{ textTransform: "capitalize" }}>
                      {invitation.status}
                    </div>
                  </div>

                  <div>
                    <SmallLabel>Sent</SmallLabel>
                    <div>{invitation.sendCount}</div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="tt-button"
                      onClick={() =>
                        setExpandedId(
                          expanded ? null : invitation.id,
                        )
                      }
                    >
                      {expanded ? "Hide history" : "History"}
                    </button>

                    {pending ? (
                      <>
                        <button
                          type="button"
                          className="tt-button"
                          disabled={busy || editing}
                          onClick={() => startEdit(invitation)}
                        >
                          Change email
                        </button>

                        <button
                          type="button"
                          className="tt-button"
                          disabled={busy || editing}
                          onClick={() =>
                            void resend(invitation.id)
                          }
                        >
                          {busy ? "Working..." : "Resend"}
                        </button>

                        <button
                          type="button"
                          className="tt-button"
                          disabled={busy || editing}
                          onClick={() =>
                            void cancelInvitation(invitation.id)
                          }
                        >
                          Cancel invite
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      border: "1px solid #1e293b",
                      borderRadius: 10,
                      background: "rgba(2, 6, 23, 0.45)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        marginBottom: 10,
                      }}
                    >
                      Delivery history
                    </div>

                    {invitation.attempts.length === 0 ? (
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: 13,
                        }}
                      >
                        No recorded delivery attempts.
                      </div>
                    ) : (
                      invitation.attempts.map((attempt) => (
                        <div
                          key={attempt.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "140px 90px 110px minmax(0, 1fr)",
                            gap: 12,
                            padding: "8px 0",
                            borderBottom: "1px solid #172033",
                            fontSize: 12,
                          }}
                        >
                          <div>
                            {formatDate(attempt.attemptedAt)}
                          </div>

                          <div
                            style={{
                              textTransform: "capitalize",
                              color:
                                attempt.status === "sent"
                                  ? "#86efac"
                                  : "#fecaca",
                            }}
                          >
                            {attempt.status}
                          </div>

                          <div>{attempt.provider}</div>

                          <div
                            style={{
                              color: "#94a3b8",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {attempt.errorMessage ??
                              attempt.providerMessageId ??
                              "-"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SmallLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        color: "#64748b",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}
