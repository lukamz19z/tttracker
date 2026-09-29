"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { tt } from "@/components/ui/tt-ui";

export type EmployeeSearchValue = {
  id: string;
  displayName: string;
  employeeNumber?: string | null;
  email?: string | null;
};

type Props = {
  organisationId: string;
  projectId: string;
  label?: string;
  value?: EmployeeSearchValue | null;
  onChange: (value: EmployeeSearchValue | null) => void;
  placeholder?: string;
};

export default function EmployeeSearch({
  organisationId,
  projectId,
  label = "Employee",
  value,
  onChange,
  placeholder = "Search employee...",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EmployeeSearchValue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);

      const params = new URLSearchParams({
        organisation: organisationId,
        q: query.trim(),
      });

      const response = await fetch(
        `/api/projects/${projectId}/people/search?${params.toString()}`,
        { cache: "no-store" },
      );

      const payload = await response.json();

      if (response.ok) {
        setResults(
          (payload.people ?? []).map(
            (person: {
              id: string;
              display_name: string;
              employee_number?: string | null;
              email?: string | null;
            }) => ({
              id: person.id,
              displayName: person.display_name,
              employeeNumber: person.employee_number ?? null,
              email: person.email ?? null,
            }),
          ),
        );
      }

      setLoading(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [organisationId, projectId, query, value]);

  return (
    <div className={tt.field} style={{ position: "relative" }}>
      <span className={tt.label}>{label}</span>

      {value ? (
        <div
          className={tt.notice}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ color: "#f8fafc", fontWeight: 800 }}>
              {value.displayName}
            </div>
            <div className={tt.secondary}>
              {[value.employeeNumber, value.email]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>

          <button
            type="button"
            className={tt.button}
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            aria-label="Clear employee"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div style={{ position: "relative" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#64748b",
              }}
            />
            <input
              className="tt-input"
              style={{ paddingLeft: 34 }}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
            />
          </div>

          {query.trim().length >= 2 ? (
            <div
              className={tt.card}
              style={{
                position: "absolute",
                zIndex: 30,
                left: 0,
                right: 0,
                top: "calc(100% + 6px)",
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {loading ? (
                <div style={{ padding: 12, color: "#94a3b8", fontSize: 12 }}>
                  Searching...
                </div>
              ) : results.length > 0 ? (
                results.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => {
                      onChange(person);
                      setQuery("");
                      setResults([]);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "11px 13px",
                      border: 0,
                      borderBottom: "1px solid #1e293b",
                      background: "transparent",
                      color: "#e2e8f0",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800 }}>
                      {person.displayName}
                    </div>
                    <div className={tt.secondary}>
                      {[person.employeeNumber, person.email]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </button>
                ))
              ) : (
                <div style={{ padding: 12, color: "#64748b", fontSize: 12 }}>
                  No matching employees.
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
