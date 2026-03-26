"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import DailyDocketForm from "@/components/dockets/DailyDocketForm";

export default function EditDocketPage() {
  const params = useParams();
  const supabase = createSupabaseBrowser();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const docketId = params.docketId as string;

  const [loading, setLoading] = useState(true);
  const [docket, setDocket] = useState<any>(null);
  const [labour, setLabour] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    // MAIN DOCKET
    const { data: docketData } = await supabase
      .from("tower_daily_dockets")
      .select("*")
      .eq("id", docketId)
      .single();

    // LABOUR
    const { data: labourData } = await supabase
      .from("tower_docket_labour")
      .select("*")
      .eq("docket_id", docketId);

    // PROGRESS
    const { data: progressData } = await supabase
      .from("tower_docket_progress")
      .select("*")
      .eq("docket_id", docketId);

    setDocket(docketData);
    setLabour(labourData || []);
    setProgress(progressData || []);

    setLoading(false);
  }

  if (loading) return <div className="p-8">Loading docket...</div>;

  return (
    <DailyDocketForm
      mode="edit"
      projectId={projectId}
      towerId={towerId}
      docketId={docketId}
      initialDocket={docket}
      initialLabourRows={labour}
      initialProgressRows={progress}
    />
  );
}