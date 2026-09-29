"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(
    () => createSupabaseBrowser(),
    [],
  );

  const invitationId =
    searchParams.get("invitation") ?? "";

  const [password, setPassword] =
    useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(null);

    if (!invitationId) {
      setError("Invitation information is missing.");
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must be at least 8 characters.",
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    const { error: passwordError } =
      await supabase.auth.updateUser({
        password,
      });

    if (passwordError) {
      setError(
        "The setup link may have expired. Ask for the invitation to be resent.",
      );
      setBusy(false);
      return;
    }

    const response = await fetch(
      `/api/invitations/${encodeURIComponent(
        invitationId,
      )}/accept`,
      {
        method: "POST",
      },
    );

    const payload = await response.json();

    if (!response.ok) {
      setError(
        payload.error ??
          "Could not accept invitation.",
      );
      setBusy(false);
      return;
    }

    router.replace(
      `/setup?organisation=${encodeURIComponent(
        payload.organisationId,
      )}`,
    );
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        className="tt-card"
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 28,
        }}
      >
        <div
          style={{
            color: "#7dd3fc",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          TTTracker
        </div>

        <h1 style={{ marginBottom: 8 }}>
          Set up your account
        </h1>

        <p
          style={{
            color: "#94a3b8",
            lineHeight: 1.6,
            marginTop: 0,
            marginBottom: 22,
          }}
        >
          Create your password to continue.
        </p>

        {error ? (
          <div
            style={{
              color: "#fecaca",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        ) : null}

        <label
          style={{
            display: "block",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              marginBottom: 6,
              fontSize: 13,
            }}
          >
            Password
          </div>

          <input
            className="tt-input"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
          />
        </label>

        <label
          style={{
            display: "block",
            marginBottom: 20,
          }}
        >
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
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(
                event.target.value,
              )
            }
          />
        </label>

        <button
          type="submit"
          className="tt-button tt-button-primary"
          disabled={busy}
          style={{ width: "100%" }}
        >
          {busy
            ? "Setting up..."
            : "Continue"}
        </button>
      </form>
    </main>
  );
}
