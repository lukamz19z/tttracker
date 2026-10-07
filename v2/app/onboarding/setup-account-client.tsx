"use client";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  PASSWORD_POLICY,
  passwordRequirement,
  validateSetupPassword,
} from "@/lib/auth/password-policy";
import { establishSetupSession } from "@/lib/auth/setup-session";
import { setupError, type SetupError } from "@/lib/auth/setup-errors";

type Readiness = "loading" | "ready" | "blocked" | "complete";
export default function SetupAccountClient({
  supportEmail,
}: {
  supportEmail: string | null;
}) {
  const router = useRouter();
  const invitationId = useSearchParams().get("invitation") ?? "";
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [readiness, setReadiness] = useState<Readiness>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SetupError | null>(null);
  const sessionReady = useRef<Promise<SetupError | null> | null>(null);
  const submission = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        if (!invitationId) {
          if (!cancelled) {
            setError(setupError("INVALID_TOKEN"));
            setReadiness("blocked");
          }
          return;
        }
        sessionReady.current ??= establishSetupSession(
          supabase,
          window.location.href,
          (url) => window.history.replaceState(window.history.state, "", url),
        );
        const sessionError = await sessionReady.current;
        if (cancelled) return;
        if (sessionError) {
          setError(sessionError);
          setReadiness("blocked");
          return;
        }
        const response = await fetch(
          `/api/invitations/${encodeURIComponent(invitationId)}/setup`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError({
            code: payload.code,
            message: payload.error,
            retryable: payload.retryable === true,
          });
          setReadiness("blocked");
          return;
        }
        setReadiness(payload.status === "accepted" ? "complete" : "ready");
      } catch {
        if (!cancelled) {
          setError(setupError("SETUP_RETRY_REQUIRED"));
          setReadiness("blocked");
        }
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [supabase, invitationId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current || readiness !== "ready") return;
    const validation = validateSetupPassword(password, confirmation);
    if (validation) {
      setError({ ...validation, retryable: true });
      return;
    }
    submission.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/invitations/${encodeURIComponent(invitationId)}/setup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, confirmation }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        setError({
          code: payload.code,
          message: payload.error,
          retryable: payload.retryable === true,
        });
        if (payload.code === "INVITATION_ALREADY_USED")
          setReadiness("complete");
        else if (
          [
            "INVITATION_EXPIRED",
            "INVITATION_REVOKED",
            "INVALID_TOKEN",
            "AUTH_SESSION_MISSING",
          ].includes(payload.code)
        )
          setReadiness("blocked");
        return;
      }
      setReadiness("complete");
      router.replace(
        `/setup?organisation=${encodeURIComponent(payload.organisationId)}`,
      );
      router.refresh();
    } catch {
      setError(setupError("SETUP_RETRY_REQUIRED"));
    } finally {
      submission.current = false;
      setBusy(false);
    }
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
      <section
        className="tt-card"
        style={{ width: "100%", maxWidth: 440, padding: 28 }}
      >
        <div style={{ color: "#7dd3fc", fontWeight: 800, fontSize: 14 }}>
          TTTracker
        </div>
        <h1 style={{ margin: "14px 0 8px" }}>
          {readiness === "complete"
            ? "Account setup is complete"
            : "Set up your account"}
        </h1>
        {readiness === "loading" ? (
          <p role="status">Preparing your secure setup session...</p>
        ) : readiness === "complete" ? (
          <>
            <p>Your account has already been set up.</p>
            <Link className="tt-button tt-button-primary" href="/login">
              Sign in
            </Link>
          </>
        ) : (
          <>
            {error && (
              <p role="alert" style={{ color: "#fecaca", fontSize: 14 }}>
                {error.message}
              </p>
            )}
            {readiness === "ready" ? (
              <form onSubmit={submit} noValidate>
                <p style={{ color: "#94a3b8", marginBottom: 20 }}>
                  Create your password to continue.
                </p>
                <label style={{ display: "block", marginBottom: 16 }}>
                  Password
                  <input
                    className="tt-input"
                    type="password"
                    required
                    minLength={PASSWORD_POLICY.minimumLength}
                    autoComplete="new-password"
                    aria-describedby="password-requirements"
                    disabled={busy}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <p
                  id="password-requirements"
                  style={{
                    color: "#94a3b8",
                    fontSize: 12,
                    margin: "-8px 0 16px",
                  }}
                >
                  {passwordRequirement()}
                </p>
                <label style={{ display: "block", marginBottom: 20 }}>
                  Confirm password
                  <input
                    className="tt-input"
                    type="password"
                    required
                    autoComplete="new-password"
                    disabled={busy}
                    value={confirmation}
                    onChange={(event) => {
                      setConfirmation(event.target.value);
                      setError(null);
                    }}
                  />
                </label>
                <button
                  className="tt-button tt-button-primary"
                  type="submit"
                  disabled={busy}
                  style={{ width: "100%" }}
                >
                  {busy ? "Setting up account..." : "Continue"}
                </button>
              </form>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {error?.retryable && (
                  <button
                    type="button"
                    className="tt-button"
                    onClick={() => window.location.reload()}
                  >
                    Try again
                  </button>
                )}
                {supportEmail && error?.code === "INVITATION_EXPIRED" && (
                  <a
                    className="tt-button"
                    href={`mailto:${supportEmail}?subject=${encodeURIComponent("Request a new TTTracker invitation")}`}
                  >
                    Request a new invitation
                  </a>
                )}
                <p style={{ color: "#94a3b8", fontSize: 13 }}>
                  Your organisation administrator can resend a pending
                  invitation. A revoked invitation requires a new invitation.
                </p>
                <Link href="/login">Sign in with an existing account</Link>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
