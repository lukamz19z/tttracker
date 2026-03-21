"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import DailyDocketForm from "@/components/dockets/DailyDocketForm";

type Docket = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  weather_delay_hours: number | null;
  lightning_delay_hours: number | null;
  toolbox_delay_hours: number | null;
  other_delay_hours: number | null;
  other_delay_reason: string | null;
  delays_comments: string | null;
  missing_items_bolts: string | null;
  bc_rep_name: string | null;
  client_rep_name: string | null;
  signed_date: string | null;
  docket_file_url: string | null;
};

type LabourRow = {
  worker_name: string;
  time_in: string;
  time_out: string;
  total_hours: string;
};

type ProgressRow = {
  section_label: string;
  assembled_qty: string;
  erected_qty: string;
};

function isSignedDocket(docket: {
  client_rep_name?: string | null;
  signed_date?: string | null;
}) {
  return Boolean(
    docket.client_rep_name?.trim() && docket.signed_date && docket.signed_date.trim()
  );
}

export default function EditDailyDocketPage() {
  const params = useParams();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const docketId = params.docketId as string;

  const [loading, setLoading] = useState(true);
  const [docket, setDocket] = useState<Docket | null>(null);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [progressRows, setProgressRows] = useState<ProgressRow[]>([]);

  useEffect(() => {
    load();
  }, [docketId]);

  async function load() {
    setLoading(true);
    const supabase = createSupabaseBrowser();

    const { data: d } = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("id", docketId)
      .single();

    const { data: l } = await supabase
      .from("tower_docket_labour")
      .select("*")
      .eq("docket_id", docketId);

    const { data: p } = await supabase
      .from("tower_docket_progress")
      .select("*")
      .eq("docket_id", docketId);

    setDocket(d || null);

    setLabourRows(
      (l || []).length > 0
        ? (l || []).map((row) => ({
            worker_name: row.worker_name || "",
            time_in: row.time_in || "",
            time_out: row.time_out || "",
            total_hours: row.total_hours !== null ? String(row.total_hours) : "",
          }))
        : [{ worker_name: "", time_in: "", time_out: "", total_hours: "" }]
    );

    setProgressRows(
      (p || []).length > 0
        ? (p || []).map((row) => ({
            section_label: row.section_label || row.section || "",
            assembled_qty: row.assembled_qty !== null ? String(row.assembled_qty) : "",
            erected_qty: row.erected_qty !== null ? String(row.erected_qty) : "",
          }))
        : []
    );

    setLoading(false);
  }

  if (loading) return <div className="p-8">Loading docket...</div>;
  if (!docket) return <div className="p-8">Docket not found.</div>;

  if (isSignedDocket(docket)) {
    return (
      <div className="p-8 max-w-3xl space-y-4">
        <div className="border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-2xl p-4">
          This docket has already been signed and cannot be edited.
        </div>
      </div>
    );
  }

  return (
    <DailyDocketForm
      mode="edit"
      projectId={projectId}
      towerId={towerId}
      docketId={docketId}
      initialDocket={docket}
      initialLabourRows={labourRows}
      initialProgressRows={progressRows}
    />
  );
}