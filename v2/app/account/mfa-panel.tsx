"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowser } from "@/lib/supabase/browser";

type TotpFactor = {
  id: string;
  friendly_name?: string | null;
  status: string;
};

export default function MfaPanel() {
  const supabase = useMemo(
    () => createSupabaseBrowser(),
    [],
  );

  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [factorId, setFactorId] =
    useState<string | null>(null);
  const [qrCode, setQrCode] =
    useState<string | null>(null);
  const [secret, setSecret] =
    useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

  async function loadFactors() {
    const { data, error } =
      await supabase.auth.mfa.listFactors();

    if (error) {
      setMessage(error.message);
      return;
    }

    setFactors(
      (data.totp ?? []).map((factor) => ({
        id: factor.id,
        friendly_name: factor.friendly_name,
        status: factor.status,
      })),
    );
  }

  useEffect(() => {
    void loadFactors();
  }, []);

  async function startEnrollment() {
    setBusy(true);
    setMessage(null);

    const { data, error } =
      await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "TTTracker Authenticator",
      });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setBusy(false);
  }

  async function verifyEnrollment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!factorId) return;

    setBusy(true);
    setMessage(null);

    const { error } =
      await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });

    if (error) {
      setMessage("Authenticator code is incorrect.");
      setBusy(false);
      return;
    }

    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setCode("");
    setMessage("Authenticator enabled.");
    setBusy(false);

    await loadFactors();
  }

  async function removeFactor(id: string) {
    const confirmed = window.confirm(
      "Remove this authenticator from your TTTracker account?",
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage(null);

    const { error } =
      await supabase.auth.mfa.unenroll({
        factorId: id,
      });

    if (error) {
      setMessage(
        error.message.includes("aal2")
          ? "Verify your authenticator during sign in before removing it."
          : error.message,
      );
      setBusy(false);
      return;
    }

    setMessage("Authenticator removed.");
    setBusy(false);

    await loadFactors();
  }

  const verifiedFactors = factors.filter(
    (factor) => factor.status === "verified",
  );

  return (
    <section className="tt-card" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>
        Multi-factor authentication
      </h2>

      <p
        style={{
          color: "#94a3b8",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Add an authenticator app for an additional security factor.
      </p>

      {message ? (
        <div
          style={{
            marginBottom: 14,
            color: "#cbd5e1",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      ) : null}

      {verifiedFactors.length > 0 ? (
        <div style={{ marginBottom: 18 }}>
          {verifiedFactors.map((factor) => (
            <div
              key={factor.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>
                  {factor.friendly_name ??
                    "Authenticator"}
                </div>

                <div
                  style={{
                    color: "#86efac",
                    fontSize: 12,
                    marginTop: 3,
                  }}
                >
                  Enabled
                </div>
              </div>

              <button
                type="button"
                className="tt-button"
                disabled={busy}
                onClick={() =>
                  void removeFactor(factor.id)
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {!factorId ? (
        <button
          type="button"
          className="tt-button tt-button-primary"
          disabled={busy}
          onClick={() => void startEnrollment()}
        >
          {busy
            ? "Starting..."
            : "Add authenticator"}
        </button>
      ) : (
        <form onSubmit={verifyEnrollment}>
          {qrCode ? (
            <div
              style={{
                padding: 16,
                background: "#ffffff",
                width: "fit-content",
                borderRadius: 10,
                marginBottom: 14,
              }}
            >
              <img
                src={qrCode}
                alt="Authenticator QR code"
                width={220}
                height={220}
              />
            </div>
          ) : null}

          {secret ? (
            <div
              style={{
                color: "#94a3b8",
                fontSize: 12,
                marginBottom: 14,
                overflowWrap: "anywhere",
              }}
            >
              Manual key: {secret}
            </div>
          ) : null}

          <input
            className="tt-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            placeholder="6-digit authenticator code"
            value={code}
            onChange={(event) =>
              setCode(
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
              Enable
            </button>

            <button
              type="button"
              className="tt-button"
              disabled={busy}
              onClick={async () => {
                if (factorId) {
                  await supabase.auth.mfa.unenroll({
                    factorId,
                  });
                }

                setFactorId(null);
                setQrCode(null);
                setSecret(null);
                setCode("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
