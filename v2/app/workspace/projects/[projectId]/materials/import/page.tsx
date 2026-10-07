import { FileSpreadsheet } from "lucide-react";

import { Page, PageHeader } from "@/components/ui/tt-ui";
import { materialsPageContext } from "@/lib/materials/page-access";
import MaterialsAccessDenied from "@/components/materials/access-denied";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

import { isRecord } from "@/lib/materials/import-validation";
import MaterialsImportClient from "./materials-import-client";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ organisation?: string; tower?: string }>;
};

export default async function MaterialsImportPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const query = await searchParams;
  const context = await materialsPageContext(projectId, query.organisation ?? null, "import");
  if (!context) return <MaterialsAccessDenied importing />;
  const organisationId = context.workspace.organisation.organisationId;
  const admin = createSupabaseAdmin();

  const [{ data: towers, error }, { data: sourceRoleOptions, error: optionError }, { data: profiles, error: profileError }] = await Promise.all([
    admin
      .from("v2_towers")
      .select("id,tower_identifier,line,tower_type_id,v2_tower_types(name,type_code)")
      .eq("project_id", projectId)
      .order("tower_identifier"),
    admin
      .from("v2_project_option_definitions")
      .select("option_key,label,settings,sort_order")
      .eq("project_id", projectId)
      .eq("option_group", "material_import_source_role")
      .eq("is_active", true)
      .order("sort_order"),
    admin.from("v2_material_import_profiles").select("name,mapping,defaults,source_type_key").eq("project_id", projectId).eq("is_active", true).order("updated_at", { ascending: false }),
  ]);

  if (error) throw new Error(error.message);
  if (optionError) throw new Error(optionError.message);
  if (profileError) throw new Error(profileError.message);

  return (
    <Page>
      <PageHeader
        eyebrow={<FileSpreadsheet size={14} />}
        title="Materials Data & Imports"
        subtitle="Choose a tower scope, upload once, map columns and apply Bundles, Members, Bolts or Packers. Add, Merge and Replace preserve operational history."
      />
      <MaterialsImportClient
        projectId={projectId}
        organisationId={organisationId}
        towers={((towers ?? []) as Array<Record<string, unknown>>).map((tower) => {
          const relation = tower.v2_tower_types;
          const towerType =
            Array.isArray(relation)
              ? (relation[0] as Record<string, unknown> | undefined)
              : (relation as Record<string, unknown> | null | undefined);

          return {
            id: String(tower.id ?? ""),
            tower_identifier: String(tower.tower_identifier ?? ""),
            tower_type:
              towerType?.type_code != null && String(towerType.type_code).trim()
                ? String(towerType.type_code)
                : towerType?.name != null && String(towerType.name).trim()
                  ? String(towerType.name)
                  : null,
            line: tower.line == null ? null : String(tower.line),
          };
        })}
        initialTowerId={query.tower ?? ""}
        importProfiles={(profiles ?? []).map(profile => ({ name: profile.name, sourceRole: profile.source_type_key,
          mapping: Object.fromEntries(Object.entries(isRecord(profile.mapping) ? profile.mapping : {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
          defaults: isRecord(profile.defaults) ? profile.defaults : {},
        }))}
        sourceRoleOptions={(sourceRoleOptions ?? []).map((option) => ({
          key: option.option_key,
          label: option.label,
          settings: option.settings as Record<string, unknown> | null,
        }))}
      />
    </Page>
  );
}
