import { createSupabaseBrowser } from "@/lib/supabase";

export async function recalcTowerProgress(towerId: string) {
  const supabase = createSupabaseBrowser();

  const { data, error } = await supabase
    .from("tower_daily_dockets")
    .select("assembly_percent, erection_percent, docket_date")
    .eq("tower_id", towerId)
    .order("docket_date", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    await supabase
      .from("towers")
      .update({
        progress: 0,
        status: "Not Started",
        updated_at: new Date().toISOString(),
      })
      .eq("id", towerId);
    return;
  }

  const latest = data[0];

  const assembly = Number(latest.assembly_percent || 0);
  const erection = Number(latest.erection_percent || 0);

  const progress = Math.round((assembly * 0.5) + (erection * 0.5));

  let status = "Not Started";
  if (progress > 0 && progress < 100) status = "In Progress";
  if (progress >= 100) status = "Complete";

  await supabase
    .from("towers")
    .update({
      progress,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", towerId);
}