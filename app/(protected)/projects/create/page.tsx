"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type CreateProjectResponse = {
  success?: boolean;
  projectId?: string;
  projectNumber?: string;
  error?: string;
  sharePoint?: {
    siteId?: string;
    driveId?: string;
    folderId?: string;
    url?: string | null;
  };
};

function buildProjectNumber(
  clientCode: string,
  year: string,
  sequence: string,
) {
  const cleanClient = clientCode.trim().toUpperCase();
  const cleanYear = year.trim().slice(-2);

  const sequenceNumber = Number(sequence || 1);

  if (
    !cleanClient ||
    !cleanYear ||
    !Number.isFinite(sequenceNumber) ||
    sequenceNumber < 1
  ) {
    return "";
  }

  const cleanSequence = String(sequenceNumber).padStart(3, "0");

  return `P-${cleanClient}-${cleanYear}-${cleanSequence}`;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const currentYear = new Date().getFullYear();

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [projectYear, setProjectYear] = useState(String(currentYear));
  const [projectSequence, setProjectSequence] = useState("1");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("ongoing");
  const [totalTowers, setTotalTowers] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const projectNumber = useMemo(() => {
    return buildProjectNumber(
      clientCode,
      projectYear,
      projectSequence,
    );
  }, [clientCode, projectYear, projectSequence]);

  async function createProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setMsg("");

    try {
      // Confirm the browser still has an authenticated TTTracker session.
      // The API route performs its own server-side authentication as well.
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMsg("You must be logged in.");
        return;
      }

      const cleanName = name.trim();
      const cleanClient = client.trim();
      const cleanClientCode = clientCode.trim().toUpperCase();
      const cleanLocation = location.trim();

      const numericYear = Number(projectYear);
      const numericSequence = Number(projectSequence);

      const numericTotalTowers =
        totalTowers.trim() === ""
          ? null
          : Number(totalTowers);

      if (!cleanName) {
        setMsg("Project name is required.");
        return;
      }

      if (!cleanClientCode) {
        setMsg("Client code is required.");
        return;
      }

      if (
        !Number.isInteger(numericYear) ||
        numericYear < 2000 ||
        numericYear > 2100
      ) {
        setMsg("Enter a valid project year.");
        return;
      }

      if (
        !Number.isInteger(numericSequence) ||
        numericSequence < 1
      ) {
        setMsg("Enter a valid project sequence.");
        return;
      }

      if (
        numericTotalTowers !== null &&
        (!Number.isFinite(numericTotalTowers) ||
          numericTotalTowers < 0)
      ) {
        setMsg("Total towers must be a valid number.");
        return;
      }

      const calculatedProjectNumber = buildProjectNumber(
        cleanClientCode,
        projectYear,
        projectSequence,
      );

      if (!calculatedProjectNumber) {
        setMsg("Could not generate the project number.");
        return;
      }

      const response = await fetch("/api/projects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cleanName,
          client: cleanClient,
          clientCode: cleanClientCode,
          projectYear: numericYear,
          projectSequence: numericSequence,
          location: cleanLocation,
          status,
          totalTowers: numericTotalTowers,
        }),
      });

      let result: CreateProjectResponse;

      try {
        result =
          (await response.json()) as CreateProjectResponse;
      } catch {
        setMsg(
          "The project creation service returned an invalid response.",
        );
        return;
      }

      if (!response.ok) {
        setMsg(
          result.error ||
            "The project could not be created.",
        );
        return;
      }

      if (!result.projectId) {
        setMsg(
          "The project was created but no project ID was returned.",
        );
        return;
      }

      router.push(`/project/${result.projectId}`);
      router.refresh();
    } catch (error) {
      console.error("CREATE PROJECT CLIENT ERROR:", error);

      setMsg(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while creating the project.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-xl rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">
          New Project
        </h2>

        <form
          onSubmit={createProject}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Project Name
            </label>

            <input
              className="w-full rounded border p-2"
              placeholder="Project Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Client
            </label>

            <input
              className="w-full rounded border p-2"
              placeholder="Client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Client Code
              </label>

              <input
                className="w-full rounded border p-2 uppercase"
                placeholder="UGL"
                value={clientCode}
                onChange={(e) =>
                  setClientCode(
                    e.target.value.toUpperCase(),
                  )
                }
                disabled={loading}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Year
              </label>

              <input
                className="w-full rounded border p-2"
                placeholder="2026"
                type="number"
                min="2000"
                max="2100"
                value={projectYear}
                onChange={(e) =>
                  setProjectYear(e.target.value)
                }
                disabled={loading}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Project No.
              </label>

              <input
                className="w-full rounded border p-2"
                placeholder="1"
                type="number"
                min="1"
                step="1"
                value={projectSequence}
                onChange={(e) =>
                  setProjectSequence(e.target.value)
                }
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">
              Project Number
            </p>

            <p className="mt-1 font-semibold text-slate-900">
              {projectNumber || "P-CLIENT-YY-001"}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              This number will also be used for the
              SharePoint project folder.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Location
            </label>

            <input
              className="w-full rounded border p-2"
              placeholder="Location"
              value={location}
              onChange={(e) =>
                setLocation(e.target.value)
              }
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Total Towers
            </label>

            <input
              className="w-full rounded border p-2"
              placeholder="Total Towers"
              type="number"
              min="0"
              value={totalTowers}
              onChange={(e) =>
                setTotalTowers(e.target.value)
              }
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Project Status
            </label>

            <select
              className="w-full rounded border p-2"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value)
              }
              disabled={loading}
            >
              <option value="tendering">
                Tendering
              </option>

              <option value="mobilising">
                Mobilising
              </option>

              <option value="ongoing">
                Ongoing
              </option>

              <option value="demobilising">
                Demobilising
              </option>

              <option value="completed">
                Completed
              </option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Creating Project & SharePoint..."
              : "Create Project"}
          </button>
        </form>

        {msg && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">
              {msg}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}