import { createSupabaseBrowser } from "@/lib/supabase";

export async function syncTowerItcFromTemplate(
  projectId: string,
  towerId: string
) {
  const supabase = createSupabaseBrowser();

  const { data: templates, error: templateError } = await supabase
    .from("project_itc_templates")
    .select("*")
    .eq("project_id", projectId)
    .order("stage", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("item_no", { ascending: true });

  if (templateError) throw templateError;

  const { data: existingRows, error: existingError } = await supabase
    .from("tower_itc_register")
    .select("template_id")
    .eq("tower_id", towerId);

  if (existingError) throw existingError;

  const existingTemplateIds = new Set(
    (existingRows || [])
      .map((r) => r.template_id)
      .filter(Boolean)
  );

  const rowsToInsert =
    templates
      ?.filter((t) => !existingTemplateIds.has(t.id))
      .map((t) => ({
        tower_id: towerId,
        template_id: t.id,
        stage: t.stage,
        item_no: t.item_no,
        sort_order: t.sort_order ?? 0,
        description: t.description,
        item_type: t.item_type,
        source_field: t.source_field,
        required: t.required,
        validation_status: "Pending",
      })) || [];

  if (rowsToInsert.length === 0) return;

  const { error: insertError } = await supabase
    .from("tower_itc_register")
    .insert(rowsToInsert);

  if (insertError) throw insertError;
}