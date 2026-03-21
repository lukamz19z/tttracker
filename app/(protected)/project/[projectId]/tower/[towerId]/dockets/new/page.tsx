"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type LabourRow = {
  worker_name: string;
  time_in: string;
  time_out: string;
  total_hours: string;
};

type ProgressRow = {
  section_label: string;
  assembled_percent: string;
  erected_percent: string;
};

const DEFAULT_PROGRESS_ROWS: ProgressRow[] = [
  { section_label: "Legs", assembled_percent: "", erected_percent: "" },
  { section_label: "Body Extensions", assembled_percent: "", erected_percent: "" },
  { section_label: "Common Body", assembled_percent: "", erected_percent: "" },
  { section_label: "Superstructure", assembled_percent: "", erected_percent: "" },
  { section_label: "Crossarms", assembled_percent: "", erected_percent: "" },
];

export default function NewDailyDocketPage() {
  const params = useParams();
  const router = useRouter();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [docketDate, setDocketDate] = useState("");
  const [crewName, setCrewName] = useState("");
  const [leadingHand, setLeadingHand] = useState("");
  const [weather, setWeather] = useState("");

  const [weatherDelayHours, setWeatherDelayHours] = useState("");
  const [lightningDelayHours, setLightningDelayHours] = useState("");
  const [toolboxDelayHours, setToolboxDelayHours] = useState("");
  const [otherDelayHours, setOtherDelayHours] = useState("");
  const [otherDelayReason, setOtherDelayReason] = useState("");
  const [missingItemsBolts, setMissingItemsBolts] = useState("");
  const [delaysComments, setDelaysComments] = useState("");
  const [bcRepName, setBcRepName] = useState("");
  const [clientRepName, setClientRepName] = useState("");
  const [signedDate, setSignedDate] = useState("");
  const [docketFile, setDocketFile] = useState<File | null>(null);

  const [labourRows, setLabourRows] = useState<LabourRow[]>([
    { worker_name: "", time_in: "", time_out: "", total_hours: "" },
  ]);

  const [progressRows, setProgressRows] =
    useState<ProgressRow[]>(DEFAULT_PROGRESS_ROWS);

  const [saving, setSaving] = useState(false);

  const totalAssemblyPercent = useMemo(() => {
    const total = progressRows.reduce(
      (sum, r) => sum + Number(r.assembled_percent || 0),
      0
    );
    return Math.min(total, 100);
  }, [progressRows]);

  const totalErectionPercent = useMemo(() => {
    const total = progressRows.reduce(
      (sum, r) => sum + Number(r.erected_percent || 0),
      0
    );
    return Math.min(total, 100);
  }, [progressRows]);

  const displayProgress = Math.max(
    totalAssemblyPercent,
    totalErectionPercent
  );

  function updateProgressRow(
    index: number,
    key: keyof ProgressRow,
    value: string
  ) {
    setProgressRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: value } : row
      )
    );
  }

  async function handleSubmit() {
    const supabase = createSupabaseBrowser();

    await supabase.from("tower_daily_dockets").insert({
      project_id: projectId,
      tower_id: towerId,
      docket_date: docketDate,
      crew: crewName,
      leading_hand: leadingHand,
      weather,
      assembly_percent: totalAssemblyPercent,
      erection_percent: totalErectionPercent,
    });

    await supabase
      .from("towers")
      .update({
        progress: displayProgress,
      })
      .eq("id", towerId);

    router.push(`/project/${projectId}/tower/${towerId}`);
  }

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <h1 className="text-3xl font-bold">Add Daily Docket</h1>

      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Section Progress %</h2>

        <table className="w-full border rounded-xl overflow-hidden">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3 text-left">Section</th>
              <th className="p-3 text-left">Assembly %</th>
              <th className="p-3 text-left">Erection %</th>
            </tr>
          </thead>
          <tbody>
            {progressRows.map((row, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">{row.section_label}</td>

                <td className="p-3">
                  <input
                    type="number"
                    className="border rounded-lg p-2 w-full"
                    value={row.assembled_percent}
                    onChange={(e) =>
                      updateProgressRow(
                        i,
                        "assembled_percent",
                        e.target.value
                      )
                    }
                  />
                </td>

                <td className="p-3">
                  <input
                    type="number"
                    className="border rounded-lg p-2 w-full"
                    value={row.erected_percent}
                    onChange={(e) =>
                      updateProgressRow(
                        i,
                        "erected_percent",
                        e.target.value
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end gap-10 bg-slate-50 p-4 rounded-xl">
          <div>
            <p className="text-sm text-slate-500">
              Total Assembly
            </p>
            <p className="text-2xl font-bold">
              {totalAssemblyPercent}%
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Total Erection
            </p>
            <p className="text-2xl font-bold">
              {totalErectionPercent}%
            </p>
          </div>
        </div>
      </section>

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="bg-blue-600 text-white px-6 py-3 rounded-xl"
      >
        {saving ? "Saving..." : "Save Daily Docket"}
      </button>
    </div>
  );
}