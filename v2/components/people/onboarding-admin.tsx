"use client";
import { peopleLabel, peopleDisplay } from "@/lib/people/display";
import { ConfigurationSurface } from "./configuration-surface";
import { BackLink } from "./people-ui";
import { formatPeopleDate } from "@/lib/people/dates";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { MaterialsSearch } from "@/components/materials/workflow-controls";
import {
  Editor,
  PeoplePicker,
  responseData,
  type Result,
  type Row,
} from "./people-controls";
import {
  minimumClassification,
  onboardingTypes,
  type OnboardingDefinition,
  type OnboardingField,
} from "@/lib/people/onboarding-types";
import { OnboardingFields } from "./onboarding-fields";
import styles from "./people.module.css";
async function action(
  organisation: string,
  action: string,
  id?: string,
  data: Row = {},
) {
  return responseData(
    await fetch("/api/people/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organisation, action, id, data }),
    }),
  );
}
export function OnboardingPanel({
  organisation,
  templates,
  personId,
  permissions,
}: {
  organisation: string;
  templates?: boolean;
  personId?: string;
  permissions: Record<string, boolean>;
}) {
  const [data, setData] = useState<Result>({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);
  const [start, setStart] = useState(false);
  const [reviewTab, setReviewTab] = useState("overview");
  const [review, setReview] = useState<Row | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({
        organisation,
        action: templates ? "templates" : "list",
        q: query,
        page: String(page),
        status,
        person: personId ?? "",
      });
      setData(
        await responseData(
          await fetch(`/api/people/onboarding?${p}`, { cache: "no-store" }),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load.");
    }
  }, [organisation, templates, query, page, status, personId]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function perform(name: string, row: Row, input: Row = {}) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action(organisation, name, String(row.id), input);
      setNotice(name === "resend" ? "Onboarding link resent." : "Saved.");
      setReview(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <h2>{templates ? "Onboarding Templates" : "Onboarding"}</h2>
        {(templates
          ? permissions["people.configure"]
          : permissions["people.onboarding.manage"]) && (
          <button
            className="tt-button-primary"
            onClick={() => (templates ? setEdit({}) : setStart(true))}
          >
            {templates ? "New template" : "Start Onboarding"}
          </button>
        )}
      </div>
      <div className={styles.toolbar}>
        <MaterialsSearch
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          onClear={() => setQuery("")}
          placeholder={
            templates
              ? "Search templates..."
              : "Search person, recipient or template..."
          }
        />
        {!templates && (
          <select
            className="tt-input"
            aria-label="Onboarding status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {[
              "draft",
              "invited",
              "in_progress",
              "submitted",
              "under_review",
              "changes_required",
              "completed",
              "expired",
              "revoked",
            ].map((s) => (
              <option key={s} value={s}>
                {peopleLabel(s)}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {start && (
        <Editor
          organisation={organisation}
          surface="medium"
          saveLabel="Send Onboarding"
          heading="Send Secure Onboarding Link"
          derive={async (key, id) =>
            key === "person_id"
              ? responseData(
                  await fetch(
                    `/api/people/onboarding?organisation=${organisation}&action=person_prefill&id=${id}`,
                  ),
                )
              : {}
          }
          initial={{
            person_id: personId ?? "",
            expires_at: new Date(Date.now() + 14 * 86400000)
              .toISOString()
              .slice(0, 16),
          }}
          fields={[
            {
              key: "person_id",
              label: "Existing Person (blank for prospective Person)",
              area: "people_choices",
            },
            { key: "name", label: "Prospective recipient name" },
            {
              key: "relationship_type_id",
              label: "Employment / Engagement Type",
              area: "types",
            },
            {
              key: "template_id",
              label: "Published template",
              area: "onboarding_template_choices",
              required: true,
            },
            {
              key: "email",
              label: "Recipient email",
              type: "email",
              required: true,
            },
            {
              key: "project_id",
              label: "Project (optional)",
              area: "projects",
            },
            {
              key: "expires_at",
              label: "Expiry",
              type: "datetime-local",
              required: true,
            },
          ]}
          onCancel={() => setStart(false)}
          onSave={async (input) => {
            await action(organisation, "start", undefined, {
              ...input,
              expires_at: new Date(String(input.expires_at)).toISOString(),
            });
            setStart(false);
            setNotice("Secure onboarding link sent.");
            await load();
          }}
        />
      )}
      {edit && (
        <TemplateBuilder
          key={String(edit.id ?? "new")}
          organisation={organisation}
          template={edit}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            setNotice("Onboarding template saved.");
            await load();
          }}
        />
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {templates ? (
                <>
                  <th>Template</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Sections</th>
                  <th>Review</th>
                </>
              ) : (
                <>
                  <th>Person / Recipient</th>
                  <th>Worker Type</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Sent</th>
                  <th>Submitted</th>
                  <th>Expiry</th>
                </>
              )}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data.rows ?? []).map((row) => (
              <tr key={String(row.id)}>
                {templates ? (
                  <>
                    <td>{String(row.name)}</td>
                    <td>v{String(row.version)}</td>
                    <td>{peopleLabel(String(row.status))}</td>
                    <td>{String(row.sections)}</td>
                    <td>
                      {peopleDisplay(
                        String(row.review_policy),
                        "review_policy",
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td>{String(row.name)}</td>
                    <td>
                      {String(row.template)} · v{String(row.version)}
                    </td>
                    <td>
                      {peopleLabel(String(row.status))}
                      {row.send_status === "failed" && (
                        <small> · Email failed</small>
                      )}
                    </td>
                    <td>
                      {String(row.answered)} / {String(row.requested)}
                    </td>
                    <td>
                      {row.sent_at ? formatPeopleDate(row.sent_at) : "Not sent"}
                    </td>
                    <td>
                      {row.submitted_at
                        ? formatPeopleDate(String(row.submitted_at))
                        : "—"}
                    </td>
                    <td>{formatPeopleDate(row.expires_at)}</td>
                  </>
                )}
                <td className={styles.actions}>
                  {templates ? (
                    <>
                      <button
                        className="tt-button"
                        onClick={() => setEdit(row)}
                      >
                        Manage
                      </button>
                      <button
                        className="tt-button-danger"
                        disabled={busy}
                        onClick={() => void perform("archive", row)}
                      >
                        Archive
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="tt-button"
                        onClick={async () => {
                          try {
                            const r = await responseData(
                              await fetch(
                                `/api/people/onboarding?organisation=${organisation}&action=detail&id=${row.id}`,
                              ),
                            );
                            setReview({ ...r, id: row.id });
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Unable to open.",
                            );
                          }
                        }}
                      >
                        Open
                      </button>
                      {permissions["people.onboarding.manage"] &&
                        !["completed", "revoked", "expired"].includes(
                          String(row.status),
                        ) && (
                          <>
                            <button
                              className="tt-button"
                              disabled={busy}
                              onClick={() => void perform("resend", row)}
                            >
                              Resend
                            </button>
                            <button
                              className="tt-button-danger"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  confirm(
                                    "Revoke this onboarding link and its sessions?",
                                  )
                                )
                                  void perform("revoke", row);
                              }}
                            >
                              Revoke
                            </button>
                          </>
                        )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.rows?.length && (
        <p>
          {templates
            ? "No onboarding templates have been added."
            : "No matching onboardings."}
        </p>
      )}
      {review && (
        <section className={`${styles.detail} ${styles.drawer}`}>
          <BackLink
            href={`/workspace/people?organisation=${organisation}&section=onboarding`}
            label="Back to Onboarding"
            onNavigate={() => setReview(null)}
          />
          <nav className={styles.nav} aria-label="Onboarding record">
            {[
              "overview",
              "submission",
              "documents",
              "training",
              "review",
              "history",
            ].map((tab) => (
              <button
                key={tab}
                aria-current={reviewTab === tab ? "page" : undefined}
                onClick={() => setReviewTab(tab)}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
          <div className={styles.toolbar}>
            <h3>Onboarding review · {peopleLabel(String(review.status))}</h3>
            <button
              className="tt-button-subtle"
              onClick={() => setReview(null)}
            >
              Close
            </button>
          </div>
          {reviewTab === "overview" && (
            <dl className={styles.summary}>
              {[
                ["status", "Status"],
                ["submitted_at", "Submitted"],
                ["expires_at", "Expiry"],
                ["review_policy", "Review policy"],
              ].map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {key.endsWith("_at")
                      ? formatPeopleDate(review[key], true)
                      : String(review[key] ?? "Not recorded")}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {["submission", "documents", "training"].includes(reviewTab) && (
            <OnboardingFields
              definition={
                reviewTab === "submission"
                  ? (review.definition as OnboardingDefinition)
                  : {
                      sections: (
                        review.definition as OnboardingDefinition
                      ).sections
                        .map((s) => ({
                          ...s,
                          fields: s.fields.filter((f) =>
                            reviewTab === "training"
                              ? f.type === "training_request"
                              : f.type === "document_upload",
                          ),
                        }))
                        .filter((s) => s.fields.length > 0),
                    }
              }
              answers={(review.answers ?? {}) as Record<string, unknown>}
              readOnly
              permissions={permissions}
              onDocuments={async (field) => {
                try {
                  const r = await responseData(
                    await fetch(
                      `/api/people/onboarding/documents?organisation=${organisation}&id=${review.id}&field=${field}`,
                    ),
                  );
                  if (!r.rows?.length) {
                    setNotice("No evidence uploaded.");
                    return;
                  }
                  for (const d of r.rows)
                    window.open(String(d.url), "_blank", "noopener,noreferrer");
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Unable to open evidence.",
                  );
                }
              }}
            />
          )}
          {reviewTab === "review" &&
            permissions["people.onboarding.review"] &&
            ["submitted", "under_review"].includes(String(review.status)) && (
              <>
                {review.review_policy === "sections" && (
                  <div className={styles.actions}>
                    {(review.definition as OnboardingDefinition).sections.map(
                      (section, n) => (
                        <button
                          className="tt-button"
                          key={n}
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await action(
                                organisation,
                                "section_review",
                                String(review.id),
                                { section: n },
                              );
                              const refreshed = await responseData(
                                await fetch(
                                  `/api/people/onboarding?organisation=${organisation}&action=detail&id=${review.id}`,
                                ),
                              );
                              setReview({ ...refreshed, id: review.id });
                              setNotice("Section review recorded.");
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Unable to review section.",
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Approve {section.name}
                        </button>
                      ),
                    )}
                  </div>
                )}
                <label className={styles.field}>
                  Review comment / changes required
                  <textarea
                    className="tt-input"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                  />
                </label>
                <div className={styles.actions}>
                  <button
                    className="tt-button-primary"
                    disabled={busy}
                    onClick={() => void perform("complete", review)}
                  >
                    Approve and complete
                  </button>
                  <button
                    className="tt-button"
                    disabled={busy || !comment.trim()}
                    onClick={() => void perform("changes", review, { comment })}
                  >
                    Request changes
                  </button>
                </div>
                <small>
                  Completion requires access to every requested private domain
                  and Training approval when applicable.
                </small>
              </>
            )}
          {reviewTab === "history" && (
            <div className={styles.panel}>
              <h3>Review history</h3>
              {((review.history ?? []) as Row[]).map((h, n) => (
                <p key={n}>
                  {String(h.action)} · {formatPeopleDate(h.created_at, true)}{" "}
                  {h.comment ? `· ${String(h.comment)}` : ""}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
      <div className={styles.toolbar}>
        <small>
          {Number(data.total ?? 0)} records · Page {page}
        </small>
        <div>
          <button
            className="tt-button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            className="tt-button"
            disabled={page * 20 >= Number(data.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
function TemplateBuilder({
  organisation,
  template,
  onClose,
  onSaved,
}: {
  organisation: string;
  template: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [definition, setDefinition] = useState<OnboardingDefinition>({
    sections: [{ name: "Details", fields: [] }],
  });
  const [name, setName] = useState(String(template.name ?? ""));
  const [relationship, setRelationship] = useState(
    String(template.relationship_type_id ?? ""),
  );
  const [policy, setPolicy] = useState("required");
  const [section, setSection] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [newField, setNewField] = useState<OnboardingField | null>(null);
  const [preview, setPreview] = useState(false);
  const [builderTab, setBuilderTab] = useState("sections");
  const [versionInfo, setVersionInfo] = useState<Row>({});
  const [versions, setVersions] = useState<Result>({});
  const [versionPage, setVersionPage] = useState(1);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState(template.id ? String(template.id) : undefined);
  useEffect(() => {
    if (builderTab !== "versions" || !id) return;
    const controller = new AbortController();
    void fetch(
      `/api/people/onboarding?organisation=${organisation}&action=versions&id=${id}&page=${versionPage}`,
      { signal: controller.signal },
    )
      .then(responseData)
      .then(setVersions)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Unable to load version history.");
      });
    return () => controller.abort();
  }, [builderTab, id, organisation, versionPage]);
  useEffect(() => {
    if (!template.id) return;
    void fetch(
      `/api/people/onboarding?organisation=${organisation}&action=template&id=${template.id}`,
    )
      .then(responseData)
      .then((d) => {
        setDefinition(d.definition as OnboardingDefinition);
        setVersionInfo(d);
        setPolicy(String(d.review_policy));
        setBaseline(
          JSON.stringify({
            definition: d.definition,
            name: String(template.name ?? ""),
            relationship: String(template.relationship_type_id ?? ""),
            policy: String(d.review_policy),
          }),
        );
      })
      .catch(() => setError("Unable to load template."));
  }, [organisation, template.id, template.name, template.relationship_type_id]);
  const [baseline, setBaseline] = useState(
    JSON.stringify({
      definition: { sections: [{ name: "Details", fields: [] }] },
      name: String(template.name ?? ""),
      relationship: String(template.relationship_type_id ?? ""),
      policy: "required",
    }),
  );
  const current = definition.sections[section];
  const field = selected == null ? undefined : current?.fields[selected];
  const confidential = definition.sections.some((s) =>
    s.fields.some((f) => f.classification === "confidential"),
  );
  async function save(publish: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await action(organisation, "save_template", id, {
        name,
        relationship_type_id: relationship,
        review_policy: policy,
        definition,
      });
      const savedId = String(saved.id);
      setId(savedId);
      if (publish) {
        await action(organisation, "publish", savedId);
        await onSaved();
      } else {
        await onSaved();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConfigurationSurface
      title={
        template.id ? "Edit Onboarding Template" : "New Onboarding Template"
      }
      size="large"
      description="Organise sections and requests for onboarding."
      dirty={
        baseline !== JSON.stringify({ definition, name, relationship, policy })
      }
      busy={busy}
      onClose={onClose}
      footer={
        <div className={styles.actions}>
          <button
            type="button"
            className="tt-button"
            disabled={busy || !name.trim()}
            onClick={() => void save(false)}
          >
            {busy ? "Saving..." : "Save Draft"}
          </button>
          <button
            type="button"
            className="tt-button-primary"
            disabled={busy || !name.trim() || confidential}
            onClick={() => void save(true)}
          >
            Publish Version
          </button>
        </div>
      }
    >
      <nav className={styles.nav} aria-label="Template editor">
        {[
          "overview",
          "sections",
          "fields",
          "review",
          "documents",
          "preview",
          "versions",
        ].map((tab) => (
          <button
            key={tab}
            aria-current={builderTab === tab ? "page" : undefined}
            onClick={() => {
              setBuilderTab(tab);
              setPreview(tab === "preview");
            }}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>
      {["overview", "review"].includes(builderTab) && (
        <div className={styles.fields}>
          <label className={styles.field}>
            Template name
            <input
              className="tt-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <PeoplePicker
            organisation={organisation}
            area="types"
            label="Employment / Engagement Type"
            selected={relationship}
            onChange={setRelationship}
          />
          <label className={styles.field}>
            Review policy
            <select
              className="tt-input"
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
            >
              {["required", "none", "sections"].map((p) => (
                <option key={p} value={p}>
                  {{
                    required: "Review required",
                    none: "No review required",
                    sections: "Section-specific review",
                  }[p] ?? p}
                </option>
              ))}
            </select>
          </label>
          <small>
            No-review completion is available for Operational fields only.
            Private and training requests require review.
          </small>
        </div>
      )}
      {builderTab === "versions" && (
        <div className={styles.panel}>
          <h3>Template version</h3>
          <p>
            {versionInfo.version
              ? `Version ${versionInfo.version} - ${versionInfo.published ? "Published" : "Draft"}`
              : "Unsaved draft"}
          </p>
          <p>
            Published versions used by onboarding instances remain immutable.
            Saving changes creates a new draft.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Published</th>
                <th>Sections</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {(versions.rows ?? []).map((v) => (
                <tr key={String(v.id)}>
                  <td>v{String(v.version)}</td>
                  <td>{v.published_at ? "Published" : "Draft"}</td>
                  <td>{formatPeopleDate(v.published_at, true)}</td>
                  <td>{String(v.sections)}</td>
                  <td>
                    {peopleDisplay(String(v.review_policy), "review_policy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.actions}>
            <button
              disabled={versionPage <= 1}
              onClick={() => setVersionPage(versionPage - 1)}
            >
              Previous
            </button>
            <button
              disabled={versionPage * 20 >= Number(versions.total ?? 0)}
              onClick={() => setVersionPage(versionPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
      {confidential && (
        <p className={styles.notice}>
          Confidential collection unavailable. Secure key infrastructure must be
          configured before this template can be published or collected.
        </p>
      )}
      {["sections", "fields", "documents", "preview"].includes(builderTab) && (
        <div className={styles.builder}>
          <nav aria-label="Template sections">
            {definition.sections.map((s, n) => (
              <button
                key={n}
                className="tt-button"
                aria-current={section === n ? "step" : undefined}
                onClick={() => {
                  setSection(n);
                  setSelected(null);
                }}
              >
                {n + 1}. {s.name}
              </button>
            ))}
            <button
              className="tt-button"
              onClick={() => {
                setDefinition({
                  sections: [
                    ...definition.sections,
                    { name: "New section", fields: [] },
                  ],
                });
                setSection(definition.sections.length);
                setSelected(null);
              }}
            >
              <Plus size={15} /> Section
            </button>
          </nav>
          <div className={styles.panel}>
            {preview ? (
              <OnboardingFields definition={definition} answers={{}} />
            ) : (
              <>
                <div className={styles.toolbar}>
                  <label className={styles.field}>
                    Section name
                    <input
                      className="tt-input"
                      value={current?.name ?? ""}
                      onChange={(e) =>
                        setDefinition({
                          sections: definition.sections.map((s, n) =>
                            n === section ? { ...s, name: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="tt-button"
                    disabled={definition.sections.length <= 1}
                    onClick={() => {
                      setDefinition({
                        sections: definition.sections.filter(
                          (_, n) => n !== section,
                        ),
                      });
                      setSection(0);
                      setSelected(null);
                    }}
                  >
                    Remove section
                  </button>
                </div>
                <div className={styles.fieldList}>
                  {current?.fields.map((f, n) =>
                    builderTab === "documents" &&
                    !["document_upload", "training_request"].includes(
                      f.type,
                    ) ? null : (
                      <div className={styles.toolbar} key={f.key}>
                        <button
                          className="tt-button"
                          onClick={() => setSelected(n)}
                        >
                          {f.label} · {peopleLabel(f.type)} ·{" "}
                          {peopleLabel(f.classification)}
                          {f.required ? " *" : ""}
                        </button>
                        <div>
                          <button
                            className="tt-button"
                            aria-label="Move field up"
                            disabled={n === 0}
                            onClick={() => {
                              const fields = [...current.fields];
                              [fields[n - 1], fields[n]] = [
                                fields[n],
                                fields[n - 1],
                              ];
                              setDefinition({
                                sections: definition.sections.map((s, i) =>
                                  i === section ? { ...s, fields } : s,
                                ),
                              });
                              setSelected(n - 1);
                            }}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            className="tt-button"
                            aria-label="Move field down"
                            disabled={n === current.fields.length - 1}
                            onClick={() => {
                              const fields = [...current.fields];
                              [fields[n + 1], fields[n]] = [
                                fields[n],
                                fields[n + 1],
                              ];
                              setDefinition({
                                sections: definition.sections.map((s, i) =>
                                  i === section ? { ...s, fields } : s,
                                ),
                              });
                              setSelected(n + 1);
                            }}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            className="tt-button"
                            aria-label="Remove field"
                            onClick={() => {
                              setDefinition({
                                sections: definition.sections.map((s, i) =>
                                  i === section
                                    ? {
                                        ...s,
                                        fields: s.fields.filter(
                                          (_, x) => x !== n,
                                        ),
                                      }
                                    : s,
                                ),
                              });
                              setSelected(null);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
                <button
                  className="tt-button"
                  onClick={() => {
                    const f: OnboardingField = {
                      key: `field_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
                      label: "New field",
                      type: "text",
                      classification: "operational",
                    };
                    setNewField(f);
                    setSelected(null);
                  }}
                >
                  <Plus size={15} /> Add field / request
                </button>
                {(field || newField) && (
                  <OnboardingFieldEditor
                    key={newField?.key ?? field?.key}
                    organisation={organisation}
                    initial={(newField ?? field)!}
                    earlier={current.fields.slice(
                      0,
                      selected ?? current.fields.length,
                    )}
                    onClose={() => {
                      setSelected(null);
                      setNewField(null);
                    }}
                    onSave={(saved) => {
                      setDefinition({
                        sections: definition.sections.map((s, i) =>
                          i !== section
                            ? s
                            : {
                                ...s,
                                fields: newField
                                  ? [...s.fields, saved]
                                  : s.fields.map((f, n) =>
                                      n === selected ? saved : f,
                                    ),
                              },
                        ),
                      });
                      setSelected(null);
                      setNewField(null);
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </ConfigurationSurface>
  );
}

function OnboardingFieldEditor({
  organisation,
  initial,
  earlier,
  onSave,
  onClose,
}: {
  organisation: string;
  initial: OnboardingField;
  earlier: OnboardingField[];
  onSave: (field: OnboardingField) => void;
  onClose: () => void;
}) {
  const [field, setField] = useState(initial);
  const [error, setError] = useState("");
  const current = { fields: earlier };
  const selected = earlier.length;
  function updateField(input: Partial<OnboardingField>) {
    setField({ ...field, ...input });
  }
  return (
    <ConfigurationSurface
      title="Edit Onboarding Field"
      description="Configure what the recipient is asked to provide."
      dirty={JSON.stringify(field) !== JSON.stringify(initial)}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="tt-button-primary"
          onClick={() => {
            if (!field.label.trim()) {
              setError("Field label is required.");
              return;
            }
            if (field.type === "training_request" && !field.training_type_id) {
              setError("Choose a Training Type.");
              return;
            }
            if (
              ["single_select", "multi_select"].includes(field.type) &&
              !(field.options ?? []).some((option) => option.trim())
            ) {
              setError("Add at least one option.");
              return;
            }
            onSave(field);
          }}
        >
          Save Field
        </button>
      }
    >
      <div className={styles.fields}>
        <label className={styles.field}>
          Label
          <input
            className="tt-input"
            value={field.label}
            onChange={(e) => updateField({ label: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          Type
          <select
            className="tt-input"
            value={field.type}
            onChange={(e) => {
              const type = e.target.value as OnboardingField["type"];
              updateField({
                type,
                classification: minimumClassification(type),
                domain:
                  minimumClassification(type) === "private"
                    ? "personal_contact"
                    : undefined,
              });
            }}
          >
            {onboardingTypes.map((t) => (
              <option key={t} value={t}>
                {peopleLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Classification
          <select
            className="tt-input"
            value={field.classification}
            onChange={(e) =>
              updateField({
                classification: e.target
                  .value as OnboardingField["classification"],
                domain:
                  e.target.value === "private" ? "personal_contact" : undefined,
              })
            }
          >
            {["operational", "private", "confidential"]
              .filter(
                (c) =>
                  ["operational", "private", "confidential"].indexOf(c) >=
                  ["operational", "private", "confidential"].indexOf(
                    minimumClassification(field.type),
                  ),
              )
              .map((c) => (
                <option key={c} value={c}>
                  {peopleLabel(c)}
                </option>
              ))}
          </select>
        </label>
        {field.classification === "private" && (
          <label className={styles.field}>
            Private domain
            <select
              className="tt-input"
              value={field.domain ?? "personal_contact"}
              onChange={(e) => updateField({ domain: e.target.value })}
            >
              {[
                "personal_contact",
                "emergency_contact",
                "employment",
                "safety_claims",
              ].map((d) => (
                <option key={d} value={d}>
                  {peopleLabel(d)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={(e) => updateField({ required: e.target.checked })}
          />{" "}
          Required
        </label>
        <label className={styles.field}>
          Help text
          <input
            className="tt-input"
            value={field.help ?? ""}
            onChange={(e) => updateField({ help: e.target.value })}
          />
        </label>
        {["single_select", "multi_select"].includes(field.type) && (
          <label className={styles.field}>
            Options (one per line)
            <textarea
              className="tt-input"
              value={(field.options ?? []).join("\n")}
              onChange={(e) =>
                updateField({ options: e.target.value.split("\n") })
              }
            />
          </label>
        )}
        {field.type === "training_request" && (
          <PeoplePicker
            organisation={organisation}
            area="training_types"
            label="Training request"
            selected={field.training_type_id ?? ""}
            onChange={(training_type_id) => updateField({ training_type_id })}
          />
        )}
        <details>
          <summary>Advanced settings</summary>
          <div className={styles.fields}>
            <label className={styles.field}>
              Approved value mapping
              <select
                className="tt-input"
                value={field.mapping ?? ""}
                onChange={(e) => updateField({ mapping: e.target.value })}
              >
                <option value="">Keep as onboarding answer</option>
                {(field.classification === "operational"
                  ? [
                      "display_name",
                      "employer",
                      "position",
                      "work_email",
                      "start_date",
                      "end_date",
                    ]
                  : field.classification === "private"
                    ? ["personal_phone", "personal_email"]
                    : []
                ).map((m) => (
                  <option key={m} value={m}>
                    {peopleLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Show when (optional)
              <select
                className="tt-input"
                value={field.condition?.field ?? ""}
                onChange={(e) =>
                  updateField({
                    condition: e.target.value
                      ? { field: e.target.value, equals: true }
                      : undefined,
                  })
                }
              >
                <option value="">Always</option>
                {current.fields
                  .slice(0, selected ?? 0)
                  .filter((f) => f.type === "boolean")
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label} is Yes
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </details>
        {field.classification === "confidential" && (
          <p role="status">
            Confidential collection unavailable. Secure key infrastructure must
            be configured before this field can be published or collected.
          </p>
        )}
        {error && (
          <p role="alert" className={styles.fieldError}>
            {error}
          </p>
        )}
        <small>
          Save Field updates the template draft. Save the template to persist
          these changes.
        </small>
      </div>
    </ConfigurationSurface>
  );
}
