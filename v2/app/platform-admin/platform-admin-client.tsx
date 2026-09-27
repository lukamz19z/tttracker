"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Building2,
  ChevronRight,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
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
        fetch("/api/platform/organisations", { cache: "no-store" }),
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
  }, []);

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

  const activeCount = organisations.filter(
    (item) => item.status === "active",
  ).length;

  return (
    <main style={{ minHeight: "100vh", padding: "32px 24px" }}>
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
              Platform Admin
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

            <button
              className="tt-button tt-button-primary"
              type="button"
              onClick={() => setShowCreate((current) => !current)}
            >
              <Plus
                size={16}
                style={{ verticalAlign: "middle", marginRight: 7 }}
              />
              New organisation
            </button>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <Stat
            label="Organisations"
            value={organisations.length}
            icon={<Building2 size={18} />}
          />

          <Stat
            label="Active"
            value={activeCount}
            icon={<ShieldCheck size={18} />}
          />

          <Stat
            label="Plans"
            value={plans.length}
            icon={<Users size={18} />}
          />
        </div>

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
              padding: "16px 18px",
              borderBottom: "1px solid #1e293b",
              fontWeight: 700,
            }}
          >
            Organisations
          </div>

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
                  padding: "16px 18px",
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
                    {organisation.legalName ?? "No legal name"}
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
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="tt-card" style={{ padding: 18 }}>
      <div
        style={{
          color: "#94a3b8",
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 13,
        }}
      >
        {icon}
        {label}
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          marginTop: 10,
        }}
      >
        {value}
      </div>
    </div>
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