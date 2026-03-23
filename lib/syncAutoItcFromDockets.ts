import { createSupabaseBrowser } from "@/lib/supabase";

function cleanIssueValue(value: string | null | undefined) {
  const v = (value || "").trim();
  if (!v) return "";
  if (v === "-" || v === "0") return "";
  return v;
}

export async function syncAutoItcFromDockets(towerId: string) {
  const supabase = createSupabaseBrowser();

  const { data: latestDocket, error: docketError } = await supabase
    .from("tower_daily_dockets")
    .select("*")
    .eq("tower_id", towerId)
    .order("docket_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docketError) throw docketError;

  const { data: autoRows, error: rowsError } = await supabase
    .from("tower_itc_register")
    .select("*")
    .eq("tower_id", towerId)
    .eq("item_type", "auto");

  if (rowsError) throw rowsError;

  for (const row of autoRows || []) {
    let nextStatus = row.validation_status || "Pending";
    let nextAutoValue = "";
    let nextComments = row.comments || "";

    if (row.source_field === "missing_items_bolts") {
      const value = cleanIssueValue(latestDocket?.missing_items_bolts);
      nextAutoValue = value || "";
      nextStatus = value ? "N" : "Pending";
      nextComments = value
        ? `Auto-flagged from latest daily docket: ${value}`
        : "";
    }

    if (row.source_field === "weather_delay_hours") {
      const delay = Number(latestDocket?.weather_delay_hours || 0);
      nextAutoValue = String(delay);
      nextStatus = delay > 0 ? "N" : "Pending";
      nextComments =
        delay > 0
          ? `Auto-flagged from latest daily docket weather delay: ${delay}h`
          : "";
    }

    const { error: updateError } = await supabase
      .from("tower_itc_register")
      .update({
        validation_status: nextStatus,
        auto_source_value: nextAutoValue,
        comments: nextComments,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updateError) throw updateError;
  }
}