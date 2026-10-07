"use client";
import { useEffect, useRef, useState } from "react";
import {
  resumeOnboarding,
  onboardingResponse,
} from "@/lib/people/onboarding-client-session";
import { OnboardingFields } from "./onboarding-fields";
import { type OnboardingDefinition } from "@/lib/people/onboarding-types";
import styles from "./people.module.css";
type ExternalResult = {
  title: string;
  organisation: string;
  definition: OnboardingDefinition;
  answers: Record<string, unknown>;
  status: string;
  review_comment?: string;
  training?: Record<string, Record<string, unknown>>;
  issues?: { field: string; label: string }[];
};
export default function ExternalOnboarding() {
  const [data, setData] = useState<ExternalResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issues, setIssues] = useState<{ field: string; label: string }[]>([]);
  const started = useRef(false);
  const result = onboardingResponse;
  async function open() {
    setError("");
    setBusy(true);
    try {
      const loaded: ExternalResult = await resumeOnboarding(
        fetch,
        window.location,
        () =>
          history.replaceState(
            history.state,
            "",
            window.location.pathname + window.location.search,
          ),
      );
      setData(loaded);
      setAnswers(loaded.answers);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't load your onboarding right now.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
  }, []);
  async function request(action: string, field?: string, value?: unknown) {
    return result(
      await fetch("/api/onboarding/security/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, field, value }),
      }),
    );
  }
  async function save(submit = false) {
    if (busy || !data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      for (const field of data.definition.sections.flatMap((s) => s.fields)) {
        if (
          field.classification === "confidential" ||
          field.type === "document_upload" ||
          answers[field.key] == null
        )
          continue;
        await request("save", field.key, answers[field.key]);
      }
      if (submit) {
        const r = await request("submit");
        setIssues(r.issues ?? []);
        if (!r.issues?.length) {
          setData({ ...data, status: r.status ?? "submitted" });
          setNotice(
            r.status === "completed"
              ? "Onboarding completed."
              : "Onboarding submitted. The organisation will review it according to its policy.",
          );
        }
      } else
        setNotice(
          "Draft saved securely. You can return on this device to resume.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.external}>
      <header>
        <small>TTTracker</small>
        <h1>{data?.organisation ?? "Secure onboarding"}</h1>
        <p>{data?.title}</p>
      </header>
      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}
      {!data && error.startsWith("We couldn't") && (
        <button disabled={busy} onClick={() => void open()}>
          Try again
        </button>
      )}
      {!data && !error && <p>Verifying your secure link...</p>}
      {data && (
        <>
          <p className={styles.muted}>
            Your information is saved securely on the server. Completing
            onboarding does not create a TTTracker login.
          </p>
          {data.review_comment && (
            <p className={styles.notice}>
              Changes requested: {data.review_comment}
            </p>
          )}
          <OnboardingFields
            definition={data.definition}
            answers={answers}
            training={data.training}
            onChange={(key, value) =>
              setAnswers((prior) => ({ ...prior, [key]: value }))
            }
            readOnly={["submitted", "completed", "under_review"].includes(
              data.status,
            )}
            onUpload={async (field, side, file) => {
              const body = new FormData();
              body.set("field", field);
              body.set("side", side);
              body.set("file", file);
              await result(
                await fetch("/api/onboarding/security/workflow", {
                  method: "POST",
                  body,
                }),
              );
              setNotice("Evidence uploaded securely.");
            }}
            onDocuments={async (field) => {
              try {
                const r = await request("document_access", field);
                if (!r.rows?.length) {
                  setNotice("No evidence uploaded for this request.");
                  return;
                }
                for (const d of r.rows)
                  window.open(d.url, "_blank", "noopener,noreferrer");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unable to open evidence.",
                );
              }
            }}
          />
          {!!issues.length && (
            <div role="alert">
              <strong>{issues.length} items require attention</strong>
              <ul>
                {issues.map((i) => (
                  <li key={i.field}>{i.label}</li>
                ))}
              </ul>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          {!["submitted", "completed", "under_review"].includes(
            data.status,
          ) && (
            <footer className={styles.stickyAction}>
              <button
                className="tt-button"
                disabled={busy}
                onClick={() => void save()}
              >
                Save draft
              </button>
              <button
                className="tt-button-primary"
                disabled={busy}
                onClick={() => void save(true)}
              >
                {busy ? "Saving..." : "Submit onboarding"}
              </button>
            </footer>
          )}
        </>
      )}
    </main>
  );
}
