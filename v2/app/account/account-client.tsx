"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowser } from "@/lib/supabase/browser";

type Props = {
  email: string;
};

type EmailChangeRequest = {
  id: string;
  current_email: string | null;
  new_email: string | null;
  status: string;
  send_count: number;
  last_sent_at: string | null;
  last_error: string | null;
  created_at: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AccountClient({
  email,
}: Props) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] =
    useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] =
    useState<string | null>(null);
  const [requests, setRequests] =
    useState<EmailChangeRequest[]>([]);

  async function loadRequests() {
    const response = await fetch(
      "/api/auth/email-change/pending",
      {
        cache: "no-store",
      },
    );

    if (!response.ok) return;

    const payload = await response.json();
    setRequests(payload.requests ?? []);
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  async function changePassword(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setPasswordMessage(null);

    if (password.length < 8) {
      setPasswordMessage(
        "Password must be at least 8 characters.",
      );
      return;
    }

    if (password !== confirmPassword) {
      setPasswordMessage("Passwords do not match.");
      return;
    }

    setPasswordBusy(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setPasswordMessage(error.message);
      setPasswordBusy(false);
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setPasswordMessage("Password updated.");
    setPasswordBusy(false);
  }

  async function requestEmailChange(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setEmailBusy(true);
    setEmailMessage(null);

    const response = await fetch(
      "/api/auth/email-change",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newEmail,
          password: currentPassword,
        }),
      },
    );

    const payload = await response.json();

    if (!response.ok) {
      setEmailMessage(
        payload.error ?? "Could not start email change.",
      );
      setEmailBusy(false);
      return;
    }

    setNewEmail("");
    setCurrentPassword("");
    setEmailMessage(
      "Confirmation emails sent. Complete both confirmations to change your email.",
    );
    setEmailBusy(false);

    await loadRequests();
  }

  async function resend(requestId: string) {
    setEmailBusy(true);
    setEmailMessage(null);

    const response = await fetch(
      "/api/auth/email-change/resend",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
        }),
      },
    );

    const payload = await response.json();

    if (!response.ok) {
      setEmailMessage(
        payload.error ?? "Could not resend confirmations.",
      );
      setEmailBusy(false);
      return;
    }

    setEmailMessage("Confirmation emails resent.");
    setEmailBusy(false);

    await loadRequests();
  }

  const pendingRequest =
    requests.find((request) => request.status === "pending") ??
    null;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="tt-card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Email</h2>

        <div
          style={{
            color: "#94a3b8",
            fontSize: 13,
            marginBottom: 18,
          }}
        >
          {email}
        </div>

        <form onSubmit={requestEmailChange}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <label>
              <div
                style={{
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                New email
              </div>

              <input
                className="tt-input"
                type="email"
                required
                value={newEmail}
                onChange={(event) =>
                  setNewEmail(event.target.value)
                }
              />
            </label>

            <label>
              <div
                style={{
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                Current password
              </div>

              <input
                className="tt-input"
                type="password"
                required
                value={currentPassword}
                onChange={(event) =>
                  setCurrentPassword(event.target.value)
                }
              />
            </label>
          </div>

          <button
            type="submit"
            className="tt-button tt-button-primary"
            disabled={emailBusy}
            style={{ marginTop: 14 }}
          >
            {emailBusy ? "Working..." : "Change email"}
          </button>
        </form>

        {emailMessage ? (
          <div
            style={{
              marginTop: 14,
              color: "#cbd5e1",
              fontSize: 13,
            }}
          >
            {emailMessage}
          </div>
        ) : null}

        {pendingRequest ? (
          <div
            style={{
              marginTop: 20,
              paddingTop: 18,
              borderTop: "1px solid #1e293b",
            }}
          >
            <div style={{ fontWeight: 700 }}>
              Pending change
            </div>

            <div
              style={{
                color: "#94a3b8",
                fontSize: 13,
                marginTop: 6,
              }}
            >
              {pendingRequest.new_email}
            </div>

            <div
              style={{
                color: "#64748b",
                fontSize: 12,
                marginTop: 4,
              }}
            >
              Sent {pendingRequest.send_count} time(s) ·{" "}
              {formatDate(pendingRequest.last_sent_at)}
            </div>

            {pendingRequest.last_error ? (
              <div
                style={{
                  color: "#fecaca",
                  fontSize: 12,
                  marginTop: 6,
                }}
              >
                {pendingRequest.last_error}
              </div>
            ) : null}

            <button
              type="button"
              className="tt-button"
              disabled={emailBusy}
              onClick={() =>
                void resend(pendingRequest.id)
              }
              style={{ marginTop: 12 }}
            >
              Resend confirmations
            </button>
          </div>
        ) : null}
      </section>

      <section className="tt-card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Password</h2>

        <form onSubmit={changePassword}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <label>
              <div
                style={{
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                New password
              </div>

              <input
                className="tt-input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
              />
            </label>

            <label>
              <div
                style={{
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                Confirm password
              </div>

              <input
                className="tt-input"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
              />
            </label>
          </div>

          <button
            type="submit"
            className="tt-button tt-button-primary"
            disabled={passwordBusy}
            style={{ marginTop: 14 }}
          >
            {passwordBusy ? "Updating..." : "Update password"}
          </button>
        </form>

        {passwordMessage ? (
          <div
            style={{
              marginTop: 14,
              color: "#cbd5e1",
              fontSize: 13,
            }}
          >
            {passwordMessage}
          </div>
        ) : null}
      </section>
    </div>
  );
}
