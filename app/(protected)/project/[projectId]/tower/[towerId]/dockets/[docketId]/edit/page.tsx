"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
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
  const [delays, setDelays] = useState<any[]>([]);
  const [plant, setPlant] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    const [
      docketRes,
      labourRes,
      progressRes,
      delaysRes,
      plantRes,
    ] = await Promise.all([
      supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("id", docketId)
        .single(),

      supabase
        .from("tower_docket_labour")
        .select("*")
        .eq("docket_id", docketId),

      supabase
        .from("tower_docket_progress")
        .select("*")
        .eq("docket_id", docketId),

      supabase
        .from("tower_docket_delays")
        .select("*")
        .eq("docket_id", docketId),

      supabase
        .from("tower_docket_plant")
        .select("*")
        .eq("docket_id", docketId),
    ]);

    setDocket(docketRes.data);
    setLabour(labourRes.data || []);
    setProgress(progressRes.data || []);
    setDelays(delaysRes.data || []);
    setPlant(plantRes.data || []);

    setLoading(false);
  }, [supabase, docketId]);

useEffect(() => {
  const timer = window.setTimeout(() => {
    void load();
  }, 0);

  return () => window.clearTimeout(timer);
}, [load]);

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
      initialDelayRows={delays}
      initialPlantRows={plant}
    />
  );
}