"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const invitationId = searchParams.get("invitation");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function completeOnboarding(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);

    if (!invitationId) {
      setError("Invitation reference is missing.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    const { error: passwordError } =
      await supabase.auth.updateUser({
        password,
      });

    if (passwordError) {
      setError(passwordError.message);
      setSubmitting(false);
      return;
    }

    const response = await fetch(
      `/api/invitations/${encodeURIComponent(invitationId)}/accept`,
      {
        method: "POST",
      },
    );

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Could not complete onboarding.");
      setSubmitting(false);
      return;
    }

    router.replace("/");
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
        onSubmit={completeOnboarding}
        className="tt-card"
        style={{
          width: "100%",
          maxWidth: 430,
          padding: 28,
        }}
      >
        <div
          style={{
            color: "#7dd3fc",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          TTTracker
        </div>

        <h1 style={{ marginBottom: 20 }}>
          Set up account
        </h1>

        {error ? (
          <div
            style={{
              marginBottom: 16,
              color: "#fecaca",
            }}
          >
            {error}
          </div>
        ) : null}

        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontSize: 14 }}>
            Password
          </div>

          <input
            className="tt-input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label style={{ display: "block", marginBottom: 20 }}>
          <div style={{ marginBottom: 6, fontSize: 14 }}>
            Confirm password
          </div>

          <input
            className="tt-input"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        <button
          type="submit"
          className="tt-button tt-button-primary"
          disabled={submitting}
          style={{ width: "100%" }}
        >
          {submitting ? "Setting up..." : "Continue"}
        </button>
      </form>
    </main>
  );
}
