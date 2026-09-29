import "server-only";

import { notFound } from "next/navigation";

import { requireProjectContext } from "@/lib/projects/project-context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function requireTowerContext(
  projectId: string,
  towerId: string,
  organisationId?: string | null,
) {
  const projectContext =
    await requireProjectContext(
      projectId,
      organisationId,
    );

  const admin =
    createSupabaseAdmin();

  const { data: tower, error } =
    await admin
      .from("v2_towers")
      .select(`
        id,
        organisation_id,
        project_id,
        tower_identifier,
        sequence_number,
        status,
        description,
        tower_type_id,
        configuration,
        extra_data,
        line,
        tower_weight_t,
        assembly_percent,
        erection_percent,
        v2_tower_types (
          id,
          name,
          type_code,
          configuration
        )
      `)
      .eq("id", towerId)
      .eq(
        "project_id",
        projectId,
      )
      .maybeSingle();

  if (error || !tower) {
    notFound();
  }

  const [
    { data: definitions },
    { data: values },
    { data: sectionDefinitions },
    { data: orgOverrides },
    { data: projectOverrides },
  ] = await Promise.all([
    admin
      .from(
        "v2_tower_field_definitions",
      )
      .select(`
        id,
        field_key,
        label,
        field_type,
        required,
        sort_order,
        options,
        placeholder,
        help_text
      `)
      .eq(
        "project_id",
        projectId,
      )
      .eq("is_active", true)
      .order("sort_order"),

    admin
      .from(
        "v2_tower_field_values",
      )
      .select(`
        field_definition_id,
        value
      `)
      .eq(
        "tower_id",
        towerId,
      ),

    admin
      .from(
        "v2_section_definitions",
      )
      .select(`
        section_key,
        label,
        route_segment,
        module_key,
        sort_order,
        implementation_status,
        default_enabled
      `)
      .eq("scope", "tower")
      .neq(
        "implementation_status",
        "disabled",
      )
      .order("sort_order"),

    admin
      .from(
        "v2_organisation_section_settings",
      )
      .select(`
        section_key,
        enabled,
        label_override,
        sort_order_override
      `)
      .eq(
        "organisation_id",
        projectContext.workspace
          .organisation
          .organisationId,
      ),

    admin
      .from(
        "v2_project_section_settings",
      )
      .select(`
        section_key,
        enabled,
        label_override,
        sort_order_override
      `)
      .eq(
        "project_id",
        projectId,
      ),
  ]);

  const valueMap = new Map(
    (values ?? []).map(
      (row) => [
        row.field_definition_id,
        row.value,
      ],
    ),
  );

  type SectionOverride = {
    section_key: string;
    enabled: boolean;
    label_override: string | null;
    sort_order_override: number | null;
  };

  const orgMap = new Map<string, SectionOverride>(
    ((orgOverrides ?? []) as SectionOverride[]).map(
      (row) => [
        row.section_key,
        row,
      ],
    ),
  );

  const projectMap = new Map<string, SectionOverride>(
    ((projectOverrides ?? []) as SectionOverride[]).map(
      (row) => [
        row.section_key,
        row,
      ],
    ),
  );

  const towerSections =
    (sectionDefinitions ?? [])
      .filter(
        (definition) => {
          const projectOverride =
            projectMap.get(
              definition.section_key,
            );

          const orgOverride =
            orgMap.get(
              definition.section_key,
            );

          const enabled =
            projectOverride?.enabled ??
            orgOverride?.enabled ??
            definition.default_enabled;

          const moduleAllowed =
            !definition.module_key ||
            projectContext.workspace.enabledModules.has(
              definition.module_key,
            );

          return (
            enabled &&
            moduleAllowed &&
            definition.implementation_status ===
              "ready"
          );
        },
      )
      .map(
        (definition) => {
          const projectOverride =
            projectMap.get(
              definition.section_key,
            );

          const orgOverride =
            orgMap.get(
              definition.section_key,
            );

          return {
            key:
              definition.section_key,
            label:
              projectOverride?.label_override ??
              orgOverride?.label_override ??
              definition.label,
            routeSegment:
              definition.route_segment ??
              "",
            sortOrder:
              projectOverride?.sort_order_override ??
              orgOverride?.sort_order_override ??
              definition.sort_order,
          };
        },
      )
      .sort(
        (a, b) =>
          a.sortOrder -
          b.sortOrder,
      );

  return {
    ...projectContext,
    tower,
    towerSections,
    fields: (definitions ?? []).map(
      (definition) => ({
        id: definition.id,
        fieldKey:
          definition.field_key,
        label:
          definition.label,
        fieldType:
          definition.field_type,
        required:
          definition.required,
        sortOrder:
          definition.sort_order,
        options:
          Array.isArray(
            definition.options,
          )
            ? definition.options
            : [],
        placeholder:
          definition.placeholder,
        helpText:
          definition.help_text,
        value:
          valueMap.get(
            definition.id,
          ) ?? null,
      }),
    ),
  };
}
