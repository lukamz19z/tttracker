"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setError(null);

    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      setError("Email or password is incorrect.");
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
        onSubmit={signIn}
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
          Sign in
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

        <label
          style={{
            display: "block",
            marginBottom: 16,
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
            autoComplete="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
          />
        </label>

        <label
          style={{
            display: "block",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              marginBottom: 6,
              fontSize: 14,
            }}
          >
            Password
          </div>

          <input
            className="tt-input"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
          />
        </label>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 20,
          }}
        >
          <Link
            href="/forgot-password"
            style={{
              color: "#7dd3fc",
              fontSize: 13,
            }}
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          className="tt-button tt-button-primary"
          disabled={submitting}
          style={{ width: "100%" }}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
