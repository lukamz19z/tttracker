"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);

    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    setSubmitting(false);
    setSent(true);
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
      <div
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
          Forgot password
        </h1>

        {sent ? (
          <>
            <p
              style={{
                color: "#cbd5e1",
                lineHeight: 1.6,
              }}
            >
              If an account exists for that email, instructions have been sent.
            </p>

            <Link
              href="/login"
              style={{
                display: "inline-block",
                marginTop: 10,
                color: "#7dd3fc",
              }}
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <label
              style={{
                display: "block",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  marginBottom: 6,
                  fontSize: 14,
                }}
              >
                Email
              </div>

              <input
                className="tt-input"
                type="email"
                required
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
              />
            </label>

            <button
              type="submit"
              className="tt-button tt-button-primary"
              disabled={submitting}
              style={{ width: "100%" }}
            >
              {submitting ? "Sending..." : "Send reset email"}
            </button>

            <Link
              href="/login"
              style={{
                display: "inline-block",
                marginTop: 18,
                color: "#7dd3fc",
                fontSize: 13,
              }}
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
