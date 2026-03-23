import { createSupabaseBrowser } from "@/lib/supabase";

export async function recalcWorkpackCompletion(towerId: string) {
  const supabase = createSupabaseBrowser();

  const [{ data: itcRows, error: itcError }, { data: torqueRows, error: torqueError }] =
    await Promise.all([
      supabase
        .from("tower_itc_register")
        .select("id, item_type, required, validation_status")
        .eq("tower_id", towerId),
      supabase
        .from("tower_bolt_torque_records")
        .select("id, required_torque_min, required_torque_max, achieved_torque")
        .eq("tower_id", towerId),
    ]);

  if (itcError) throw itcError;
  if (torqueError) throw torqueError;

  const requiredItc = (itcRows || []).filter((r) => r.required !== false);
  const completeItc = requiredItc.filter((r) => {
    if (r.item_type === "numeric") return r.validation_status === "Y";
    if (r.item_type === "document") return r.validation_status === "Y";
    return r.validation_status === "Y" || r.validation_status === "NA";
  });

  const torqueTotal = (torqueRows || []).length;
  const torqueComplete = (torqueRows || []).filter((r) => {
    const achieved = Number(r.achieved_torque || 0);
    const min = Number(r.required_torque_min || 0);
    const max = Number(r.required_torque_max || 0);
    if (!min && !max) return false;
    return achieved >= min && achieved <= max;
  }).length;

  const totalRequired = requiredItc.length + torqueTotal;
  const totalComplete = completeItc.length + torqueComplete;

  const completion =
    totalRequired === 0 ? 0 : Math.round((totalComplete / totalRequired) * 100);

  let status = "Not Started";
  if (completion > 0 && completion < 100) status = "In Progress";
  if (completion >= 100) status = "Complete";

  const { error: towerUpdateError } = await supabase
    .from("towers")
    .update({
      workpack_completion: completion,
      workpack_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", towerId);

  if (towerUpdateError) throw towerUpdateError;
}