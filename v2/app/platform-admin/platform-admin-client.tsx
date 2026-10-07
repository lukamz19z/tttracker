"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import type {
  OrganisationSummary,
  SubscriptionPlanSummary,
} from "@/lib/platform/types";

type Props = {
  admin: {
    displayName: string | null;
    email: string | null;
    role: string;
  };
};

export default function PlatformAdminClient({ admin }: Props) {
  const [organisations, setOrganisations] = useState<OrganisationSummary[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlanSummary[]>([]);
  const [search,setSearch] = useState("");
  const [querySearch,setQuerySearch] = useState("");
  const [page,setPage] = useState(1);
  const [total,setTotal] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setQuerySearch(search); setPage(1); },300); return () => clearTimeout(timer); },[search]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [abn, setAbn] = useState("");
  const [initialAdminEmail, setInitialAdminEmail] = useState("");
  const [planVersionId, setPlanVersionId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [organisationResponse, planResponse] = await Promise.all([
        fetch(`/api/platform/organisations?page=${page}&search=${encodeURIComponent(querySearch)}`, { cache: "no-store" }),
        fetch("/api/platform/plans", { cache: "no-store" }),
      ]);

      const [organisationPayload, planPayload] = await Promise.all([
        organisationResponse.json(),
        planResponse.json(),
      ]);

      if (!organisationResponse.ok) {
        throw new Error(
          organisationPayload.error ?? "Could not load organisations.",
        );
      }

      if (!planResponse.ok) {
        throw new Error(
          planPayload.error ?? "Could not load subscription plans.",
        );
      }

      const nextPlans: SubscriptionPlanSummary[] =
        planPayload.plans ?? [];

      setOrganisations(organisationPayload.organisations ?? []);
      setTotal(organisationPayload.total ?? 0);
      setPlans(nextPlans);

      setPlanVersionId((current) => {
        if (current) return current;
        return nextPlans[0]?.planVersionId ?? "";
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load platform data.",
      );
    } finally {
      setLoading(false);
    }
  }, [page,querySearch]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function createOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/platform/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          legalName,
          abn,
          initialAdminEmail,
          planVersionId,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not create organisation.",
        );
      }

      setCode("");
      setName("");
      setLegalName("");
      setAbn("");
      setInitialAdminEmail("");
      setShowCreate(false);

      await loadData();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create organisation.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: "0" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: 28,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#7dd3fc",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={16} />
              TTTracker
            </div>

            <h1 style={{ fontSize: 32, marginBottom: 6 }}>
              Organisations
            </h1>

            <div style={{ color: "#94a3b8", fontSize: 13 }}>
              {admin.displayName ?? admin.email ?? "Platform Admin"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="tt-button"
              type="button"
              onClick={() => void loadData()}
            >
              <RefreshCw
                size={16}
                style={{ verticalAlign: "middle", marginRight: 7 }}
              />
              Refresh
            </button>

            {admin.role !== "support" && <button
              className="tt-button tt-button-primary"
              type="button"
              onClick={() => setShowCreate((current) => !current)}
            >
              <Plus
                size={16}
                style={{ verticalAlign: "middle", marginRight: 7 }}
              />
              New organisation
            </button>}
          </div>
        </header>

        {error ? (
          <div
            className="tt-card"
            style={{
              borderColor: "#7f1d1d",
              color: "#fecaca",
              padding: 14,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        ) : null}

        {showCreate ? (
          <form
            onSubmit={createOrganisation}
            className="tt-card"
            style={{ padding: 22, marginBottom: 24 }}
          >
            <h2 style={{ marginTop: 0 }}>
              Create organisation
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
              }}
            >
              <Field label="Organisation code">
                <input
                  className="tt-input"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="ABC"
                />
              </Field>

              <Field label="Trading name">
                <input
                  className="tt-input"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="ABC Contracting"
                />
              </Field>

              <Field label="Legal name">
                <input
                  className="tt-input"
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  placeholder="ABC Contracting Pty Ltd"
                />
              </Field>

              <Field label="ABN">
                <input
                  className="tt-input"
                  value={abn}
                  onChange={(event) => setAbn(event.target.value)}
                  placeholder="11 digit ABN"
                />
              </Field>

              <Field label="Initial admin email">
                <input
                  className="tt-input"
                  type="email"
                  required
                  value={initialAdminEmail}
                  onChange={(event) =>
                    setInitialAdminEmail(event.target.value)
                  }
                  placeholder="admin@contractor.com.au"
                />
              </Field>

              <Field label="Subscription">
                <select
                  className="tt-select"
                  required
                  value={planVersionId}
                  onChange={(event) =>
                    setPlanVersionId(event.target.value)
                  }
                >
                  <option value="" disabled>
                    Select subscription
                  </option>

                  {plans.map((plan) => (
                    <option
                      key={plan.planVersionId}
                      value={plan.planVersionId}
                    >
                      {plan.planName} v{plan.version}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 20,
              }}
            >
              <button
                className="tt-button"
                type="button"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>

              <button
                className="tt-button tt-button-primary"
                type="submit"
                disabled={submitting || !planVersionId}
              >
                {submitting ? "Creating..." : "Create organisation"}
              </button>
            </div>
          </form>
        ) : null}

        <section className="tt-card" style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid #1e293b",
              fontWeight: 700,
            }}
          >
            Organisations
          </div>
          <input className="tt-input" aria-label="Search organisations" placeholder="Search organisation name or code..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ margin:12,width:"calc(100% - 24px)" }} />

          {loading ? (
            <div style={{ padding: 36, color: "#94a3b8" }}>
              Loading...
            </div>
          ) : organisations.length === 0 ? (
            <div style={{ padding: 36, color: "#94a3b8" }}>
              No organisations yet.
            </div>
          ) : (
            organisations.map((organisation) => (
              <Link
                key={organisation.id}
                href={`/platform-admin/organisations/${organisation.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 2fr) 1fr 1fr 1fr 34px",
                  gap: 14,
                  alignItems: "center",
                  padding: "10px 14px",
                  borderBottom: "1px solid #1e293b",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {organisation.name}{" "}
                    <span
                      style={{
                        color: "#94a3b8",
                        fontSize: 12,
                      }}
                    >
                      ({organisation.code})
                    </span>
                  </div>

                  <div
                    style={{
                      color: "#64748b",
                      fontSize: 12,
                      marginTop: 3,
                    }}
                  >
                    Setup: {organisation.setupStatus ?? "Not started"} / Modules: {organisation.enabledModules?.join(", ") || "None"} / Created: {new Date(organisation.createdAt).toLocaleDateString("en-AU")}
                  </div>
                </div>

                <div>
                  <SmallLabel>Status</SmallLabel>
                  <div style={{ textTransform: "capitalize" }}>
                    {organisation.status}
                  </div>
                </div>

                <div>
                  <SmallLabel>Subscription</SmallLabel>
                  <div>{organisation.planName ?? "None"}</div>
                </div>

                <div>
                  <SmallLabel>Users / Projects</SmallLabel>
                  <div>
                    {organisation.userCount} / {organisation.projectCount}
                  </div>
                </div>

                <ChevronRight size={18} />
              </Link>
            ))
          )}
          <div style={{ padding:12,display:"flex",gap:12,alignItems:"center" }}>
            <span>{total} organisations / Page {page}</span>
            <button className="tt-button" disabled={page === 1 || loading} onClick={() => setPage(page-1)}>Previous</button>
            <button className="tt-button" disabled={page*25 >= total || loading} onClick={() => setPage(page+1)}>Next</button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <div
        style={{
          marginBottom: 6,
          color: "#cbd5e1",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {label}
      </div>

      {children}
    </label>
  );
}

function SmallLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        color: "#64748b",
        textTransform: "uppercase",
        fontSize: 10,
        letterSpacing: 0.6,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}