"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    const { error: updateError } =
      await supabase.auth.updateUser({
        password,
      });

    if (updateError) {
      setError(
        "This reset link may have expired. Request a new password reset email.",
      );
      setSubmitting(false);
      return;
    }

    router.replace("/account?password=updated");
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
          Reset password
        </h1>

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

        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontSize: 14 }}>
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
            onChange={(event) =>
              setConfirmPassword(event.target.value)
            }
          />
        </label>

        <button
          type="submit"
          className="tt-button tt-button-primary"
          disabled={submitting}
          style={{ width: "100%" }}
        >
          {submitting ? "Updating..." : "Update password"}
        </button>
      </form>
    </main>
  );
}
