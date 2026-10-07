"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  maskedSecurityEmail,
  securityReturnPath,
} from "@/lib/security/navigation";
import type { SecurityStatus } from "@/lib/security/types";

type Challenge = NonNullable<SecurityStatus["activeChallenge"]>;
export default function SecurityCheckClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = securityReturnPath(params.get("next") || "/");
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const sending = useRef(false);

  const send = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/security/email-code/send", {
        method: "POST",
      });
      const payload: Challenge & { error?: string; code?: string } =
        await response.json();
      if (!response.ok) {
        if (payload.code === "RATE_LIMITED") setNow(Date.now());
        setMessage(
          payload.error ||
            "We could not send the verification email. Please try again.",
        );
        return;
      }
      setChallenge(payload);
      setNow(Date.now());
      setCode("");
      setMessage("Verification code sent. Check your inbox and spam folder.");
    } catch {
      setMessage("Could not connect. Please try again.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/security/status", {
        cache: "no-store",
      });
      const payload: SecurityStatus & { error?: string } =
        await response.json();
      if (!response.ok) {
        if (response.status === 401)
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        else
          setMessage(
            payload.error ||
              "Security verification is unavailable. Please retry.",
          );
        return;
      }
      setStatus(payload);
      setChallenge(payload.activeChallenge);
      setNow(Date.now());
      if (payload.complete) {
        router.replace(next);
        router.refresh();
      } else if (
        payload.emailCodeRequired &&
        !payload.emailCodeVerified &&
        !payload.activeChallenge
      )
        await send();
    } catch {
      setMessage("Could not connect. Please retry.");
    }
  }, [next, router, send]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const cooldown = challenge
    ? Math.max(0, Math.ceil((Date.parse(challenge.resendAfter) - now) / 1000))
    : 0;
  const expired = challenge && Date.parse(challenge.expiresAt) <= now;

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/security/email-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, code }),
      });
      const payload: { error?: string } = await response.json();
      if (!response.ok) {
        setMessage(payload.error || "Verification failed. Please retry.");
        return;
      }
      setCode("");
      // Email assurance is server-recorded for the existing authenticated session.
      // It does not fabricate a Supabase AAL2 session.
      await load();
    } catch {
      setMessage("Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function verifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setMessage("Authenticator verification is unavailable. Please retry.");
        return;
      }
      const factor = data.totp.find((f) => f.status === "verified");
      if (!factor) {
        setMessage("Set up an authenticator in Account security first.");
        return;
      }
      const result = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: totp,
      });
      if (result.error) {
        setMessage("Authenticator code is incorrect or expired.");
        return;
      }
      setTotp("");
      await load();
    } catch {
      setMessage("Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="tt-card"
      style={{ width: "100%", maxWidth: 470, padding: 28 }}
    >
      <strong style={{ color: "#7dd3fc" }}>TTTracker</strong>
      <h1>Security Check</h1>
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
      {!status ? (
        <>
          <p>Checking your sign-in security...</p>
          <button
            className="tt-button"
            onClick={() => void load()}
            disabled={busy}
          >
            Retry
          </button>
        </>
      ) : status.complete ? (
        <>
          <p>Your sign-in meets the configured security requirements.</p>
          <button
            className="tt-button tt-button-primary"
            onClick={() => {
              router.replace(next);
              router.refresh();
            }}
          >
            Continue to workspace
          </button>
        </>
      ) : (
        <>
          {status.emailCodeRequired && !status.emailCodeVerified && (
            <section>
              <p>
                {challenge
                  ? "We sent a verification code to"
                  : "Verify your sign-in email"}
                <br />
                <strong>{maskedSecurityEmail(status.email)}</strong>
              </p>
              {challenge ? (
                <form onSubmit={verify}>
                  <label htmlFor="security-code">Verification code</label>
                  <input
                    id="security-code"
                    className="tt-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={challenge.codeLength}
                    pattern={`[0-9]{${challenge.codeLength}}`}
                    value={code}
                    onChange={(event) =>
                      setCode(
                        event.target.value
                          .replace(/\D/g, "")
                          .slice(0, challenge.codeLength),
                      )
                    }
                  />
                  {expired && (
                    <p>This verification code has expired. Send a new code.</p>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      className="tt-button tt-button-primary"
                      disabled={
                        busy ||
                        Boolean(expired) ||
                        code.length !== challenge.codeLength
                      }
                    >
                      {busy ? "Verifying..." : "Verify"}
                    </button>
                    <button
                      type="button"
                      className="tt-button"
                      disabled={busy || cooldown > 0}
                      onClick={() => void send()}
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  className="tt-button tt-button-primary"
                  disabled={busy}
                  onClick={() => void send()}
                >
                  {busy ? "Sending..." : "Send code"}
                </button>
              )}
            </section>
          )}
          {status.totpRequired && !status.totpVerified && (
            <section style={{ marginTop: 16 }}>
              {status.totpEnrolled ? (
                <form onSubmit={verifyTotp}>
                  <label htmlFor="authenticator-code">Authenticator code</label>
                  <input
                    id="authenticator-code"
                    className="tt-input"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    required
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={totp}
                    onChange={(event) =>
                      setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                  <button
                    className="tt-button tt-button-primary"
                    disabled={busy || totp.length !== 6}
                  >
                    Verify authenticator
                  </button>
                </form>
              ) : (
                <>
                  <p>Additional security setup is required.</p>
                  <button
                    className="tt-button tt-button-primary"
                    onClick={() =>
                      router.push(
                        `/account?next=${encodeURIComponent(`/security-check?next=${encodeURIComponent(next)}`)}`,
                      )
                    }
                  >
                    Set up authenticator
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
