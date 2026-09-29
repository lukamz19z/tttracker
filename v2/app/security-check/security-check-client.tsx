"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createSupabaseBrowser } from "@/lib/supabase/browser";

type SecurityStatus = {
  email: string | null;
  emailCodeRequired: boolean;
  emailCodeVerified: boolean;
  totpRequired: boolean;
  totpEnrolled: boolean;
  totpVerified: boolean;
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  complete: boolean;
};

export default function SecurityCheckClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const next = searchParams.get("next") || "/";

  const [status, setStatus] =
    useState<SecurityStatus | null>(null);
  const [challengeId, setChallengeId] =
    useState<string | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

  async function loadStatus() {
    const response = await fetch(
      "/api/security/status",
      { cache: "no-store" },
    );

    if (!response.ok) {
      router.replace("/login");
      return null;
    }

    const payload =
      (await response.json()) as SecurityStatus;

    setStatus(payload);
    setLoading(false);

    if (payload.complete) {
      router.replace(next);
      router.refresh();
    }

    return payload;
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function sendEmailCode() {
    setBusy(true);
    setMessage(null);

    const response = await fetch(
      "/api/security/email-code/send",
      { method: "POST" },
    );

    const payload = await response.json();

    if (!response.ok) {
      setMessage(
        payload.error ??
          "Could not send verification code.",
      );
      setBusy(false);
      return;
    }

    setChallengeId(payload.challengeId);
    setMessage("Verification code sent.");
    setBusy(false);
  }

  async function verifyEmail(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!challengeId) {
      setMessage("Request a verification code first.");
      return;
    }

    setBusy(true);
    setMessage(null);

    const response = await fetch(
      "/api/security/email-code/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId,
          code: emailCode,
        }),
      },
    );

    const payload = await response.json();

    if (!response.ok) {
      setMessage(
        payload.error ?? "Verification failed.",
      );
      setBusy(false);
      return;
    }

    setEmailCode("");
    setMessage("Email verified.");
    setBusy(false);

    await loadStatus();
  }

  async function verifyTotp(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setBusy(true);
    setMessage(null);

    const { data: factors, error: factorsError } =
      await supabase.auth.mfa.listFactors();

    if (factorsError) {
      setMessage(factorsError.message);
      setBusy(false);
      return;
    }

    const factor = factors.totp.find(
      (item) => item.status === "verified",
    );

    if (!factor) {
      setMessage(
        "Set up an authenticator in Account security first.",
      );
      setBusy(false);
      return;
    }

    const { error } =
      await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: totpCode,
      });

    if (error) {
      setMessage("Authenticator code is incorrect.");
      setBusy(false);
      return;
    }

    setTotpCode("");
    setMessage("Authenticator verified.");
    setBusy(false);

    await loadStatus();
  }

  if (loading || !status) {
    return (
      <div className="tt-card" style={{ padding: 28 }}>
        Checking security...
      </div>
    );
  }

  return (
    <div
      className="tt-card"
      style={{
        width: "100%",
        maxWidth: 470,
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
        Security check
      </h1>

      <div
        style={{
          color: "#94a3b8",
          fontSize: 13,
          marginBottom: 24,
        }}
      >
        {status.email}
      </div>

      {message ? (
        <div
          style={{
            marginBottom: 18,
            color: "#cbd5e1",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      ) : null}

      {status.emailCodeRequired &&
      !status.emailCodeVerified ? (
        <section style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 17 }}>
            Email verification
          </h2>

          {!challengeId ? (
            <button
              type="button"
              className="tt-button tt-button-primary"
              disabled={busy}
              onClick={() => void sendEmailCode()}
            >
              {busy
                ? "Sending..."
                : "Send email code"}
            </button>
          ) : (
            <form onSubmit={verifyEmail}>
              <input
                className="tt-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="6-digit code"
                value={emailCode}
                onChange={(event) =>
                  setEmailCode(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6),
                  )
                }
              />

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <button
                  type="submit"
                  className="tt-button tt-button-primary"
                  disabled={busy}
                >
                  Verify
                </button>

                <button
                  type="button"
                  className="tt-button"
                  disabled={busy}
                  onClick={() =>
                    void sendEmailCode()
                  }
                >
                  Resend
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {status.totpRequired &&
      !status.totpVerified ? (
        <section>
          <h2 style={{ fontSize: 17 }}>
            Authenticator
          </h2>

          {status.totpEnrolled ? (
            <form onSubmit={verifyTotp}>
              <input
                className="tt-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="Authenticator code"
                value={totpCode}
                onChange={(event) =>
                  setTotpCode(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6),
                  )
                }
              />

              <button
                type="submit"
                className="tt-button tt-button-primary"
                disabled={busy}
                style={{ marginTop: 10 }}
              >
                Verify authenticator
              </button>
            </form>
          ) : (
            <div>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                An authenticator is required for this account.
              </p>

              <button
                type="button"
                className="tt-button tt-button-primary"
                onClick={() =>
                  router.push(
                    `/account?next=${encodeURIComponent(
                      `/security-check?next=${next}`,
                    )}`,
                  )
                }
              >
                Set up authenticator
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
